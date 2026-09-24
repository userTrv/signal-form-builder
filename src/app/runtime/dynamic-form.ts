import { Injector, Signal, WritableSignal, effect, inject, signal, untracked } from '@angular/core';
import { FieldTree, FormSubmitOptions, form, submit } from '@angular/forms/signals';
import {
  DEFAULT_KINDS,
  FieldKindRegistry,
  FormSchema,
  FormValue,
  MockBackend,
  ModelObject,
  SubmittedValue,
  applyComputed,
  buildRules,
  hasComputed,
  initialValue,
  mockBackend,
} from '../engine';

export interface DynamicFormOptions<TSubmitted> {
  /** Required outside an injection context. */
  readonly injector?: Injector;
  readonly kinds?: FieldKindRegistry;
  readonly backend?: MockBackend;
  readonly now?: () => Date;
  /** Called with the validated value; may be async. */
  readonly onSubmit?: (value: TSubmitted) => void | Promise<void>;
  readonly onInvalid?: () => void;
}

/**
 * A schema-driven form. `TValue` is inferred from the schema when it is a literal
 * (`defineSchema(...)` / `as const`), and falls back to `Record<string, unknown>`.
 */
export interface DynamicForm<TValue, TSubmitted = TValue> {
  readonly schema: FormSchema;
  /** The single source of truth: a plain writable signal holding the whole value. */
  readonly model: WritableSignal<TValue>;
  /** Signal Forms field tree mirroring the model's shape. */
  readonly form: FieldTree<TValue>;
  readonly value: Signal<TValue>;
  /** Unique root name (used for `name` / `id` attributes). */
  readonly name: string;
  /** Runs `onSubmit` if the form is valid (waits for pending async validators first). */
  submit(): Promise<boolean>;
  /** Restores initial values and clears touched/dirty state. */
  reset(): void;
  /** The last successfully submitted value (typed as validated), or `null`. */
  readonly submitted: Signal<TSubmitted | null>;
}

let formCounter = 0;

/**
 * Creates a Signal Forms form from a schema literal, with the value type inferred from it:
 *
 *   const signup = createDynamicForm(SIGNUP);        // SIGNUP = defineSchema({...})
 *   signup.form.username().value();                  // string
 *   signup.form.plan().value();                      // '' | 'free' | 'pro' | 'team'
 *
 * Must run in an injection context unless an `injector` is passed.
 */
export function createDynamicForm<const S extends FormSchema>(
  schema: S,
  options: DynamicFormOptions<SubmittedValue<S>> = {},
): DynamicForm<FormValue<S>, SubmittedValue<S>> {
  return createUntypedForm(schema, options as unknown as DynamicFormOptions<ModelObject>) as unknown as DynamicForm<
    FormValue<S>,
    SubmittedValue<S>
  >;
}

/** Same as `createDynamicForm` for schemas only known at runtime (JSON, the builder). */
export function createUntypedForm(
  schema: FormSchema,
  options: DynamicFormOptions<ModelObject> = {},
): DynamicForm<ModelObject> {
  const kinds = options.kinds ?? DEFAULT_KINDS;
  const injector = options.injector ?? inject(Injector);
  const name = `${schema.id}-${++formCounter}`;
  const initial = () => applyComputed(schema, initialValue(schema, kinds), kinds, { now: options.now });

  const model = signal<ModelObject>(initial());
  const submitted = signal<ModelObject | null>(null);
  const submission: FormSubmitOptions<ModelObject, unknown> = {
    action: async (field) => {
      const value = field().value();
      submitted.set(value);
      await options.onSubmit?.(value);
      return undefined;
    },
    onInvalid: () => options.onInvalid?.(),
    // Pending async validators block submission; `submit()` below waits for them first.
    ignoreValidators: 'none',
  };
  const rules = buildRules(schema, { kinds, backend: options.backend ?? mockBackend, now: options.now });
  const tree = form(model, rules, { injector, name, submission });

  if (hasComputed(schema)) {
    // Computed fields are stored in the model (so they show up in the value and in
    // expressions). The pure `applyComputed` returns the same object when nothing changed,
    // so this settles after at most one extra pass.
    effect(
      () => {
        const current = model();
        const next = applyComputed(schema, current, kinds, { now: options.now });
        if (next !== current) untracked(() => model.set(next));
      },
      { injector },
    );
  }

  const waitForIdle = () =>
    new Promise<void>((resolve) => {
      if (!untracked(() => tree().pending())) return resolve();
      const ref = effect(
        () => {
          if (!tree().pending()) {
            ref.destroy();
            resolve();
          }
        },
        { injector },
      );
    });

  return {
    schema,
    model,
    form: tree,
    value: model.asReadonly(),
    name,
    submitted: submitted.asReadonly(),
    async submit() {
      tree().markAsTouched();
      await waitForIdle();
      return submit(tree);
    },
    reset() {
      tree().reset(initial());
    },
  };
}
