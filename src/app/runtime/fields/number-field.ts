import { Component } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { BaseField } from './base-field';
import { FieldShell } from './field-shell';

/** Native number input; computed fields render read-only with an "auto" badge. */
@Component({
  selector: 'sfb-number-field',
  imports: [FieldShell, FormField],
  template: `
    <sfb-field-shell
      [node]="node()"
      [controlId]="id()"
      [hintId]="hintId()"
      [errorId]="errorId()"
      [messages]="messages()"
      [required]="state().required()"
    >
      <div class="sfb-affix" [class.computed]="!!node().computed">
        @if (node().prefix) {
          <span class="affix" aria-hidden="true">{{ node().prefix }}</span>
        }
        <input
          class="sfb-input"
          type="number"
          inputmode="decimal"
          [id]="id()"
          [formField]="field()"
          [step]="node().step ?? 'any'"
          [attr.aria-describedby]="describedBy()"
          [attr.aria-invalid]="showErrors()"
        />
        @if (node().suffix) {
          <span class="affix" aria-hidden="true">{{ node().suffix }}</span>
        }
        @if (node().computed) {
          <span class="badge" title="Calculated from other fields">auto</span>
        }
      </div>
    </sfb-field-shell>
  `,
})
export class NumberField extends BaseField<number | null> {}
