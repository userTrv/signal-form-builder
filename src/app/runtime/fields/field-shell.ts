import { NgTemplateOutlet } from '@angular/common';
import { Component, input } from '@angular/core';
import { FieldNode } from '../../engine';

/**
 * Label / hint / error chrome around a control. `layout="legend"` wraps multi-input controls
 * (radio group, checkbox group, date range, rating) in a fieldset so the group is named.
 */
@Component({
  selector: 'sfb-field-shell',
  imports: [NgTemplateOutlet],
  host: {
    class: 'sfb-field',
    '[class.half]': "node().width === 'half'",
    '[class.invalid]': 'messages().length > 0',
    '[class.inline]': "layout() === 'inline'",
  },
  template: `
    <ng-template #content><ng-content /></ng-template>
    <ng-template #marker>
      @if (required()) {
        <span class="req" aria-hidden="true">*</span>
      }
    </ng-template>

    @switch (layout()) {
      @case ('legend') {
        <fieldset class="sfb-fieldset" [attr.aria-describedby]="describedBy()">
          <legend class="sfb-label">{{ node().label }}<ng-container [ngTemplateOutlet]="marker" /></legend>
          <ng-container [ngTemplateOutlet]="content" />
        </fieldset>
      }
      @case ('inline') {
        <ng-container [ngTemplateOutlet]="content" />
      }
      @default {
        <label class="sfb-label" [for]="controlId()">{{ node().label }}<ng-container [ngTemplateOutlet]="marker" /></label>
        <ng-container [ngTemplateOutlet]="content" />
      }
    }
    @if (pending()) {
      <p class="sfb-hint pending" [id]="hintId()" aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>Checking…
      </p>
    } @else if (node().hint) {
      <p class="sfb-hint" [id]="hintId()">{{ node().hint }}</p>
    }
    <div aria-live="polite">
      @if (messages().length) {
        <p class="sfb-error" [id]="errorId()">
          @for (m of messages(); track m) {
            <span>{{ m }}</span>
          }
        </p>
      }
    </div>
  `,
})
export class FieldShell {
  readonly node = input.required<FieldNode>();
  readonly controlId = input('');
  readonly hintId = input.required<string>();
  readonly errorId = input.required<string>();
  readonly messages = input<readonly string[]>([]);
  readonly pending = input(false);
  readonly required = input(false);
  readonly describedBy = input<string | null>(null);
  readonly layout = input<'label' | 'legend' | 'inline'>('label');
}
