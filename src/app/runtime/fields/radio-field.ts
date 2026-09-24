import { Component } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { BaseField } from './base-field';
import { FieldShell } from './field-shell';

/** Native radio group; every radio is bound to the same field with `[formField]`. */
@Component({
  selector: 'sfb-radio-field',
  imports: [FieldShell, FormField],
  template: `
    <sfb-field-shell
      layout="legend"
      [node]="node()"
      [hintId]="hintId()"
      [errorId]="errorId()"
      [messages]="messages()"
      [required]="state().required()"
      [describedBy]="describedBy()"
    >
      <div class="sfb-options" [class.row]="(node().options?.length ?? 0) <= 4">
        @for (opt of node().options ?? []; track opt.value; let i = $index) {
          <label class="sfb-check" [for]="id() + '-' + i">
            <input type="radio" [id]="id() + '-' + i" [formField]="field()" [value]="opt.value" />
            <span>{{ opt.label }}</span>
          </label>
        }
      </div>
    </sfb-field-shell>
  `,
})
export class RadioField extends BaseField<string> {}
