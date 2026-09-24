import { CdkDrag, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input } from '@angular/core';
import { FieldRegistry } from '../../runtime/field-registry';
import { BuilderStore } from '../state/builder-store';

export interface PaletteDragData {
  readonly kind: 'new';
  readonly type: string;
}

const CONTAINERS = [
  { type: 'group', label: 'Group', icon: '▣' },
  { type: 'repeat', label: 'Repeatable group', icon: '⟳' },
  { type: 'step', label: 'Wizard step', icon: '➊' },
];

/** Field types: drag onto the canvas, or activate (click / Enter) to add after the selection. */
@Component({
  selector: 'sfb-palette',
  imports: [CdkDropList, CdkDrag, CdkDragPlaceholder],
  template: `
    <div
      class="palette"
      cdkDropList
      id="palette"
      cdkDropListSortingDisabled
      cdkDropListOrientation="mixed"
      [cdkDropListConnectedTo]="connectedTo()"
      [cdkDropListEnterPredicate]="never"
      role="group"
      aria-label="Field types"
    >
      @for (item of items(); track item.type) {
        <button
          type="button"
          class="palette-item"
          [class.container]="item.container"
          cdkDrag
          [cdkDragData]="{ kind: 'new', type: item.type }"
          (click)="store.addSmart(item.type)"
          [attr.aria-label]="'Add ' + item.label"
        >
          <span class="icon" aria-hidden="true">{{ item.icon }}</span>{{ item.label }}
          <span *cdkDragPlaceholder class="palette-item placeholder"><span class="icon">{{ item.icon }}</span>{{ item.label }}</span>
        </button>
      }
    </div>
  `,
})
export class Palette {
  readonly connectedTo = input.required<string[]>();
  protected readonly store = inject(BuilderStore);
  private readonly registry = inject(FieldRegistry);

  protected readonly items = computed(() => [
    ...this.registry.kinds.all().map((k) => ({ type: k.type, label: k.label, icon: k.icon, container: false })),
    ...CONTAINERS.map((c) => ({ ...c, container: true })),
  ]);

  protected readonly never = () => false;
}
