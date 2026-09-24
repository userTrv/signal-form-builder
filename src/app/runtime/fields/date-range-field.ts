import { Component, computed } from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';
import { errorMessage } from '../error-messages';
import { domId } from '../form-context';
import { BaseField } from './base-field';
import { FieldShell } from './field-shell';

interface DateRange {
  start: string;
  end: string;
}

/** Two native date inputs bound to the `start` / `end` sub-fields of one group field. */
@Component({
  selector: 'sfb-date-range-field',
  imports: [FieldShell, FormField],
  template: `
    <sfb-field-shell
      layout="legend"
      [node]="node()"
      [hintId]="hintId()"
      [errorId]="errorId()"
      [required]="state().required()"
    >
      <div class="sfb-range">
        @for (part of parts(); track part.key) {
          <div class="sfb-range-part">
            <label class="sfb-sublabel" [for]="part.id">{{ part.label }}</label>
            <input
              class="sfb-input"
              type="date"
              [id]="part.id"
              [formField]="part.field"
              [attr.aria-describedby]="part.errors.length ? part.id + '-error' : null"
              [attr.aria-invalid]="part.errors.length > 0"
            />
            @if (part.errors.length) {
              <p class="sfb-error" [id]="part.id + '-error'">{{ part.errors.join('. ') }}</p>
            }
          </div>
        }
      </div>
    </sfb-field-shell>
  `,
})
export class DateRangeField extends BaseField<DateRange> {
  protected readonly parts = computed(() => {
    const tree = this.field() as FieldTree<DateRange>;
    const node = this.node();
    return (['start', 'end'] as const).map((key) => {
      const sub = tree[key];
      const s = sub();
      const errors = s.touched() && s.invalid() ? [...new Set(s.errors().map((e) => errorMessage(e)))] : [];
      return {
        key,
        field: sub,
        id: domId(s.name()),
        label: key === 'start' ? (node.startLabel ?? 'Start') : (node.endLabel ?? 'End'),
        errors,
      };
    });
  });
}
