import { Component, ElementRef, computed, input, model, output, viewChildren } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';

/** Star rating as a native radio group (arrow keys work out of the box) + a clear button. */
@Component({
  selector: 'sfb-rating-input',
  template: `
    <div class="sfb-rating" role="radiogroup" [attr.aria-describedby]="describedBy()">
      @for (star of stars(); track star) {
        <label class="star" [class.on]="(value() ?? 0) >= star" [for]="baseId() + '-' + star">
          <input
            #radio
            type="radio"
            class="sr-only"
            [id]="baseId() + '-' + star"
            [name]="baseId()"
            [value]="star"
            [checked]="value() === star"
            [disabled]="disabled()"
            (change)="value.set(star)"
            (blur)="touch.emit()"
          />
          <span aria-hidden="true">★</span>
          <span class="sr-only">{{ star }} of {{ scale() }}</span>
        </label>
      }
      @if (value() !== null && !disabled()) {
        <button type="button" class="btn-link" (click)="value.set(null)">Clear</button>
      }
    </div>
  `,
})
export class RatingInput implements FormValueControl<number | null> {
  readonly value = model<number | null>(null);
  readonly disabled = input(false);
  readonly touch = output<void>();
  readonly scale = input(5);
  readonly baseId = input('rating');
  readonly describedBy = input<string | null>(null);

  protected readonly stars = computed(() => Array.from({ length: this.scale() }, (_, i) => i + 1));
  private readonly radios = viewChildren<ElementRef<HTMLInputElement>>('radio');

  focus(): void {
    const index = Math.max(0, (this.value() ?? 1) - 1);
    this.radios()[index]?.nativeElement.focus();
  }
}
