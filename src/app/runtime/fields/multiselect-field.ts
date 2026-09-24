import { Component } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { CheckboxGroup } from '../controls/checkbox-group';
import { BaseField } from './base-field';
import { FieldShell } from './field-shell';

@Component({
  selector: 'sfb-multiselect-field',
  imports: [FieldShell, FormField, CheckboxGroup],
  template: `
    <sfb-field-shell
      layout="legend"
      [node]="node()"
      [hintId]="hintId()"
      [errorId]="errorId()"
      [messages]="messages()"
      [required]="state().required() || !!node().rules?.required"
      [describedBy]="describedBy()"
    >
      <sfb-checkbox-group [formField]="field()" [options]="node().options ?? []" [baseId]="id()" />
    </sfb-field-shell>
  `,
})
export class MultiselectField extends BaseField<string[]> {
  protected override readonly valueIsList = true;
}
