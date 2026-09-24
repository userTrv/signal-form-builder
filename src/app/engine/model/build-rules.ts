import { resource } from '@angular/core';
import {
  FieldContext,
  SchemaPath,
  SchemaPathRules,
  applyEach,
  disabled,
  email,
  hidden,
  max,
  maxLength,
  min,
  minLength,
  pattern,
  readonly,
  required,
  validate,
  validateAsync,
} from '@angular/forms/signals';
import { EvalOptions, Resolver, compileOrThrow, evaluate, getPath, isTruthy } from '../expr';
import { DEFAULT_KINDS, FieldKindRegistry } from '../schema/field-kinds';
import { CrossFieldCheck, FieldNode, FormSchema, RepeatNode, SchemaNode, isField, isGroup, isRepeat, isStep } from '../schema/types';
import { StaticScope, bindRef, makeScope } from '../schema/walk';
import { MockBackend, mockBackend } from './mock-backend';
import { getNamedValidator, isMaskComplete } from './validators';

/**
 * Translates a (validated) `FormSchema` into Signal Forms rules.
 *
 * The schema is only known at runtime, so the model is `Record<string, unknown>` and paths
 * are addressed by key. All the dynamic-typing casts live in this file; everything else in
 * the app sees typed `FieldTree`s.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynPath = SchemaPath<any, SchemaPathRules.Supported, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = FieldContext<any, any>;

const child = (path: DynPath, key: string): DynPath => (path as unknown as Record<string, DynPath>)[key];

/** Expression scope bound to schema paths (read through `ctx.valueOf`, so reactivity is per field). */
interface PathScope {
  readonly scope: StaticScope;
  readonly path: DynPath;
}

export interface BuildRulesOptions {
  readonly kinds?: FieldKindRegistry;
  readonly backend?: MockBackend;
  readonly now?: () => Date;
}

