import { FieldNode } from './types';

export type BuiltInRule = 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern';

/** How a field type stores its value — drives defaults, validation mapping and type-gen. */
export type ValueKind = 'string' | 'number' | 'boolean' | 'string[]' | 'files' | 'date-range' | 'unknown';

/**
 * Framework-free description of a field type. The runtime pairs it with an Angular
 * component (see `runtime/field-registry.ts`); the engine only needs these facts.
 */
export interface FieldKindSpec {
  readonly type: string;
  readonly label: string;
  /** A short glyph for the builder palette. */
  readonly icon: string;
  readonly valueKind: ValueKind;
  /** Built-in rules that make sense for this type (the builder shows only these). */
  readonly rules: readonly BuiltInRule[];
  readonly needsOptions?: boolean;
  /** Can hold a `computed` expression. */
  readonly computable?: boolean;
  /** TypeScript type of the value (for type-gen of custom types). */
  readonly tsType?: string;
  readonly defaultValue?: (node: FieldNode) => unknown;
}

const TEXT_RULES: readonly BuiltInRule[] = ['required', 'minLength', 'maxLength', 'pattern'];

export const BUILT_IN_KINDS: readonly FieldKindSpec[] = [
  { type: 'text', label: 'Text', icon: 'Aa', valueKind: 'string', rules: TEXT_RULES, computable: true },
  { type: 'textarea', label: 'Long text', icon: '¶', valueKind: 'string', rules: TEXT_RULES },
  { type: 'number', label: 'Number', icon: '#', valueKind: 'number', rules: ['required', 'min', 'max'], computable: true },
  { type: 'email', label: 'Email', icon: '@', valueKind: 'string', rules: TEXT_RULES },
  { type: 'phone', label: 'Phone', icon: '☎', valueKind: 'string', rules: ['required'] },
  { type: 'date', label: 'Date', icon: '▦', valueKind: 'string', rules: ['required'] },
  { type: 'date-range', label: 'Date range', icon: '↔', valueKind: 'date-range', rules: ['required'] },
  { type: 'select', label: 'Select', icon: '▾', valueKind: 'string', rules: ['required'], needsOptions: true },
  { type: 'multiselect', label: 'Multi-select', icon: '☷', valueKind: 'string[]', rules: ['required', 'minLength', 'maxLength'], needsOptions: true },
  { type: 'radio', label: 'Radio group', icon: '◉', valueKind: 'string', rules: ['required'], needsOptions: true },
  { type: 'checkbox', label: 'Checkbox', icon: '☑', valueKind: 'boolean', rules: ['required'] },
  { type: 'switch', label: 'Switch', icon: '⏻', valueKind: 'boolean', rules: [] },
  { type: 'file', label: 'File', icon: '⎘', valueKind: 'files', rules: ['required', 'maxLength'] },
  { type: 'rating', label: 'Rating', icon: '★', valueKind: 'number', rules: ['required', 'min'] },
];

/** Registry of known field types. Custom types are added with `register()`. */
export class FieldKindRegistry {
  private readonly kinds = new Map<string, FieldKindSpec>();

  constructor(specs: readonly FieldKindSpec[] = BUILT_IN_KINDS) {
    specs.forEach((s) => this.register(s));
  }

  register(spec: FieldKindSpec): this {
    this.kinds.set(spec.type, spec);
    return this;
  }

  get(type: string): FieldKindSpec | undefined {
    return this.kinds.get(type);
  }

  has(type: string): boolean {
    return this.kinds.has(type);
  }

  all(): FieldKindSpec[] {
    return [...this.kinds.values()];
  }
}

export const DEFAULT_KINDS = new FieldKindRegistry();

/** Empty value for a field type, honouring a type-compatible `default`. */
export function defaultFieldValue(node: FieldNode, kinds: FieldKindRegistry = DEFAULT_KINDS): unknown {
  const spec = kinds.get(node.type);
  if (spec?.defaultValue) return spec.defaultValue(node);
  const d = node.default;
  switch (spec?.valueKind) {
    case 'string':
      return typeof d === 'string' ? d : '';
    case 'number':
      return typeof d === 'number' ? d : null;
    case 'boolean':
      return typeof d === 'boolean' ? d : false;
    case 'string[]':
      return Array.isArray(d) ? d.filter((x) => typeof x === 'string') : [];
    case 'files':
      return [];
    case 'date-range':
      return { start: '', end: '' };
    default:
      return d ?? null;
  }
}
