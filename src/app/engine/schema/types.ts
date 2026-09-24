/**
 * The form schema format ("sfb/v1").
 *
 * A JSON document that describes *what* a form collects and *which rules* apply —
 * not how Angular should build it. It is JSON-Schema-inspired (types, required, min/max,
 * pattern) but UI-oriented: labels, hints, layout (groups, steps), conditions and computed
 * values are first-class.
 *
 * Every array is `readonly` so that a schema written `as const` is still assignable to
 * `FormSchema` — that is what makes type-level value inference possible (see `infer.ts`).
 */

/** An expression in the small, safe expression language (see `engine/expr`). */
export type Expr = string;

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'date-range'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'checkbox'
  | 'switch'
  | 'file'
  | 'rating';

export type ContainerType = 'group' | 'repeat' | 'step';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/** Options loaded at runtime from a registered provider (mocked locally in this demo). */
export interface OptionsSource {
  readonly provider: string;
  /** Expression whose value is passed to the provider, e.g. `"country"`. */
  readonly params?: Expr;
}

export interface NamedValidatorRef {
  readonly name: string;
  readonly args?: Readonly<Record<string, string | number | boolean>>;
  readonly message?: string;
}

export interface AsyncValidatorRef {
  readonly name: string;
  /** Debounce in ms before the async check starts (default 400). */
  readonly debounceMs?: number;
  readonly message?: string;
}

export interface FieldRules {
  readonly required?: boolean;
  /** Makes the field required only while the expression is truthy. */
  readonly requiredWhen?: Expr;
  readonly min?: number;
  readonly max?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: { readonly regex: string; readonly message?: string };
  readonly validators?: readonly NamedValidatorRef[];
  readonly async?: readonly AsyncValidatorRef[];
  /** Overrides for built-in messages, keyed by error kind (`required`, `min`, ...). */
  readonly messages?: Readonly<Record<string, string>>;
}

/** A cross-field rule: `assert` must be truthy, otherwise `message` is shown on `target`. */
export interface CrossFieldCheck {
  readonly assert: Expr;
  readonly message: string;
  /** Key of a field in the same scope that receives the error. */
  readonly target: string;
  /** Only check while this expression is truthy. */
  readonly when?: Expr;
}

interface NodeBase {
  readonly visibleWhen?: Expr;
  readonly enabledWhen?: Expr;
}

export interface FieldNode extends NodeBase {
  readonly type: FieldType | (string & {});
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  readonly placeholder?: string;
  readonly default?: unknown;
  readonly width?: 'full' | 'half';
  readonly rules?: FieldRules;
  /** Makes the field read-only and derives its value from the expression. */
  readonly computed?: Expr;
  // Type-specific settings (only meaningful for some field types).
  /** `text`: render as a password input. */
  readonly secret?: boolean;
  readonly options?: readonly SelectOption[];
  readonly optionsSource?: OptionsSource;
  /** `phone`: mask where `#` is a digit, e.g. `+1 (###) ###-####`. */
  readonly mask?: string;
  /** `number`: display prefix/suffix and step. */
  readonly prefix?: string;
  readonly suffix?: string;
  readonly step?: number;
  /** `textarea`: visible rows. */
  readonly rows?: number;
  /** `rating`: number of stars (default 5). */
  readonly scale?: number;
  /** `file`: accept attribute and whether multiple files are allowed. */
  readonly accept?: string;
  readonly multiple?: boolean;
  readonly maxSizeMb?: number;
  /** `date-range`: labels of both ends. */
  readonly startLabel?: string;
  readonly endLabel?: string;
}

export interface GroupNode extends NodeBase {
  readonly type: 'group';
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  readonly fields: readonly SchemaNode[];
  readonly checks?: readonly CrossFieldCheck[];
}

export interface RepeatNode extends NodeBase {
  readonly type: 'repeat';
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  /** Singular label of one row, e.g. "Attendee". */
  readonly itemLabel?: string;
  readonly minItems?: number;
  readonly maxItems?: number;
  /** Rows created initially (default: `minItems` or 1). */
  readonly initialItems?: number;
  readonly fields: readonly SchemaNode[];
  /** Checks evaluated for every row (scope = the row). */
  readonly checks?: readonly CrossFieldCheck[];
}

/** A wizard step. Layout only: its fields live in the parent object, not under a key. */
export interface StepNode extends NodeBase {
  readonly type: 'step';
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly fields: readonly SchemaNode[];
}

export type SchemaNode = FieldNode | GroupNode | RepeatNode | StepNode;
export type KeyedNode = FieldNode | GroupNode | RepeatNode;
export type ContainerNode = GroupNode | RepeatNode | StepNode;

export interface FormSchema {
  readonly $schema?: 'sfb/v1';
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly submitLabel?: string;
  readonly fields: readonly SchemaNode[];
  /** Root-level cross-field checks. */
  readonly checks?: readonly CrossFieldCheck[];
}

export const SCHEMA_VERSION = 'sfb/v1';

export function isContainer(node: SchemaNode): node is ContainerNode {
  return node.type === 'group' || node.type === 'repeat' || node.type === 'step';
}

export function isStep(node: SchemaNode): node is StepNode {
  return node.type === 'step';
}

export function isGroup(node: SchemaNode): node is GroupNode {
  return node.type === 'group';
}

export function isRepeat(node: SchemaNode): node is RepeatNode {
  return node.type === 'repeat';
}

export function isField(node: SchemaNode): node is FieldNode {
  return !isContainer(node);
}

/** Identity helper that keeps literal types, so `FormValue<typeof schema>` can be inferred. */
export function defineSchema<const S extends FormSchema>(schema: S): S {
  return schema;
}
