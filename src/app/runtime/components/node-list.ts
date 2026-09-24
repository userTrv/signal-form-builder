import { Component, computed, forwardRef, input } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { FieldNode, GroupNode, KeyedNode, RepeatNode, SchemaNode, scopeNodes } from '../../engine';
import { domId } from '../form-context';
import { FieldHost } from './field-host';
import { RepeatView } from './repeat-view';

type AnyTree = FieldTree<unknown> & Record<string, FieldTree<unknown>>;

interface Item {
  readonly node: KeyedNode;
  readonly field: FieldTree<unknown>;
}

/**
 * Renders the children of a scope (root, step, group or repeat row). Hidden fields are
 * removed from the DOM; their `hidden()` state comes from Signal Forms (`hidden()` rule).
 */
@Component({
  selector: 'sfb-node-list',
  imports: [FieldHost, forwardRef(() => RepeatView)],
  host: { class: 'sfb-grid' },
  template: `
    @for (item of items(); track item.node) {
      @if (!item.field().hidden()) {
        @switch (item.node.type) {
          @case ('group') {
            <fieldset class="sfb-group" [id]="dom(item.field)" tabindex="-1">
              <legend class="sfb-group-title">{{ item.node.label }}</legend>
              @if (asGroup(item.node).hint) {
                <p class="sfb-hint">{{ asGroup(item.node).hint }}</p>
              }
              <sfb-node-list [nodes]="asGroup(item.node).fields" [parent]="item.field" />
            </fieldset>
          }
          @case ('repeat') {
            <sfb-repeat-view [node]="asRepeat(item.node)" [field]="item.field" />
          }
          @default {
            <sfb-field-host [node]="asField(item.node)" [field]="item.field" />
          }
        }
      }
    }
  `,
})
export class NodeList {
  readonly nodes = input.required<readonly SchemaNode[]>();
  readonly parent = input.required<FieldTree<unknown>>();

  protected readonly items = computed<Item[]>(() => {
    const parent = this.parent() as AnyTree;
    return scopeNodes(this.nodes()).map((node) => ({ node, field: parent[node.key] }));
  });

  protected dom(field: FieldTree<unknown>): string {
    return domId(field().name());
  }

  protected asGroup(node: KeyedNode): GroupNode {
    return node as GroupNode;
  }

  protected asRepeat(node: KeyedNode): RepeatNode {
    return node as RepeatNode;
  }

  protected asField(node: KeyedNode): FieldNode {
    return node as FieldNode;
  }
}