export function buildRules(schema: FormSchema, options: BuildRulesOptions = {}): (root: DynPath) => void {
  const kinds = options.kinds ?? DEFAULT_KINDS;
  const backend = options.backend ?? mockBackend;
  const now = options.now ?? (() => new Date());
  const evalOptions: EvalOptions = { now };

  const resolverFor = (ctx: Ctx, chain: readonly PathScope[]): Resolver => {
    const statics = chain.map((c) => c.scope);
    return (refPath) => {
      const bound = bindRef(statics, refPath);
      if (!bound) return undefined;
      return getPath(ctx.valueOf(child(chain[bound.depth].path, bound.key)), bound.rest);
    };
  };

  /** Compiles once; returns a predicate usable as a Signal Forms `LogicFn`. */
  const condition = (src: string, chain: readonly PathScope[]) => {
    const ast = compileOrThrow(src);
    return (ctx: Ctx) => isTruthy(evaluate(ast, resolverFor(ctx, chain), evalOptions));
  };

  const message = (node: FieldNode, kind: string, fallback?: string) => node.rules?.messages?.[kind] ?? fallback;

  const applyNodes = (nodes: readonly SchemaNode[], parent: DynPath, chain: readonly PathScope[], inheritedHidden?: string) => {
    for (const node of nodes) {
      if (isStep(node)) {
        // Steps have no path of their own: push their condition down to their children.
        const cond = [inheritedHidden, node.visibleWhen].filter(Boolean).map((c) => `(${c})`).join(' && ');
        applyNodes(node.fields, parent, chain, cond || undefined);
        continue;
      }
      const path = child(parent, node.key);
      const visible = [inheritedHidden, node.visibleWhen].filter(Boolean).map((c) => `(${c})`).join(' && ');
      if (visible) {
        const isVisible = condition(visible, chain);
        hidden(path, { when: (ctx) => !isVisible(ctx) });
      }
      if (node.enabledWhen) {
        const isEnabled = condition(node.enabledWhen, chain);
        disabled(path, { when: (ctx) => !isEnabled(ctx) });
      }
      if (isGroup(node)) {
        const inner = [...chain, { scope: makeScope(node.fields), path }];
        applyNodes(node.fields, path, inner);
        applyChecks(node.checks, path, inner);
      } else if (isRepeat(node)) {
        applyRepeat(node, path, chain);
      } else if (isField(node)) {
        applyField(node, path, chain);
      }
    }
  };

  const applyRepeat = (node: RepeatNode, path: DynPath, chain: readonly PathScope[]) => {
    const { minItems, maxItems, itemLabel = 'item' } = node;
    if (minItems || maxItems) {
      validate(path, ({ value }: Ctx) => {
        const n = (value() as unknown[]).length;
        if (minItems && n < minItems) return { kind: 'minItems', message: `Add at least ${minItems} ${itemLabel.toLowerCase()}(s)` };
        if (maxItems && n > maxItems) return { kind: 'maxItems', message: `No more than ${maxItems} ${itemLabel.toLowerCase()}(s)` };
        return null;
      });
    }
    applyEach(path, (item: unknown) => {
      const itemPath = item as DynPath;
      const inner = [...chain, { scope: makeScope(node.fields), path: itemPath }];
      applyNodes(node.fields, itemPath, inner);
      applyChecks(node.checks, itemPath, inner);
    });
  };

  const applyChecks = (checks: readonly CrossFieldCheck[] | undefined, scopePath: DynPath, chain: readonly PathScope[]) => {
    for (const check of checks ?? []) {
      const holds = condition(check.assert, chain);
      const applies = check.when ? condition(check.when, chain) : () => true;
      validate(child(scopePath, check.target), (ctx: Ctx) =>
        !applies(ctx) || holds(ctx) ? null : { kind: 'check', message: check.message },
      );
    }
  };

  const applyField = (node: FieldNode, path: DynPath, chain: readonly PathScope[]) => {
    const spec = kinds.get(node.type);
    const valueKind = spec?.valueKind ?? 'unknown';
    const r = node.rules ?? {};

    if (node.computed) {
      readonly(path);
      return; // derived values are not user input: no validation
    }

    const requiredWhen = r.requiredWhen ? condition(r.requiredWhen, chain) : undefined;
    if (r.required || requiredWhen) {
      const when = requiredWhen ? { when: requiredWhen } : {};
      if (valueKind === 'string[]' || valueKind === 'files') {
        validate(path, (ctx: Ctx) =>
          (!requiredWhen || requiredWhen(ctx)) && !(ctx.value() as unknown[]).length
            ? { kind: 'required', message: message(node, 'required', valueKind === 'files' ? 'Attach a file' : 'Select at least one option') }
            : null,
        );
      } else if (valueKind === 'date-range') {
        required(child(path, 'start'), { ...when, message: message(node, 'required', 'Start date is required') });
        required(child(path, 'end'), { ...when, message: message(node, 'required', 'End date is required') });
      } else {
        required(path, { ...when, message: message(node, 'required', node.type === 'checkbox' ? 'This box must be checked' : undefined) });
      }
    }
    if (r.min !== undefined && valueKind === 'number') min(path, r.min, { message: message(node, 'min') });
    if (r.max !== undefined && valueKind === 'number') max(path, r.max, { message: message(node, 'max') });
    if (r.minLength !== undefined) minLength(path, r.minLength, { message: message(node, 'minLength') });
    if (r.maxLength !== undefined) maxLength(path, r.maxLength, { message: message(node, 'maxLength') });
    if (r.pattern) pattern(path, new RegExp(r.pattern.regex), { message: r.pattern.message ?? message(node, 'pattern') });
    if (node.type === 'email') email(path, { message: message(node, 'email', 'Enter a valid email address') });

    if (node.type === 'phone' && node.mask) {
      const mask = node.mask;
      validate(path, ({ value }: Ctx) =>
        value() && !isMaskComplete(mask, String(value())) ? { kind: 'phone', message: `Use the format ${mask.replace(/#/g, '0')}` } : null,
      );
    }
    if (valueKind === 'date-range') {
      validate(child(path, 'end'), ({ value, valueOf }: Ctx) => {
        const start = valueOf(child(path, 'start')) as string;
        return start && value() && value() < start ? { kind: 'dateRange', message: 'End date must not be before the start date' } : null;
      });
    }
    if (node.type === 'file' && node.maxSizeMb) {
      const limit = node.maxSizeMb * 1024 * 1024;
      validate(path, ({ value }: Ctx) => {
        const big = (value() as { name: string; size: number }[]).find((f) => f.size > limit);
        return big ? { kind: 'fileSize', message: `${big.name} is larger than ${node.maxSizeMb} MB` } : null;
      });
    }

    for (const ref of r.validators ?? []) {
      const named = getNamedValidator(ref.name);
      if (!named) continue;
      validate(path, ({ value }: Ctx) => {
        const error = named.validate(value(), ref.args ?? {}, now);
        return error ? { kind: `named:${ref.name}`, message: ref.message ?? error } : null;
      });
    }

    for (const ref of r.async ?? []) {
      const spec = backend.asyncValidator(ref.name);
      if (!spec) continue;
      validateAsync(path, {
        params: ({ value }: Ctx) => (value() ? String(value()) : undefined),
        debounce: ref.debounceMs ?? 400,
        factory: (params) =>
          resource({
            params: () => params(),
            loader: ({ params: value, abortSignal }) => spec.check(value, abortSignal),
          }),
        onSuccess: (error: string | null | undefined) => (error ? { kind: `async:${ref.name}`, message: ref.message ?? error } : null),
        onError: () => ({ kind: 'asyncError', message: 'Could not verify right now — try again' }),
      });
    }
  };

  return (root: DynPath) => {
    const chain: PathScope[] = [{ scope: makeScope(schema.fields), path: root }];
    applyNodes(schema.fields, root, chain);
    applyChecks(schema.checks, root, chain);
  };
}

export type { DynPath };
