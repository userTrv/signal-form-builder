import { Component, computed } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { BaseField } from './base-field';
import { FieldShell } from './field-shell';

/** text, email, password (`secret`), textarea and date — all native inputs bound with `[formField]`. */
@Component({
  selector: 'sfb-text-field',
  imports: [FieldShell, FormField],
  template: `
    <sfb-field-shell
      [node]="node()"
      [controlId]="id()"
      [hintId]="hintId()"
      [errorId]="errorId()"
      [messages]="messages()"
      [pending]="state().pending()"
      [required]="state().required()"
    >
      @switch (kind()) {
        @case ('textarea') {
          <textarea
            class="sfb-input"
            [id]="id()"
            [formField]="field()"
            [rows]="node().rows ?? 4"
            [attr.placeholder]="node().placeholder ?? null"
            [attr.aria-describedby]="describedBy()"
            [attr.aria-invalid]="showErrors()"
          ></textarea>
          @if (state().maxLength?.(); as limit) {
            <span class="sfb-counter" aria-hidden="true">{{ state().value().length }} / {{ limit }}</span>
          }
        }
        @case ('email') {
          <input
            class="sfb-input"
            type="email"
            autocomplete="email"
            [id]="id()"
            [formField]="field()"
            [attr.placeholder]="node().placeholder ?? null"
            [attr.aria-describedby]="describedBy()"
            [attr.aria-invalid]="showErrors()"
          />
        }
        @case ('password') {
          <input
            class="sfb-input"
            type="password"
            autocomplete="new-password"
            [id]="id()"
            [formField]="field()"
            [attr.aria-describedby]="describedBy()"
            [attr.aria-invalid]="showErrors()"
          />
        }
        @case ('date') {
          <input
            class="sfb-input"
            type="date"
            [id]="id()"
            [formField]="field()"
            [attr.aria-describedby]="describedBy()"
            [attr.aria-invalid]="showErrors()"
          />
        }
        @default {
          <input
            class="sfb-input"
            type="text"
            [id]="id()"
            [formField]="field()"
            [attr.placeholder]="node().placeholder ?? null"
            [attr.aria-describedby]="describedBy()"
            [attr.aria-invalid]="showErrors()"
          />
        }
      }
    </sfb-field-shell>
  `,
})
export class TextField extends BaseField<string> {
  protected readonly kind = computed(() => {
    const node = this.node();
    return node.type === 'text' && node.secret ? 'password' : node.type;
  });
}
