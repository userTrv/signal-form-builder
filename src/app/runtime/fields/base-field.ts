import { Directive, computed, inject, input } from '@angular/core';
import { FieldState, FieldTree } from '@angular/forms/signals';
import { FieldNode } from '../../engine';
import { errorMessage } from '../error-messages';
import { DynamicFormContext, domId } from '../form-context';

/**
 * Shared plumbing for field components: ids, `aria-describedby`, error visibility.
 * Errors are shown once the field was touched (blur) or a submit was attempted — never
 * while the user is still typing into a pristine field.
 */
@Directive()
export abstract class BaseField<T> {
  readonly field = input.required<FieldTree<T>>();
  readonly node = input.required<FieldNode>();

  protected readonly ctx = inject(DynamicFormContext);
  protected readonly state = computed<FieldState<T>>(() => this.field()() as FieldState<T>);
  protected readonly id = computed(() => domId(this.state().name()));
  protected readonly hintId = computed(() => `${this.id()}-hint`);
  protected readonly errorId = computed(() => `${this.id()}-error`);
  protected readonly valueIsList: boolean = false;

  protected readonly showErrors = computed(() => {
    const s = this.state();
    return s.touched() && s.invalid();
  });

  protected readonly messages = computed(() =>
    this.showErrors() ? [...new Set(this.state().errors().map((e) => errorMessage(e, this.valueIsList)))] : [],
  );

  protected readonly describedBy = computed(() => {
    const ids = [];
    if (this.node().hint || this.state().pending()) ids.push(this.hintId());
    if (this.showErrors()) ids.push(this.errorId());
    return ids.length ? ids.join(' ') : null;
  });
}
