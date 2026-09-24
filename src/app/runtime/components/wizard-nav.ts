import { Component, input, output } from '@angular/core';
import { StepNode } from '../../engine';

export interface StepView {
  readonly step: StepNode;
  /** Index in `schema.fields`. */
  readonly index: number;
  readonly invalid: boolean;
}

/** Step indicator of the wizard. Steps after the furthest reached one are not clickable. */
@Component({
  selector: 'sfb-wizard-nav',
  template: `
    <nav aria-label="Form steps">
      <ol class="sfb-steps">
        @for (view of steps(); track view.step.id; let i = $index) {
          <li [class.current]="i === current()" [class.done]="i < current()" [class.has-errors]="view.invalid && i < reached()">
            <button
              type="button"
              [disabled]="i > reached()"
              [attr.aria-current]="i === current() ? 'step' : null"
              (click)="go.emit(i)"
            >
              <span class="num" aria-hidden="true">{{ i + 1 }}</span>
              <span class="title">{{ view.step.title }}</span>
              @if (view.invalid && i < reached()) {
                <span class="sr-only">(has errors)</span>
              }
            </button>
          </li>
        }
      </ol>
    </nav>
  `,
})
export class WizardNav {
  readonly steps = input.required<readonly StepView[]>();
  readonly current = input.required<number>();
  readonly reached = input.required<number>();
  readonly go = output<number>();
}
