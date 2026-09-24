import {
  Component,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  Injector,
  afterNextRender,
  computed,
  createEnvironmentInjector,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FieldTree, ValidationError } from '@angular/forms/signals';
import { FormSchema, ModelObject, StepNode, isStep, isTruthy, locate, scopeNodes } from '../../engine';
import { DynamicForm, createUntypedForm } from '../dynamic-form';
import { errorMessage } from '../error-messages';
import { FieldRegistry } from '../field-registry';
import { DynamicFormContext, domId, pathKeysOf } from '../form-context';
import { ErrorSummary, SummaryItem } from './error-summary';
import { NodeList } from './node-list';
import { StepView, WizardNav } from './wizard-nav';

type AnyTree = FieldTree<unknown> & Record<string, FieldTree<unknown>>;

/**
 * Renders any valid `FormSchema`. The form instance is rebuilt when the schema input
 * changes (the builder preview does this on every edit); each instance lives in its own
 * child injector so its effects and async-validation resources are torn down with it.
 */
@Component({
  selector: 'sfb-dynamic-form',
  imports: [NodeList, ErrorSummary, WizardNav],
  providers: [DynamicFormContext],
  templateUrl: './dynamic-form.component.html',
})
export class DynamicFormComponent {
  readonly schema = input.required<FormSchema>();
  readonly showHeader = input(true);
  /** Emits the validated value after a successful submit. */
  readonly submitted = output<ModelObject>();
  /** Emits every new form instance (e.g. for a live value panel). */
  readonly ready = output<DynamicForm<ModelObject>>();

  private readonly ctx = inject(DynamicFormContext);
  private readonly registry = inject(FieldRegistry);
  private readonly env = inject(EnvironmentInjector);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly summaryRef = viewChild(ErrorSummary);
  private instanceInjector: EnvironmentInjector | null = null;

  /** `'all'` after a failed submit, a step index after a failed "Next", else `null`. */
  private readonly summaryScope = signal<'all' | number | null>(null);
  protected readonly status = signal<'idle' | 'checking' | 'done'>('idle');
  protected readonly stepIndex = signal(0);
  protected readonly reached = signal(0);

  readonly instance = computed(() => {
    const schema = this.schema();
    return untracked(() => this.createInstance(schema));
  });

  protected readonly root = computed(() => this.instance().form as AnyTree);

  protected readonly steps = computed<StepView[]>(() => {
    const inst = this.instance();
    return inst.schema.fields
      .map((node, index) => ({ node, index }))
      .filter((x): x is { node: StepNode; index: number } => isStep(x.node))
      .filter(({ node }) => !node.visibleWhen || isTruthy(this.ctx.evaluate(node.visibleWhen, [])))
      .map(({ node, index }) => ({ step: node, index, invalid: this.stepErrors(node).length > 0 }));
  });

  protected readonly isWizard = computed(() => this.steps().length > 0);
  protected readonly currentStep = computed(() => this.steps()[Math.min(this.stepIndex(), this.steps().length - 1)]);
  protected readonly isLastStep = computed(() => this.stepIndex() >= this.steps().length - 1);

  protected readonly summaryItems = computed<SummaryItem[]>(() => {
    const scope = this.summaryScope();
    if (scope === null) return [];
    const errors =
      scope === 'all' ? this.root()().errorSummary() : this.stepErrors(this.steps()[scope]?.step);
    return errors.filter((e) => !e.fieldTree().hidden()).map((e, i) => this.toSummaryItem(e, i));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.instanceInjector?.destroy());
  }

  private createInstance(schema: FormSchema): DynamicForm<ModelObject> {
    this.instanceInjector?.destroy();
    this.instanceInjector = createEnvironmentInjector([], this.env);
    const instance = createUntypedForm(schema, {
      injector: this.instanceInjector,
      kinds: this.registry.kinds,
      onSubmit: (value) => {
        this.status.set('done');
        this.submitted.emit(value);
      },
      onInvalid: () => this.showSummary('all'),
    });
    this.ctx.attach(instance);
    this.summaryScope.set(null);
    this.status.set('idle');
    this.stepIndex.set(0);
    this.reached.set(0);
    queueMicrotask(() => this.ready.emit(instance));
    return instance;
  }

  private stepErrors(step: StepNode | undefined): ValidationError.WithFieldTree[] {
    if (!step) return [];
    const root = this.root();
    return scopeNodes(step.fields).flatMap((n) => {
      const state = root[n.key]();
      return state.hidden() ? [] : state.errorSummary();
    });
  }

  private toSummaryItem(error: ValidationError.WithFieldTree, i: number): SummaryItem {
    const inst = this.instance();
    const state = error.fieldTree();
    const keys = pathKeysOf(state.name(), inst.name);
    const found = locate(inst.schema, keys);
    const isList = found && ['multiselect', 'file'].includes(found.node.type);
    return {
      key: `${state.name()}:${error.kind}:${i}`,
      label: found?.labelPath.join(' › ') ?? keys.join('.'),
      message: errorMessage(error, !!isList),
      stepIndex: found?.stepIndex ?? -1,
      focus: () => {
        state.focusBoundControl();
        if (!this.host.nativeElement.contains(document.activeElement) || document.activeElement === document.body) {
          document.getElementById(domId(state.name()))?.focus();
        }
      },
    };
  }

  private showSummary(scope: 'all' | number): void {
    this.status.set('idle');
    this.summaryScope.set(scope);
    afterNextRender(() => this.summaryRef()?.focus(), { injector: this.injector });
  }

  protected goToError(item: SummaryItem): void {
    const stepPos = this.steps().findIndex((s) => s.index === item.stepIndex);
    if (stepPos >= 0 && stepPos !== this.stepIndex()) {
      this.stepIndex.set(stepPos);
      afterNextRender(() => item.focus(), { injector: this.injector });
    } else {
      item.focus();
    }
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.isWizard() && !this.isLastStep()) return this.next();
    this.status.set('checking');
    const ok = await this.instance().submit();
    if (ok) this.summaryScope.set(null);
    else if (this.status() === 'checking') this.status.set('idle');
  }

  protected async next(): Promise<void> {
    const step = this.currentStep()?.step;
    if (!step) return;
    const root = this.root();
    for (const n of scopeNodes(step.fields)) root[n.key]().markAsTouched();
    if (this.stepErrors(step).length) return this.showSummary(this.stepIndex());
    this.summaryScope.set(null);
    this.stepIndex.update((i) => i + 1);
    this.reached.update((r) => Math.max(r, this.stepIndex()));
    this.focusStepHeading();
  }

  protected back(): void {
    this.summaryScope.set(null);
    this.stepIndex.update((i) => Math.max(0, i - 1));
    this.focusStepHeading();
  }

  protected goTo(index: number): void {
    this.summaryScope.set(null);
    this.stepIndex.set(index);
    this.focusStepHeading();
  }

  protected reset(): void {
    this.instance().reset();
    this.summaryScope.set(null);
    this.status.set('idle');
    this.stepIndex.set(0);
    this.reached.set(0);
  }

  private focusStepHeading(): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.sfb-step-title')?.focus(), {
      injector: this.injector,
    });
  }
}
