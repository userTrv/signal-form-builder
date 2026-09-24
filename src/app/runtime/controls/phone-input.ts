import { Component, ElementRef, input, model, output, viewChild } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { applyMask } from '../../engine';

/** Text input that formats digits with a mask such as `+1 (###) ###-####` while typing. */
@Component({
  selector: 'sfb-phone-input',
  template: `
    <input
      #input
      class="sfb-input"
      type="tel"
      inputmode="tel"
      autocomplete="tel"
      [id]="inputId()"
      [value]="value()"
      [attr.placeholder]="mask().replace(hashes, '0')"
      [disabled]="disabled()"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-invalid]="ariaInvalid()"
      (input)="onInput(input)"
      (blur)="touch.emit()"
    />
  `,
})
export class PhoneInput implements FormValueControl<string> {
  readonly value = model('');
  readonly disabled = input(false);
  readonly ariaInvalid = input(false);
  readonly touch = output<void>();
  readonly mask = input('+# (###) ###-####');
  readonly inputId = input('phone');
  readonly describedBy = input<string | null>(null);

  protected readonly hashes = /#/g;
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected onInput(el: HTMLInputElement): void {
    const formatted = el.value ? applyMask(this.mask(), el.value) : '';
    el.value = formatted;
    this.value.set(formatted);
  }

  focus(): void {
    this.input().nativeElement.focus();
  }
}
