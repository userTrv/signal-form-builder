import { Component, ElementRef, input, model, output, viewChild } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { FileMeta } from '../../engine';

/**
 * File input that keeps only metadata in the form value — files never leave the browser
 * and the value stays JSON-serialisable.
 */
@Component({
  selector: 'sfb-file-picker',
  template: `
    <div class="sfb-file">
      <input
        #input
        type="file"
        class="sfb-input"
        [id]="inputId()"
        [attr.accept]="accept()"
        [multiple]="multiple()"
        [disabled]="disabled()"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-invalid]="ariaInvalid()"
        (change)="pick(input.files)"
        (blur)="touch.emit()"
      />
      @if (value().length) {
        <ul class="sfb-file-list">
          @for (file of value(); track file.name; let i = $index) {
            <li>
              <span>{{ file.name }} <small>({{ size(file.size) }})</small></span>
              <button type="button" class="btn-link" (click)="remove(i)" [attr.aria-label]="'Remove ' + file.name">
                Remove
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class FilePicker implements FormValueControl<FileMeta[]> {
  readonly value = model<FileMeta[]>([]);
  readonly disabled = input(false);
  readonly ariaInvalid = input(false);
  readonly touch = output<void>();
  readonly inputId = input('file');
  readonly accept = input<string | null>(null);
  readonly multiple = input(false);
  readonly describedBy = input<string | null>(null);

  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected pick(list: FileList | null): void {
    const files = Array.from(list ?? []).map((f) => ({ name: f.name, size: f.size, type: f.type }));
    this.value.update((current) => (this.multiple() ? [...current, ...files] : files));
    this.touch.emit();
  }

  protected remove(index: number): void {
    this.value.update((files) => files.filter((_, i) => i !== index));
    this.input().nativeElement.value = '';
  }

  protected size(bytes: number): string {
    return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
  }

  focus(): void {
    this.input().nativeElement.focus();
  }

  reset(): void {
    this.input().nativeElement.value = '';
  }
}
