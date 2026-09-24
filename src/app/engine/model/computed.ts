import { EvalOptions, Resolver, compileOrThrow, evaluate, getPath, toNumber } from '../expr';
import { DEFAULT_KINDS, FieldKindRegistry } from '../schema/field-kinds';
import { FieldNode, FormSchema, SchemaNode, isField, isGroup, isRepeat } from '../schema/types';
import { ModelObject, StaticScope, bindRef, makeScope, scopeNodes } from '../schema/walk';

/** One level of a value-scope chain: static scope + the object holding its values. */
export interface ValueScope {
  readonly scope: StaticScope;
  readonly value: ModelObject;
}

/** Resolves identifiers against plain values using the same lexical rules as the runtime. */
export function valueResolver(chain: readonly ValueScope[]): Resolver {
  const statics = chain.map((c) => c.scope);
  return (path) => {
    const bound = bindRef(statics, path);
    if (!bound) return undefined;
    return getPath(chain[bound.depth].value[bound.key], bound.rest);
  };
}

function coerce(node: FieldNode, raw: unknown, kinds: FieldKindRegistry): unknown {
  const kind = kinds.get(node.type)?.valueKind;
  if (kind === 'number') {
    const n = toNumber(raw);
    return n === null ? null : Math.round(n * 1e6) / 1e6;
  }
  if (kind === 'string') return raw === null || raw === undefined ? '' : String(raw);
  return raw;
}

function applyScope(
  nodes: readonly SchemaNode[],
  value: ModelObject,
  parents: readonly ValueScope[],
  kinds: FieldKindRegistry,
  options: EvalOptions,
): ModelObject {
  const scope = makeScope(nodes);
  let next = value;
  const set = (key: string, v: unknown) => {
    if (Object.is(next[key], v)) return;
    if (next === value) next = { ...value }; // spread keeps Signal Forms' identity symbols
    next[key] = v;
  };
  for (const node of scopeNodes(nodes)) {
    const chain = [...parents, { scope, value: next }];
    if (isField(node) && node.computed) {
      const result = evaluate(compileOrThrow(node.computed), valueResolver(chain), options);
      set(node.key, coerce(node, result, kinds));
    } else if (isGroup(node)) {
      const inner = next[node.key] as ModelObject | undefined;
      if (inner) set(node.key, applyScope(node.fields, inner, chain, kinds, options));
    } else if (isRepeat(node)) {
      const rows = next[node.key] as ModelObject[] | undefined;
      if (Array.isArray(rows)) {
        let changed = false;
        const updated = rows.map((row) => {
          const r = applyScope(node.fields, row, chain, kinds, options);
          if (r !== row) changed = true;
          return r;
        });
        if (changed) set(node.key, updated);
      }
    }
  }
  return next;
}

/**
 * Recomputes every `computed` field. Pure and structurally sharing: returns the *same*
 * object when nothing changed, and only copies the branches that did. Runs to a fixed
 * point so computed fields may depend on other computed fields (cycles are rejected by
 * schema validation, so this terminates).
 */
export function applyComputed(
  schema: FormSchema,
  value: ModelObject,
  kinds: FieldKindRegistry = DEFAULT_KINDS,
  options: EvalOptions = {},
): ModelObject {
  let current = value;
  for (let pass = 0; pass < 10; pass++) {
    const next = applyScope(schema.fields, current, [], kinds, options);
    if (next === current) return current;
    current = next;
  }
  return current;
}

/**
 * Builds the value-scope chain visible from the field at `keys`
 * (e.g. `['attendees', '2', 'ticket']`): root, then each group / repeat row on the way.
 */
export function scopeChainAt(schema: FormSchema, root: ModelObject, keys: readonly string[]): ValueScope[] {
  const chain: ValueScope[] = [{ scope: makeScope(schema.fields), value: root }];
  let nodes = schema.fields;
  let value: unknown = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const node = makeScope(nodes).byKey.get(keys[i]);
    const next = (value as ModelObject | undefined)?.[keys[i]];
    if (node && isGroup(node) && next && typeof next === 'object') {
      nodes = node.fields;
      value = next;
      chain.push({ scope: makeScope(nodes), value: next as ModelObject });
    } else if (node && isRepeat(node) && Array.isArray(next)) {
      const row = next[Number(keys[++i])] as ModelObject | undefined;
      if (!row) break;
      nodes = node.fields;
      value = row;
      chain.push({ scope: makeScope(nodes), value: row });
    } else break;
  }
  return chain;
}

/** Evaluates an expression as if it were written on the field at `keys`. */
export function evaluateAt(
  schema: FormSchema,
  root: ModelObject,
  keys: readonly string[],
  src: string,
  options: EvalOptions = {},
): unknown {
  return evaluate(compileOrThrow(src), valueResolver(scopeChainAt(schema, root, keys)), options);
}

export function hasComputed(schema: FormSchema): boolean {
  const rec = (nodes: readonly SchemaNode[]): boolean =>
    nodes.some((n) => (isField(n) ? !!n.computed : rec(n.fields)));
  return rec(schema.fields);
}
