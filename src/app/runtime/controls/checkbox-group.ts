import { Component, ElementRef, input, model, output, viewChildren } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { SelectOption } from '../../engine';

/**
 * A custom Signal Forms control (`FormValueControl<string[]>`): the `[formField]` directive
 * syncs `value`, `disabled` and `touched` automatically — no ControlValueAccessor.
 */
@Component({
  selector: 'sfb-checkbox-group',
  template: `
    <div class="sfb-options" [class.row]="options().length <= 4" role="group" [attr.aria-describedby]="describedBy()">
      @for (opt of options(); track opt.value; let i = $index) {
        <label class="sfb-check" [for]="baseId() + '-' + i">
          <input
            #box
            type="checkbox"
            [id]="baseId() + '-' + i"
            [checked]="value().includes(opt.value)"
            [disabled]="disabled()"
            (change)="toggle(opt.value, box.checked)"
            (blur)="touch.emit()"
          />
          <span>{{ opt.label }}</span>
        </label>
      }
    </div>
  `,
})
export class CheckboxGroup implements FormValueControl<string[]> {
  readonly value = model<string[]>([]);
  readonly disabled = input(false);
  readonly touch = output<void>();
  readonly options = input<readonly SelectOption[]>([]);
  readonly baseId = input('cbg');
  readonly describedBy = input<string | null>(null);

  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');

  protected toggle(option: string, checked: boolean): void {
    const order = this.options().map((o) => o.value);
    this.value.update((current) => {
      const next = checked ? [...new Set([...current, option])] : current.filter((v) => v !== option);
      return next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    });
  }

  focus(): void {
    this.boxes()[0]?.nativeElement.focus();
  }
}
