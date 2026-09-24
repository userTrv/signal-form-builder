import { Component, input, output } from '@angular/core';
import { SelectOption } from '../../engine';

/** Edits a static option list (value / label rows). */
@Component({
  selector: 'sfb-options-editor',
  template: `
    <fieldset class="insp-fieldset">
      <legend class="insp-label">Options</legend>
      @for (opt of options(); track $index; let i = $index) {
        <div class="opt-row">
          <input class="sfb-input" [value]="opt.label" (input)="patch(i, 'label', $any($event.target).value)" [attr.aria-label]="'Option ' + (i + 1) + ' label'" placeholder="Label" />
          <input class="sfb-input mono" [value]="opt.value" (input)="patch(i, 'value', $any($event.target).value)" [attr.aria-label]="'Option ' + (i + 1) + ' value'" placeholder="value" />
          <button type="button" class="icon-btn sm danger" (click)="removeAt(i)" [attr.aria-label]="'Remove option ' + (i + 1)">✕</button>
        </div>
      }
      <button type="button" class="btn secondary small" (click)="add()">+ Add option</button>
    </fieldset>
  `,
})
export class OptionsEditor {
  readonly options = input.required<readonly SelectOption[]>();
  readonly changed = output<{ options: SelectOption[]; key: string }>();

  protected patch(index: number, prop: 'label' | 'value', text: string): void {
    const next = this.options().map((o, i) => (i === index ? { ...o, [prop]: text } : o));
    this.changed.emit({ options: next, key: `options:${index}:${prop}` });
  }

  protected removeAt(index: number): void {
    this.changed.emit({ options: this.options().filter((_, i) => i !== index), key: `options:remove` });
  }

  protected add(): void {
    const n = this.options().length + 1;
    this.changed.emit({ options: [...this.options(), { value: `option${n}`, label: `Option ${n}` }], key: 'options:add' });
  }
}
