import { Component, computed, inject } from '@angular/core';
import {
  CrossFieldCheck,
  FieldNode,
  FieldRules,
  SchemaNode,
  SelectOption,
  isField,
  isGroup,
  isRepeat,
  isStep,
  mockBackend,
  scopeChainFor,
} from '../../engine';
import { FieldRegistry } from '../../runtime/field-registry';
import { BuilderStore } from '../state/builder-store';
import { containerPaths, pathKey, samePath } from '../state/commands';
import { ChecksEditor } from './checks-editor';
import { ExpressionInput } from './expression-input';
import { FormSettings } from './form-settings';
import { OptionsEditor } from './options-editor';
import { RulesEditor } from './rules-editor';

/** Property editor for the selected node (or the form itself when nothing is selected). */
@Component({
  selector: 'sfb-inspector',
  imports: [ExpressionInput, OptionsEditor, RulesEditor, ChecksEditor, FormSettings],
  templateUrl: './inspector.html',
})
export class Inspector {
  protected readonly store = inject(BuilderStore);
  private readonly registry = inject(FieldRegistry);
  protected readonly providers = mockBackend.optionProviders;

  protected readonly path = computed(() => this.store.selected());
  protected readonly node = computed(() => this.store.selectedNode());
  protected readonly field = computed(() => {
    const n = this.node();
    return n && isField(n) ? n : null;
  });
  protected readonly spec = computed(() => {
    const f = this.field();
    return f ? this.registry.kinds.get(f.type) : undefined;
  });
  protected readonly hasTypeSettings = computed(() => {
    const f = this.field();
    const spec = this.spec();
    const withSettings = ['text', 'textarea', 'number', 'phone', 'rating', 'file', 'date-range'];
    return !!f && (withSettings.includes(f.type) || !!spec?.needsOptions || !!spec?.computable);
  });
  protected readonly typeLabel = computed(() => {
    const n = this.node();
    if (!n) return '';
    if (isStep(n)) return 'Wizard step';
    if (isGroup(n)) return 'Group';
    if (isRepeat(n)) return 'Repeatable group';
    return `${this.spec()?.label ?? n.type} field`;
  });

  /** Scope for the node's own expressions, and the inner scope for its checks. */
  protected readonly scopes = computed(() => scopeChainFor(this.store.schema(), this.path() ?? []));
  protected readonly innerScopes = computed(() => scopeChainFor(this.store.schema(), this.path() ?? [], true));

  protected readonly issues = computed(() => {
    const key = pathKey(this.path() ?? []);
    return this.store.validation().issues.filter((i) => pathKey(i.nodePath) === key);
  });

  protected readonly destinations = computed(() => {
    const path = this.path();
    const node = this.node();
    if (!path || !node) return [];
    const parent = path.slice(0, -1);
    return containerPaths(this.store.schema())
      .filter((c) => !samePath(c.path, parent))
      .filter((c) => !(c.path.length >= path.length && path.every((v, i) => c.path[i] === v)))
      .filter((c) => (isStep(node) ? c.path.length === 0 : true))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  protected title(node: SchemaNode): string {
    return isStep(node) ? node.title : node.label;
  }

  protected set(prop: string, value: unknown): void {
    const path = this.path();
    if (!path) return;
    const clean = value === '' || value === false || value === null ? undefined : value;
    this.store.update(path, { [prop]: clean }, `${pathKey(path)}:${prop}`);
  }

  protected setNumber(prop: string, raw: string): void {
    const n = raw === '' ? undefined : Number(raw);
    this.set(prop, n === undefined || Number.isNaN(n) ? undefined : n);
  }

  protected setOptions(e: { options: SelectOption[]; key: string }): void {
    const path = this.path();
    if (path) this.store.update(path, { options: e.options }, `${pathKey(path)}:${e.key}`);
  }

  protected setRules(e: { rules: FieldRules | undefined; key: string }): void {
    const path = this.path();
    if (path) this.store.update(path, { rules: e.rules }, `${pathKey(path)}:${e.key}`);
  }

  protected setChecks(e: { checks: CrossFieldCheck[] | undefined; key: string }): void {
    const path = this.path();
    if (path) this.store.update(path, { checks: e.checks }, `${pathKey(path)}:${e.key}`);
  }

  protected setOptionsMode(mode: string): void {
    const f = this.field();
    if (!f) return;
    if (mode === 'static') {
      this.set('optionsSource', undefined);
      if (!f.options?.length) this.set('options', [{ value: 'option1', label: 'Option 1' }]);
    } else {
      this.set('optionsSource', { provider: mode });
    }
  }

  protected setOptionsParams(params: string | undefined, f: FieldNode): void {
    if (!f.optionsSource) return;
    this.set('optionsSource', { provider: f.optionsSource.provider, ...(params ? { params } : {}) });
  }

  protected moveTo(key: string): void {
    const path = this.path();
    const dest = this.destinations().find((d) => pathKey(d.path) === key);
    if (!path || !dest) return;
    const count = dest.path.length ? (this.nodeFields(dest.path)?.length ?? 0) : this.store.schema().fields.length;
    this.store.move(path, dest.path, count);
  }

  private nodeFields(path: readonly number[]): readonly SchemaNode[] | null {
    let nodes = this.store.schema().fields;
    for (const i of path) {
      const n = nodes[i];
      if (!n || isField(n)) return null;
      nodes = n.fields;
    }
    return nodes;
  }

  protected readonly isGroup = isGroup;
  protected readonly isRepeat = isRepeat;
  protected readonly isStep = isStep;
}
