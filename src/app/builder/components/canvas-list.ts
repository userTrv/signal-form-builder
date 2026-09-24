import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { Component, Injector, afterNextRender, computed, inject, input } from '@angular/core';
import { SchemaNode, isField, isStep } from '../../engine';
import { FieldRegistry } from '../../runtime/field-registry';
import { BuilderStore } from '../state/builder-store';
import { NodePath, pathKey, samePath } from '../state/commands';
import { removeKeepingFocus } from './canvas-focus';
import { PaletteDragData } from './palette';

interface MoveDragData {
  readonly kind: 'move';
}

/**
 * One level of the canvas tree (recursive). Each level is a CDK drop list; the lists are
 * connected deepest-first so a drop lands in the innermost container under the pointer.
 */
@Component({
  selector: 'sfb-canvas-list',
  imports: [CdkDropList, CdkDrag, CdkDragHandle],
  template: `
    <div
      class="canvas-list"
      cdkDropList
      [id]="listId()"
      [cdkDropListData]="parentPath()"
      [cdkDropListConnectedTo]="connectedTo()"
      [class.empty]="!nodes().length"
      (cdkDropListDropped)="drop($event)"
      role="list"
      [attr.aria-label]="label()"
    >
      @for (node of nodes(); track node; let i = $index, first = $first, last = $last) {
        @let path = childPath(i);
        <div
          class="canvas-node"
          role="listitem"
          cdkDrag
          [cdkDragData]="{ kind: 'move' }"
          [class.selected]="isSelected(path)"
          [class.container]="!isField(node)"
          [class.has-issue]="hasIssue(path)"
        >
          <div class="node-head">
            <span class="handle" cdkDragHandle title="Drag to move" aria-hidden="true">⠿</span>
            <button
              type="button"
              class="node-main"
              [attr.data-path]="key(path)"
              [attr.aria-pressed]="isSelected(path)"
              (click)="store.selected.set(path)"
              [attr.aria-label]="'Select ' + title(node) + ' (' + node.type + ')'"
            >
              <span class="node-icon" aria-hidden="true">{{ icon(node) }}</span>
              <span class="node-title">{{ title(node) }}</span>
              @if (!isStep(node)) {
                <code class="node-key">{{ $any(node).key }}</code>
              }
              <span class="node-badges">
                @if ($any(node).rules?.required) {
                  <span class="nb" title="Required">req</span>
                }
                @if (node.visibleWhen || node.enabledWhen || $any(node).rules?.requiredWhen) {
                  <span class="nb cond" title="Has conditions">if</span>
                }
                @if ($any(node).computed) {
                  <span class="nb calc" title="Computed">ƒx</span>
                }
                @if (hasIssue(path)) {
                  <span class="nb bad" title="Has problems">!</span>
                }
              </span>
            </button>
            <span class="node-actions">
              <button type="button" class="icon-btn sm" [disabled]="first" (click)="moveBy(path, -1)" [attr.aria-label]="'Move ' + title(node) + ' up'">↑</button>
              <button type="button" class="icon-btn sm" [disabled]="last" (click)="moveBy(path, 1)" [attr.aria-label]="'Move ' + title(node) + ' down'">↓</button>
              <button type="button" class="icon-btn sm" (click)="store.duplicate(path)" [attr.aria-label]="'Duplicate ' + title(node)">⧉</button>
              <button type="button" class="icon-btn sm danger" (click)="remove(path)" [attr.aria-label]="'Delete ' + title(node)">✕</button>
            </span>
          </div>
          @if (!isField(node)) {
            <sfb-canvas-list [nodes]="$any(node).fields" [parentPath]="path" [connectedTo]="connectedTo()" [label]="title(node) + ' fields'" />
          }
        </div>
      } @empty {
        <p class="drop-hint">{{ parentPath().length ? 'Drop fields here' : 'Drag a field type here, or click one in the palette' }}</p>
      }
    </div>
  `,
})
export class CanvasList {
  readonly nodes = input.required<readonly SchemaNode[]>();
  readonly parentPath = input.required<NodePath>();
  readonly connectedTo = input.required<string[]>();
  readonly label = input('Form fields');

  protected readonly store = inject(BuilderStore);
  private readonly registry = inject(FieldRegistry);
  private readonly injector = inject(Injector);
  protected readonly isField = isField;
  protected readonly key = pathKey;
  protected readonly isStep = isStep;

  protected readonly listId = computed(() => `list-${pathKey(this.parentPath())}`);
  private readonly issuePaths = computed(() => new Set(this.store.errors().map((i) => pathKey(i.nodePath))));

  protected childPath(i: number): NodePath {
    return [...this.parentPath(), i];
  }

  /**
   * ↑/↓ buttons. Focus stays on the same button of the moved row; at the first/last position
   * that button is disabled (and would drop focus to <body>), so use the opposite one.
   */
  protected moveBy(path: NodePath, delta: -1 | 1): void {
    const index = path[path.length - 1];
    if (!this.store.move(path, this.parentPath(), index + delta)) return;
    const moved = this.store.selected();
    afterNextRender(
      () => {
        const head = document.querySelector(`.b-canvas [data-path="${pathKey(moved ?? [])}"]`)?.closest('.node-head');
        const [up, down] = Array.from(head?.querySelectorAll<HTMLButtonElement>('.node-actions button') ?? []);
        [delta < 0 ? up : down, delta < 0 ? down : up].find((b) => b && !b.disabled)?.focus();
      },
      { injector: this.injector },
    );
  }

  protected remove(path: NodePath): void {
    removeKeepingFocus(this.store, path, this.injector);
  }

  protected isSelected(path: NodePath): boolean {
    return samePath(this.store.selected(), path);
  }

  protected hasIssue(path: NodePath): boolean {
    return this.issuePaths().has(pathKey(path));
  }

  protected title(node: SchemaNode): string {
    return isStep(node) ? node.title : node.label;
  }

  protected icon(node: SchemaNode): string {
    if (node.type === 'group') return '▣';
    if (node.type === 'repeat') return '⟳';
    if (node.type === 'step') return '➊';
    return this.registry.kinds.get(node.type)?.icon ?? '?';
  }

  protected drop(event: CdkDragDrop<NodePath, NodePath | undefined, PaletteDragData | MoveDragData>): void {
    const target = event.container.data;
    if (event.item.data.kind === 'new') {
      this.store.add(event.item.data.type, target, event.currentIndex);
      return;
    }
    const fromParent = event.previousContainer.data;
    if (!fromParent) return;
    this.store.move([...fromParent, event.previousIndex], target, event.currentIndex);
  }
}
