import { DEFAULT_KINDS, FieldKindRegistry } from '../schema/field-kinds';
import { FieldNode, FormSchema, KeyedNode, SchemaNode, isField, isGroup, isRepeat, isStep } from '../schema/types';
import { scopeNodes } from '../schema/walk';

export interface TypeGenOptions {
  /** `draft`: value while editing; `submitted`: what a valid submit guarantees. */
  readonly mode?: 'draft' | 'submitted';
  readonly typeName?: string;
  readonly kinds?: FieldKindRegistry;
}

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function pascalCase(input: string): string {
  const words = input.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const name = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return /^[0-9]/.test(name) ? `Form${name}` : name || 'Form';
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const propName = (key: string) => (IDENT_RE.test(key) ? key : quote(key));
const commentSafe = (s: string) => s.replace(/\*\//g, '*\\/');

/**
 * Emits the TypeScript declaration of a schema's value — the textual twin of
 * `FormValue<S>` / `SubmittedValue<S>` in `infer.ts` (kept consistent by tests).
 */
export function generateTypeScript(schema: FormSchema, options: TypeGenOptions = {}): string {
  const mode = options.mode ?? 'draft';
  const kinds = options.kinds ?? DEFAULT_KINDS;
  const typeName = options.typeName ?? `${pascalCase(schema.id)}${mode === 'draft' ? 'Draft' : 'Value'}`;
  let usesFileMeta = false;

  const leafType = (f: FieldNode, guaranteed: boolean): string => {
    const spec = kinds.get(f.type);
    const optionUnion = () =>
      f.options?.length && !f.optionsSource ? f.options.map((o) => quote(o.value)).join(' | ') : 'string';
    switch (f.type) {
      case 'text':
      case 'textarea':
      case 'email':
      case 'phone':
      case 'date':
        return 'string';
      case 'number':
      case 'rating':
        return guaranteed ? 'number' : 'number | null';
      case 'checkbox':
        return guaranteed ? 'true' : 'boolean';
      case 'switch':
        return 'boolean';
      case 'select':
      case 'radio': {
        const union = optionUnion();
        return guaranteed || union === 'string' ? union : `${union} | ''`;
      }
      case 'multiselect': {
        const union = optionUnion();
        return union.includes('|') ? `Array<${union}>` : `${union}[]`;
      }
      case 'date-range':
        return '{ start: string; end: string }';
      case 'file':
        usesFileMeta = true;
        return 'FileMeta[]';
      default:
        return spec?.tsType ?? 'unknown';
    }
  };

  const doc = (node: KeyedNode, indent: string): string[] => {
    const lines = [commentSafe(node.label)];
    if (node.hint) lines.push(commentSafe(node.hint));
    if (isField(node) && node.type === 'date') lines.push('ISO date, `YYYY-MM-DD`');
    if (isField(node) && node.computed) lines.push(`@computed \`${commentSafe(node.computed)}\``);
    if (node.visibleWhen) lines.push(`@visibleWhen \`${commentSafe(node.visibleWhen)}\``);
    if (lines.length === 1) return [`${indent}/** ${lines[0]} */`];
    return [`${indent}/**`, ...lines.map((l) => `${indent} * ${l}`), `${indent} */`];
  };

  const conditional = (n: SchemaNode) => !!(n.visibleWhen || n.enabledWhen);

  /** Children of a scope, with steps flattened and their conditions pushed down. */
  const flatten = (nodes: readonly SchemaNode[], cond: boolean): [KeyedNode, boolean][] =>
    nodes.flatMap((n): [KeyedNode, boolean][] =>
      isStep(n) ? flatten(n.fields, cond || conditional(n)) : [[n, cond]],
    );

  const objectType = (nodes: readonly SchemaNode[], indent: string, cond: boolean): string => {
    const inner = `${indent}  `;
    const lines: string[] = ['{'];
    for (const [node, parentCond] of flatten(nodes, cond)) {
      const nodeCond = parentCond || conditional(node);
      let type: string;
      if (isGroup(node)) type = objectType(node.fields, inner, nodeCond);
      else if (isRepeat(node)) type = `Array<${objectType(node.fields, inner, nodeCond)}>`;
      else {
        const f = node as FieldNode;
        const guaranteed = mode === 'submitted' && !nodeCond && f.rules?.required === true;
        type = leafType(f, guaranteed);
      }
      lines.push(...doc(node, inner), `${inner}${propName(node.key)}: ${type};`);
    }
    lines.push(`${indent}}`);
    return lines.join('\n');
  };

  const header = [
    '/**',
    ` * ${commentSafe(schema.title)}`,
    ` * Generated from schema "${commentSafe(schema.id)}" — ${mode === 'draft' ? 'model value while editing' : 'value after a successful submit'}.`,
    ' */',
  ];
  const body = `export interface ${typeName} ${objectType(schema.fields, '', false)}`;
  const fileMeta = usesFileMeta
    ? ['', 'export interface FileMeta {', '  name: string;', '  size: number;', '  type: string;', '}']
    : [];
  return [...header, body, ...fileMeta, ''].join('\n');
}

/** Number of keyed nodes, for display. */
export function countFields(schema: FormSchema): number {
  const rec = (nodes: readonly SchemaNode[]): number =>
    scopeNodes(nodes).reduce((n, node) => n + (isGroup(node) || isRepeat(node) ? rec(node.fields) : 1), 0);
  return rec(schema.fields);
}
