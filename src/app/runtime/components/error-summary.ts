import { Component, ElementRef, input, output, viewChild } from '@angular/core';

export interface SummaryItem {
  /** Stable key for `@for` tracking. */
  readonly key: string;
  readonly label: string;
  readonly message: string;
  /** Wizard step that contains the field, or -1. */
  readonly stepIndex: number;
  readonly focus: () => void;
}

/**
 * Error summary shown after a failed submit (GOV.UK pattern): it receives focus, lists
 * every problem as a link, and each link moves focus to the offending control.
 */
@Component({
  selector: 'sfb-error-summary',
  template: `
    @if (items().length) {
      <div #box class="sfb-summary" role="alert" tabindex="-1" aria-labelledby="sfb-summary-title">
        <h2 id="sfb-summary-title">{{ title() }}</h2>
        <ul>
          @for (item of items(); track item.key) {
            <li>
              <a href="#" (click)="$event.preventDefault(); select.emit(item)">
                <strong>{{ item.label }}</strong>: {{ item.message }}
              </a>
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class ErrorSummary {
  readonly items = input<readonly SummaryItem[]>([]);
  readonly title = input('There is a problem');
  readonly select = output<SummaryItem>();

  private readonly box = viewChild<ElementRef<HTMLElement>>('box');

  focus(): void {
    this.box()?.nativeElement.focus();
  }
}
