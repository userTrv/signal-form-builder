import { Component, ElementRef, Injector, afterNextRender, computed, forwardRef, inject, input } from '@angular/core';
import { FieldState, FieldTree } from '@angular/forms/signals';
import { ModelObject, RepeatNode, initialRow } from '../../engine';
import { errorMessage } from '../error-messages';
import { FieldRegistry } from '../field-registry';
import { domId } from '../form-context';
import { insertItem, moveItem, removeItem } from '../repeat-ops';
import { NodeList } from './node-list';

/** A repeatable group: add / remove / reorder rows, keyboard-accessible with buttons. */
@Component({
  selector: 'sfb-repeat-view',
  imports: [forwardRef(() => NodeList)],
  host: { class: 'sfb-repeat' },
  template: `
    <section [attr.aria-labelledby]="id() + '-title'" [id]="id()" tabindex="-1">
      <header class="sfb-repeat-head">
        <h3 class="sfb-group-title" [id]="id() + '-title'">{{ node().label }}</h3>
        <span class="muted">{{ rows().length }}{{ node().maxItems ? ' / ' + node().maxItems : '' }}</span>
      </header>
      @if (node().hint) {
        <p class="sfb-hint">{{ node().hint }}</p>
      }
      @for (row of rows(); track row; let i = $index, first = $first, last = $last) {
        <fieldset class="sfb-row">
          <legend>{{ itemLabel() }} #{{ i + 1 }}</legend>
          <div class="sfb-row-actions">
            <button type="button" class="icon-btn" [disabled]="first" (click)="move(i, i - 1)" [attr.aria-label]="'Move ' + itemLabel() + ' ' + (i + 1) + ' up'">↑</button>
            <button type="button" class="icon-btn" [disabled]="last" (click)="move(i, i + 1)" [attr.aria-label]="'Move ' + itemLabel() + ' ' + (i + 1) + ' down'">↓</button>
            <button type="button" class="icon-btn danger" [disabled]="atMin()" (click)="remove(i)" [attr.aria-label]="'Remove ' + itemLabel() + ' ' + (i + 1)">✕</button>
          </div>
          <sfb-node-list [nodes]="node().fields" [parent]="row" />
        </fieldset>
      }
      @if (listErrors().length) {
        <p class="sfb-error" role="alert">{{ listErrors().join('. ') }}</p>
      }
      <button type="button" class="btn secondary" [disabled]="atMax()" (click)="add()">+ Add {{ itemLabel().toLowerCase() }}</button>
    </section>
  `,
})
export class RepeatView {
  readonly node = input.required<RepeatNode>();
  readonly field = input.required<FieldTree<unknown>>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly registry = inject(FieldRegistry);

  protected readonly state = computed(() => this.field()() as FieldState<ModelObject[]>);
  protected readonly id = computed(() => domId(this.state().name()));
  protected readonly itemLabel = computed(() => this.node().itemLabel ?? 'Item');

  protected readonly rows = computed(() => {
    this.state().value(); // re-read when rows are added/removed/moved
    return Array.from(this.field() as unknown as Iterable<FieldTree<ModelObject>>);
  });

  protected readonly atMin = computed(() => this.rows().length <= (this.node().minItems ?? 0));
  protected readonly atMax = computed(() => {
    const max = this.node().maxItems;
    return max !== undefined && this.rows().length >= max;
  });

  protected readonly listErrors = computed(() => {
    const s = this.state();
    return s.touched() ? s.errors().map((e) => errorMessage(e)) : [];
  });

  protected add(): void {
    const row = initialRow(this.node(), this.registry.kinds);
    this.state().value.update((rows) => insertItem(rows, row));
    this.state().markAsDirty();
    this.focusRow(this.rows().length - 1);
  }

  protected remove(index: number): void {
    this.state().value.update((rows) => removeItem(rows, index));
    this.state().markAsDirty();
    this.focusRow(Math.min(index, this.rows().length - 1));
  }

  protected move(from: number, to: number): void {
    this.state().value.update((rows) => moveItem(rows, from, to));
    this.state().markAsDirty();
    afterNextRender(
      () => {
        // Keep focus on the same move button; at the first/last row it is disabled, so use
        // the opposite one. Never fall back to "Remove": a repeated Enter would delete the row.
        const buttons = this.host.nativeElement.querySelectorAll<HTMLElement>('.sfb-row')[to]?.querySelectorAll<HTMLButtonElement>('button');
        const [up, down] = [buttons?.[0], buttons?.[1]];
        const target = [from < to ? down : up, from < to ? up : down].find((b) => b && !b.disabled);
        target?.focus();
      },
      { injector: this.injector },
    );
  }

  private focusRow(index: number): void {
    afterNextRender(
      () => {
        const row = this.host.nativeElement.querySelectorAll<HTMLElement>('.sfb-row')[index];
        (row?.querySelector<HTMLElement>('input, select, textarea') ?? this.host.nativeElement.querySelector('section'))?.focus();
      },
      { injector: this.injector },
    );
  }
}
