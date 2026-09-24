import { Injectable, Signal, computed, signal } from '@angular/core';
import { FieldState } from '@angular/forms/signals';
import { FormSchema, MockBackend, ModelObject, evaluateAt, mockBackend } from '../engine';
import { DynamicForm } from './dynamic-form';

/** Turns a Signal Forms field name (`root.attendees.0.name`) into value path keys. */
export function pathKeysOf(name: string, rootName: string): string[] {
  return name === rootName ? [] : name.slice(rootName.length + 1).split('.');
}

/** A DOM id derived from the field name (ids must not contain dots for CSS selectors). */
export function domId(name: string): string {
  return `sfb-${name.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

/**
 * Per-form context shared with every rendered field (provided by `DynamicFormComponent`).
 * Fields use it to evaluate expressions (e.g. params of async option lists) in their own
 * lexical scope, and to reach the mock backend.
 */
@Injectable()
export class DynamicFormContext {
  private readonly current = signal<DynamicForm<ModelObject> | null>(null);
  readonly backend: MockBackend = mockBackend;

  readonly instance: Signal<DynamicForm<ModelObject> | null> = this.current.asReadonly();
  readonly schema = computed<FormSchema | null>(() => this.current()?.schema ?? null);

  attach(instance: DynamicForm<ModelObject>): void {
    this.current.set(instance);
  }

  keysOf(state: FieldState<unknown>): string[] {
    const inst = this.current();
    return inst ? pathKeysOf(state.name(), inst.name) : [];
  }

  /** Reactive: re-evaluates when any value the expression reads changes. */
  evaluate(src: string, keys: readonly string[]): unknown {
    const inst = this.current();
    if (!inst) return undefined;
    return evaluateAt(inst.schema, inst.value(), keys, src);
  }
}
