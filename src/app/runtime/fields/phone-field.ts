import { Component } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { PhoneInput } from '../controls/phone-input';
import { BaseField } from './base-field';
import { FieldShell } from './field-shell';

@Component({
  selector: 'sfb-phone-field',
  imports: [FieldShell, FormField, PhoneInput],
  template: `
    <sfb-field-shell
      [node]="node()"
      [controlId]="id()"
      [hintId]="hintId()"
      [errorId]="errorId()"
      [messages]="messages()"
      [required]="state().required()"
    >
      <sfb-phone-input
        [formField]="field()"
        [mask]="node().mask ?? '+# (###) ###-####'"
        [inputId]="id()"
        [describedBy]="describedBy()"
        [ariaInvalid]="showErrors()"
      />
    </sfb-field-shell>
  `,
})
export class PhoneField extends BaseField<string> {}
