import { Component } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { FileMeta } from '../../engine';
import { FilePicker } from '../controls/file-picker';
import { BaseField } from './base-field';
import { FieldShell } from './field-shell';

@Component({
  selector: 'sfb-file-field',
  imports: [FieldShell, FormField, FilePicker],
  template: `
    <sfb-field-shell
      [node]="node()"
      [controlId]="id()"
      [hintId]="hintId()"
      [errorId]="errorId()"
      [messages]="messages()"
      [required]="!!node().rules?.required"
    >
      <sfb-file-picker
        [formField]="field()"
        [inputId]="id()"
        [accept]="node().accept ?? null"
        [multiple]="!!node().multiple"
        [describedBy]="describedBy()"
        [ariaInvalid]="showErrors()"
      />
    </sfb-field-shell>
  `,
})
export class FileField extends BaseField<FileMeta[]> {
  protected override readonly valueIsList = true;
}
