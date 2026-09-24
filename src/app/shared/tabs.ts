import { Component, ElementRef, input, model, viewChildren } from '@angular/core';

export interface TabDef {
  readonly id: string;
  readonly label: string;
}

/**
 * WAI-ARIA tab list (roving tabindex, arrow/Home/End keys). The parent renders the panel
 * with `role="tabpanel"` and `aria-labelledby="{{prefix}}-tab-{{id}}"`.
 */
@Component({
  selector: 'sfb-tabs',
  template: `
    <div class="tabs" role="tablist" [attr.aria-label]="label()" (keydown)="onKey($event)">
      @for (tab of tabs(); track tab.id) {
        <button
          #tabBtn
          type="button"
          role="tab"
          [id]="prefix() + '-tab-' + tab.id"
          [attr.aria-selected]="tab.id === active()"
          [attr.aria-controls]="prefix() + '-panel'"
          [tabIndex]="tab.id === active() ? 0 : -1"
          (click)="active.set(tab.id)"
        >
          {{ tab.label }}
        </button>
      }
    </div>
  `,
})
export class Tabs {
  readonly tabs = input.required<readonly TabDef[]>();
  readonly label = input('Tabs');
  readonly prefix = input('tabs');
  readonly active = model.required<string>();

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');

  protected onKey(event: KeyboardEvent): void {
    const ids = this.tabs().map((t) => t.id);
    const i = ids.indexOf(this.active());
    const next =
      event.key === 'ArrowRight' ? (i + 1) % ids.length
      : event.key === 'ArrowLeft' ? (i - 1 + ids.length) % ids.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? ids.length - 1
      : -1;
    if (next < 0) return;
    event.preventDefault();
    this.active.set(ids[next]);
    this.buttons()[next]?.nativeElement.focus();
  }
}
