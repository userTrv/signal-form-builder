/**
 * Type-level inference of a form's value type from a schema literal.
 *
 *   const schema = defineSchema({ id: 'x', title: 'X', fields: [...] });   // or `as const`
 *   type Draft = FormValue<typeof schema>;        // what the model holds while editing
 *   type Sent  = SubmittedValue<typeof schema>;   // what a *valid* submit guarantees
 *
 * `SubmittedValue` narrows statically-required, unconditional fields: `number | null`
 * becomes `number`, `'' | 'a' | 'b'` becomes `'a' | 'b'`, a required checkbox becomes `true`.
 * Anything behind `visibleWhen` / `enabledWhen` stays nullable because hidden or disabled
 * fields are not validated.
 */

/** Client-side metadata of an attached file (the file itself never leaves the browser). */
export interface FileMeta {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

/**
 * Extension point for custom field types, via declaration merging:
 *
 *   declare module './engine/typegen/infer' {
 *     interface CustomFieldValues { color: string }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CustomFieldValues {}

type Mode = 'draft' | 'submitted';

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type OptionValue<F> = F extends { readonly options: readonly (infer O)[] }
  ? O extends { readonly value: infer V extends string }
    ? V
    : string
  : string;

type LeafValue<F> = F extends { readonly type: 'text' | 'textarea' | 'email' | 'phone' | 'date' }
  ? string
  : F extends { readonly type: 'number' | 'rating' }
    ? number | null
    : F extends { readonly type: 'checkbox' | 'switch' }
      ? boolean
      : F extends { readonly type: 'select' | 'radio' }
        ? OptionValue<F> | ''
        : F extends { readonly type: 'multiselect' }
          ? OptionValue<F>[]
          : F extends { readonly type: 'date-range' }
            ? { start: string; end: string }
            : F extends { readonly type: 'file' }
              ? FileMeta[]
              : F extends { readonly type: infer T extends keyof CustomFieldValues }
                ? CustomFieldValues[T]
                : unknown;

type IsConditional<N> = N extends { readonly visibleWhen: string } | { readonly enabledWhen: string } ? true : false;

type Guaranteed<F, Cond extends boolean> = Cond extends true
  ? false
  : IsConditional<F> extends true
    ? false
    : F extends { readonly rules: { readonly required: true } }
      ? true
      : false;

type SubmittedLeaf<F, Cond extends boolean> =
  Guaranteed<F, Cond> extends true
    ? F extends { readonly type: 'checkbox' }
      ? true
      : Exclude<LeafValue<F>, null | ''>
    : LeafValue<F>;

/** Steps are layout only: replace them by their children, remembering their condition. */
type Flatten<N, Cond extends boolean> = N extends { readonly type: 'step'; readonly fields: readonly (infer C)[] }
  ? Flatten<C, Cond extends true ? true : IsConditional<N>>
  : Cond extends true
    ? N & { readonly visibleWhen: string }
    : N;

type NodeValue<N, M extends Mode, Cond extends boolean> = N extends {
  readonly type: 'group';
  readonly fields: readonly unknown[];
}
  ? NodesValue<N['fields'], M, Cond extends true ? true : IsConditional<N>>
  : N extends { readonly type: 'repeat'; readonly fields: readonly unknown[] }
    ? NodesValue<N['fields'], M, Cond extends true ? true : IsConditional<N>>[]
    : M extends 'submitted'
      ? SubmittedLeaf<N, Cond>
      : LeafValue<N>;

type NodesValue<Nodes extends readonly unknown[], M extends Mode, Cond extends boolean> = Simplify<{
  -readonly [F in Flatten<Nodes[number], Cond> as F extends { readonly key: infer K extends string } ? K : never]: NodeValue<
    F,
    M,
    Cond
  >;
}>;

interface SchemaLike {
  readonly id: string;
  readonly fields: readonly unknown[];
}

/**
 * A schema that is not a literal (e.g. loaded from JSON at runtime) has `id: string`;
 * its value can only be described as a record.
 */
type IsLiteral<S extends SchemaLike> = string extends S['id'] ? false : true;

/** The model value while the form is being edited. */
export type FormValue<S extends SchemaLike> =
  IsLiteral<S> extends true ? NodesValue<S['fields'], 'draft', false> : Record<string, unknown>;

/** The value handed to a submit handler after validation passed. */
export type SubmittedValue<S extends SchemaLike> =
  IsLiteral<S> extends true ? NodesValue<S['fields'], 'submitted', false> : Record<string, unknown>;
