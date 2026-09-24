import { Component, ElementRef, Injector, afterNextRender, inject, signal } from '@angular/core';
import { FormSchema, countFields } from '../../engine';
import { stressSchema } from '../../examples';
import { DynamicFormComponent } from '../../runtime/components/dynamic-form.component';

interface Stats {
  readonly label: string;
  readonly samples: number;
  readonly median: number;
  readonly p95: number;
  readonly max: number;
}

const nextRender = (injector: Injector) =>
  new Promise<void>((resolve) => afterNextRender(() => resolve(), { injector }));

function stats(label: string, times: number[]): Stats {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { label, samples: times.length, median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] };
}

/**
 * Renders a generated 300-field schema with a 50-row repeatable group and measures
 * "input event → Angular finished rendering" for real DOM input events.
 */
@Component({
  selector: 'sfb-perf-page',
  imports: [DynamicFormComponent],
  templateUrl: './perf-page.html',
})
export class PerfPage {
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly schema = signal<FormSchema | null>(null);
  protected readonly fieldCount = signal(0);
  protected readonly renderMs = signal<number | null>(null);
  /** Form controls present in the DOM right after the first render (proves it completed). */
  protected readonly controls = signal(0);
  protected readonly results = signal<readonly Stats[]>([]);
  protected readonly running = signal(false);
  protected readonly grandTotal = signal<string | null>(null);

  protected async renderStress(): Promise<void> {
    this.results.set([]);
    this.schema.set(null);
    await nextRender(this.injector);
    const schema = stressSchema(300, 50);
    this.fieldCount.set(countFields(schema));
    const t0 = performance.now();
    this.schema.set(schema);
    await nextRender(this.injector);
    this.renderMs.set(performance.now() - t0);
    this.controls.set(this.host.nativeElement.querySelectorAll('.perf-form input, .perf-form select').length);
  }

  protected async runBenchmark(): Promise<void> {
    if (!this.schema()) await this.renderStress();
    this.running.set(true);
    const root = this.host.nativeElement;
    const text = root.querySelector<HTMLInputElement>('input[name$=".f1"]');
    const qty = root.querySelector<HTMLInputElement>('input[name$=".items.25.qty"]');
    const price = root.querySelector<HTMLInputElement>('input[name$=".items.25.price"]');
    if (!text || !qty || !price) {
      this.running.set(false);
      return;
    }
    price.value = '10';
    price.dispatchEvent(new Event('input', { bubbles: true }));
    await nextRender(this.injector);

    const typeInto = async (el: HTMLInputElement, value: string) => {
      const t0 = performance.now();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await nextRender(this.injector);
      return performance.now() - t0;
    };

    const textTimes: number[] = [];
    let s = '';
    for (let i = 0; i < 40; i++) {
      s = i % 20 === 19 ? '' : s + String.fromCharCode(97 + (i % 26));
      textTimes.push(await typeInto(text, s));
    }
    const qtyTimes: number[] = [];
    for (let i = 0; i < 40; i++) qtyTimes.push(await typeInto(qty, String((i % 9) + 1)));

    this.grandTotal.set(root.querySelector<HTMLInputElement>('input[name$=".grandTotal"]')?.value ?? null);
    this.results.set([
      stats('Typing into a plain text field (field 1 of 300)', textTimes),
      stats('Typing into a row quantity (row 26 of 50) → line total + grand total recompute', qtyTimes),
    ]);
    this.running.set(false);
  }

  protected fmt(ms: number | null): string {
    return ms === null ? '–' : `${ms.toFixed(1)} ms`;
  }
}
