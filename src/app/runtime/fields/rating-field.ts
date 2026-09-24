import { Component } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { RatingInput } from '../controls/rating-input';
import { BaseField } from './base-field';
import { FieldShell } from './field-shell';

@Component({
  selector: 'sfb-rating-field',
  imports: [FieldShell, FormField, RatingInput],
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
      <sfb-rating-input [formField]="field()" [scale]="node().scale ?? 5" [baseId]="id()" />
    </sfb-field-shell>
  `,
})
export class RatingField extends BaseField<number | null> {}
