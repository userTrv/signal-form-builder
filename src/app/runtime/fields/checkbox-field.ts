import { Component, computed } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { BaseField } from './base-field';
import { FieldShell } from './field-shell';

/** checkbox and switch (a checkbox with `role="switch"`). */
@Component({
  selector: 'sfb-checkbox-field',
  imports: [FieldShell, FormField],
  template: `
    <sfb-field-shell
      layout="inline"
      [node]="node()"
      [hintId]="hintId()"
      [errorId]="errorId()"
      [messages]="messages()"
      [required]="state().required()"
    >
      <label class="sfb-check" [class.switch]="isSwitch()" [for]="id()">
        <input
          type="checkbox"
          [id]="id()"
          [formField]="field()"
          [attr.role]="isSwitch() ? 'switch' : null"
          [attr.aria-describedby]="describedBy()"
          [attr.aria-invalid]="showErrors()"
        />
        @if (isSwitch()) {
          <span class="track" aria-hidden="true"><span class="thumb"></span></span>
        }
        <span>
          {{ node().label }}
          @if (state().required()) {
            <span class="req" aria-hidden="true">*</span>
          }
        </span>
      </label>
    </sfb-field-shell>
  `,
})
export class CheckboxField extends BaseField<boolean> {
  protected readonly isSwitch = computed(() => this.node().type === 'switch');
}
