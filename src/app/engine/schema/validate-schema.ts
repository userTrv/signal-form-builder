import { compile } from '../expr';
import { getNamedValidator } from '../model/validators';
import { MockBackend, mockBackend } from '../model/mock-backend';
import { DEFAULT_KINDS, FieldKindRegistry } from './field-kinds';
import { StaticScope, bindRef, checkRefTail, makeScope, scopeNodes } from './walk';
import { FieldNode, FormSchema, KeyedNode, SchemaNode, isGroup, isRepeat, isStep } from './types';

export interface SchemaIssue {
  readonly severity: 'error' | 'warning';
  /** JSON-path-like location, e.g. `fields[1].rules.min`. */
  readonly path: string;
  /** Index path of the node the issue belongs to (for selecting it in the builder). */
  readonly nodePath: readonly number[];
  readonly message: string;
}

export type SchemaValidationResult =
  | { readonly ok: true; readonly schema: FormSchema; readonly issues: readonly SchemaIssue[] }
  | {
      readonly ok: false;
      readonly issues: readonly SchemaIssue[];
      /** `structure`: not renderable at all; `semantics`: well-formed but has errors. */
      readonly stage: 'structure' | 'semantics';
    };

export interface ValidateOptions {
  readonly kinds?: FieldKindRegistry;
  readonly backend?: MockBackend;
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set(['true', 'false', 'null', 'in']);
const CONTAINERS = new Set(['group', 'repeat', 'step']);

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Validates untrusted JSON (imported file, JSON editor, localStorage) against the schema
 * format, including semantic checks a JSON Schema could not express: expression syntax,
 * references to unknown fields, computed-field cycles, duplicate keys per scope.
 */
export function validateSchema(input: unknown, options: ValidateOptions = {}): SchemaValidationResult {
  const kinds = options.kinds ?? DEFAULT_KINDS;
  const backend = options.backend ?? mockBackend;
  const issues: SchemaIssue[] = [];
  const add = (path: string, nodePath: readonly number[], message: string, severity: SchemaIssue['severity'] = 'error'): void => {
    issues.push({ severity, path, nodePath, message });
  };

  if (!isObj(input)) {
    add('', [], 'Schema must be a JSON object');
    return { ok: false, issues, stage: 'structure' };
  }
  if (input['$schema'] !== undefined && input['$schema'] !== 'sfb/v1') {
    add('$schema', [], `Unsupported schema version "${String(input['$schema'])}" (expected "sfb/v1")`);
  }
  if (typeof input['id'] !== 'string' || !input['id'].trim()) add('id', [], '"id" must be a non-empty string');
  if (typeof input['title'] !== 'string' || !input['title'].trim()) add('title', [], '"title" must be a non-empty string');
  if (!Array.isArray(input['fields'])) {
    add('fields', [], '"fields" must be an array');
    return { ok: false, issues, stage: 'structure' };
  }
  const rootFields = input['fields'] as unknown[];
  if (!rootFields.length) add('fields', [], 'The form has no fields yet', 'warning');

  // Structural pass first: later passes assume well-formed nodes.
  const structuralErrors = issues.filter((i) => i.severity === 'error').length;
  checkNodes(rootFields, 'fields', [], true);
  if (issues.filter((i) => i.severity === 'error').length > structuralErrors) return { ok: false, issues, stage: 'structure' };

  const schema = input as unknown as FormSchema;
  const stepCount = schema.fields.filter((n) => n.type === 'step').length;
  if (stepCount && stepCount !== schema.fields.length) {
    add('fields', [], 'Either every top-level node is a step (wizard) or none is');
  }
  checkSemantics(schema);

  const ok = !issues.some((i) => i.severity === 'error');
  return ok ? { ok, schema, issues } : { ok, issues, stage: 'semantics' };

  // ---- structural checks -------------------------------------------------------------

  function checkNodes(nodes: unknown[], path: string, nodePath: number[], root: boolean): void {
    nodes.forEach((raw, i) => {
      const p = `${path}[${i}]`;
      const np = [...nodePath, i];
      if (!isObj(raw)) return add(p, np, 'Node must be an object');
      const type = raw['type'];
      if (typeof type !== 'string') return add(`${p}.type`, np, '"type" must be a string');
      if (!CONTAINERS.has(type) && !kinds.has(type)) return add(`${p}.type`, np, `Unknown field type "${type}"`);
      if (type === 'step') {
        if (!root) add(p, np, 'Steps are only allowed at the top level');
        if (typeof raw['id'] !== 'string' || !raw['id']) add(`${p}.id`, np, 'Step needs an "id"');
        if (typeof raw['title'] !== 'string' || !raw['title']) add(`${p}.title`, np, 'Step needs a "title"');
      } else {
        const key = raw['key'];
        if (typeof key !== 'string' || !KEY_RE.test(key) || RESERVED.has(key)) {
          add(`${p}.key`, np, `"key" must be an identifier (letters, digits, _) — got ${JSON.stringify(key)}`);
        }
        if (typeof raw['label'] !== 'string' || !raw['label'].trim()) add(`${p}.label`, np, 'Field needs a "label"');
      }
      if (CONTAINERS.has(type)) {
        if (!Array.isArray(raw['fields'])) return add(`${p}.fields`, np, `A ${type} needs a "fields" array`);
        if (!(raw['fields'] as unknown[]).length) add(`${p}.fields`, np, `This ${type} is empty`, 'warning');
        checkNodes(raw['fields'] as unknown[], `${p}.fields`, np, false);
      }
    });
  }

  // ---- semantic checks ---------------------------------------------------------------

  function checkSemantics(s: FormSchema): void {
    const computedDeps = new Map<KeyedNode, KeyedNode[]>();
    const stepIds = new Set<string>();

    const expr = (src: unknown, path: string, np: readonly number[], chain: readonly StaticScope[], deps?: KeyedNode[]) => {
      if (src === undefined) return;
      if (typeof src !== 'string' || !src.trim()) return add(path, np, 'Expression must be a non-empty string');
      const result = compile(src);
      if (!result.ok) return add(path, np, `${result.error.message} (at ${result.error.start + 1})`);
      for (const ref of result.refs) {
        const bound = bindRef(chain, ref);
        if (!bound) {
          add(path, np, `Unknown field "${ref[0]}"`);
          continue;
        }
        const tailError = checkRefTail(bound.node, bound.rest);
        if (tailError) add(path, np, tailError);
        deps?.push(bound.node);
      }
    };

    const visit = (nodes: readonly SchemaNode[], path: string, np: readonly number[], chain: readonly StaticScope[]) => {
      const seen = new Map<string, string>();
      const dup = (key: string, p: string, n: readonly number[]) => {
        if (seen.has(key)) add(`${p}.key`, n, `Duplicate key "${key}" in this scope (also at ${seen.get(key)})`);
        else seen.set(key, p);
      };
      const walkLevel = (level: readonly SchemaNode[], lp: string, lnp: readonly number[]) =>
        level.forEach((node, i) => {
          const p = `${lp}[${i}]`;
          const n = [...lnp, i];
          expr(node.visibleWhen, `${p}.visibleWhen`, n, chain);
          expr(node.enabledWhen, `${p}.enabledWhen`, n, chain);
          if (isStep(node)) {
            if (stepIds.has(node.id)) add(`${p}.id`, n, `Duplicate step id "${node.id}"`);
            stepIds.add(node.id);
            walkLevel(node.fields, `${p}.fields`, n);
            return;
          }
          dup(node.key, p, n);
          if (isGroup(node) || isRepeat(node)) {
            const inner = [...chain, makeScope(node.fields)];
            if (isRepeat(node)) {
              const { minItems: min, maxItems: max } = node;
              if (min !== undefined && (!Number.isInteger(min) || min < 0)) add(`${p}.minItems`, n, 'minItems must be a non-negative integer');
              if (max !== undefined && (!Number.isInteger(max) || max < 1)) add(`${p}.maxItems`, n, 'maxItems must be a positive integer');
              if (isNum(min) && isNum(max) && min > max) add(`${p}.minItems`, n, 'minItems is greater than maxItems');
            }
            (node.checks ?? []).forEach((c, ci) => {
              const cp = `${p}.checks[${ci}]`;
              expr(c.assert, `${cp}.assert`, n, inner);
              expr(c.when, `${cp}.when`, n, inner);
              if (!scopeNodes(node.fields).some((f) => f.key === c.target)) add(`${cp}.target`, n, `Unknown target "${c.target}"`);
              if (typeof c.message !== 'string' || !c.message) add(`${cp}.message`, n, 'Check needs a message');
            });
            visit(node.fields, `${p}.fields`, n, inner);
            return;
          }
          checkField(node as FieldNode, p, n, chain);
        });
      walkLevel(nodes, path, np);
    };

    const checkField = (field: FieldNode, p: string, n: readonly number[], chain: readonly StaticScope[]) => {
      const spec = kinds.get(field.type);
      if (!spec) return;
      const r = field.rules;
      if (r !== undefined && (typeof r !== 'object' || r === null || Array.isArray(r))) return add(`${p}.rules`, n, '"rules" must be an object');
      if (r) {
        const builtIns = ['required', 'min', 'max', 'minLength', 'maxLength', 'pattern'] as const;
        for (const rule of builtIns) {
          if (r[rule] !== undefined && !spec.rules.includes(rule)) {
            add(`${p}.rules.${rule}`, n, `"${rule}" does not apply to ${field.type} fields`, 'warning');
          }
        }
        for (const k of ['min', 'max', 'minLength', 'maxLength'] as const) {
          if (r[k] !== undefined && !isNum(r[k])) add(`${p}.rules.${k}`, n, `"${k}" must be a number`);
        }
        if (isNum(r.min) && isNum(r.max) && r.min > r.max) add(`${p}.rules.min`, n, 'min is greater than max');
        if (isNum(r.minLength) && isNum(r.maxLength) && r.minLength > r.maxLength) add(`${p}.rules.minLength`, n, 'minLength is greater than maxLength');
        if (r.pattern !== undefined) {
          try {
            new RegExp(r.pattern.regex);
          } catch {
            add(`${p}.rules.pattern.regex`, n, `Invalid regular expression ${JSON.stringify(r.pattern?.regex)}`);
          }
        }
        expr(r.requiredWhen, `${p}.rules.requiredWhen`, n, chain);
        (r.validators ?? []).forEach((v, vi) => {
          const named = getNamedValidator(v.name);
          if (!named) add(`${p}.rules.validators[${vi}]`, n, `Unknown validator "${v.name}"`);
          else if (!named.appliesTo.includes(spec.valueKind)) add(`${p}.rules.validators[${vi}]`, n, `"${v.name}" does not apply to ${field.type} fields`);
        });
        (r.async ?? []).forEach((v, vi) => {
          if (!backend.asyncValidator(v.name)) add(`${p}.rules.async[${vi}]`, n, `Unknown async validator "${v.name}"`);
        });
      }
      if (spec.needsOptions) {
        if (field.optionsSource) {
          if (!backend.optionProvider(field.optionsSource.provider)) add(`${p}.optionsSource.provider`, n, `Unknown options provider "${field.optionsSource.provider}"`);
          expr(field.optionsSource.params, `${p}.optionsSource.params`, n, chain);
        } else if (!Array.isArray(field.options) || !field.options.length) {
          add(`${p}.options`, n, `A ${field.type} needs "options" or "optionsSource"`);
        } else {
          const values = new Set<string>();
          field.options.forEach((o, oi) => {
            if (typeof o !== 'object' || o === null || typeof o.value !== 'string' || typeof o.label !== 'string') add(`${p}.options[${oi}]`, n, 'Option needs string "value" and "label"');
            else if (values.has(o.value)) add(`${p}.options[${oi}].value`, n, `Duplicate option value "${o.value}"`);
            else values.add(o.value);
          });
        }
      }
      if (field.computed !== undefined) {
        if (!spec.computable) add(`${p}.computed`, n, `${field.type} fields cannot be computed`);
        const deps: KeyedNode[] = [];
        expr(field.computed, `${p}.computed`, n, chain, deps);
        computedDeps.set(field, deps);
      }
      if (field.type === 'phone' && field.mask !== undefined && (typeof field.mask !== 'string' || !field.mask.includes('#'))) {
        add(`${p}.mask`, n, 'Mask must contain "#" digit placeholders');
      }
    };

    visit(s.fields, 'fields', [], [makeScope(s.fields)]);
    (s.checks ?? []).forEach((c, ci) => {
      const chain = [makeScope(s.fields)];
      expr(c.assert, `checks[${ci}].assert`, [], chain);
      expr(c.when, `checks[${ci}].when`, [], chain);
      if (!scopeNodes(s.fields).some((f) => f.key === c.target)) add(`checks[${ci}].target`, [], `Unknown target "${c.target}"`);
    });
    detectCycles(computedDeps);
  }

  function detectCycles(graph: Map<KeyedNode, KeyedNode[]>): void {
    const state = new Map<KeyedNode, 'visiting' | 'done'>();
    const dfs = (node: KeyedNode, trail: KeyedNode[]): boolean => {
      if (state.get(node) === 'done') return false;
      if (state.get(node) === 'visiting') {
        const cycle = [...trail.slice(trail.indexOf(node)), node].map((n) => n.key).join(' → ');
        add('fields', [], `Computed fields form a cycle: ${cycle}`);
        return true;
      }
      state.set(node, 'visiting');
      for (const dep of graph.get(node) ?? []) {
        if (graph.has(dep) && dfs(dep, [...trail, node])) return true;
      }
      state.set(node, 'done');
      return false;
    };
    for (const node of graph.keys()) if (dfs(node, [])) break;
  }
}
