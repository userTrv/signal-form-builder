import { Component, input, output } from '@angular/core';
import { CrossFieldCheck, StaticScope } from '../../engine';
import { ExpressionInput } from './expression-input';

/** Cross-field checks of a scope (form, group or repeat row). */
@Component({
  selector: 'sfb-checks-editor',
  imports: [ExpressionInput],
  // Options use `[selected]`: a `[value]` on the <select> is applied before the @for
  // options exist, so the browser would show the first option instead.
  template: `
    @for (check of checks(); track $index; let i = $index) {
      <div class="check-card">
        <sfb-expression-input
          [label]="'Rule ' + (i + 1) + ' — must be true'"
          [inputId]="idPrefix() + '-assert-' + i"
          [value]="check.assert"
          [scopes]="scopes()"
          placeholder="endDate >= startDate"
          (valueChange)="patch(i, { assert: $event ?? '' })"
        />
        <label class="insp-label" [for]="idPrefix() + '-msg-' + i">Message</label>
        <input class="sfb-input" [id]="idPrefix() + '-msg-' + i" [value]="check.message" (input)="patch(i, { message: $any($event.target).value })" />
        <label class="insp-label" [for]="idPrefix() + '-target-' + i">Show error on</label>
        <select class="sfb-input" [id]="idPrefix() + '-target-' + i" (change)="patch(i, { target: $any($event.target).value })">
          @for (key of targets(); track key) {
            <option [value]="key" [selected]="key === check.target">{{ key }}</option>
          }
        </select>
        <button type="button" class="btn-link" (click)="removeAt(i)">Remove rule</button>
      </div>
    }
    <button type="button" class="btn secondary small" [disabled]="!targets().length" (click)="add()">+ Add cross-field rule</button>
  `,
})
export class ChecksEditor {
  readonly checks = input<readonly CrossFieldCheck[]>([]);
  readonly scopes = input.required<readonly StaticScope[]>();
  readonly idPrefix = input('checks');
  readonly changed = output<{ checks: CrossFieldCheck[] | undefined; key: string }>();

  protected targets(): string[] {
    const scopes = this.scopes();
    return scopes[scopes.length - 1]?.nodes.map((n) => n.key) ?? [];
  }

  protected patch(index: number, patch: Partial<CrossFieldCheck>): void {
    const next = this.checks().map((c, i) => (i === index ? { ...c, ...patch } : c));
    this.changed.emit({ checks: next, key: `checks:${index}:${Object.keys(patch)[0]}` });
  }

  protected removeAt(index: number): void {
    const next = this.checks().filter((_, i) => i !== index);
    this.changed.emit({ checks: next.length ? next : undefined, key: 'checks:remove' });
  }

  protected add(): void {
    const target = this.targets()[0];
    this.changed.emit({
      checks: [...this.checks(), { assert: `!empty(${target})`, message: 'Please check this value', target }],
      key: 'checks:add',
    });
  }
}
