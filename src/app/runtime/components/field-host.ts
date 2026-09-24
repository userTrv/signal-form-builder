import { NgComponentOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { FieldNode } from '../../engine';
import { FieldRegistry } from '../field-registry';

/** Looks the field type up in the registry and renders its component. */
@Component({
  selector: 'sfb-field-host',
  imports: [NgComponentOutlet],
  host: { '[class.half]': "node().width === 'half'" },
  template: `
    @if (component(); as type) {
      <ng-container *ngComponentOutlet="type; inputs: inputs()" />
    } @else {
      <p class="sfb-error">No component registered for field type "{{ node().type }}".</p>
    }
  `,
})
export class FieldHost {
  readonly node = input.required<FieldNode>();
  readonly field = input.required<FieldTree<unknown>>();

  private readonly registry = inject(FieldRegistry);
  protected readonly component = computed(() => this.registry.component(this.node().type));
  protected readonly inputs = computed(() => ({ field: this.field(), node: this.node() }));
}
