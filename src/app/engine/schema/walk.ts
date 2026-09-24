import { DEFAULT_KINDS, FieldKindRegistry, defaultFieldValue } from './field-kinds';
import {
  FieldNode,
  FormSchema,
  KeyedNode,
  RepeatNode,
  SchemaNode,
  StepNode,
  isField,
  isGroup,
  isRepeat,
  isStep,
} from './types';

/**
 * Steps are layout-only, so the keyed children of a scope are its nodes with steps
 * flattened away.
 */
export function scopeNodes(nodes: readonly SchemaNode[]): KeyedNode[] {
  return nodes.flatMap((n) => (isStep(n) ? scopeNodes(n.fields) : [n]));
}

export type ModelObject = Record<string, unknown>;

export function initialNodesValue(
  nodes: readonly SchemaNode[],
  kinds: FieldKindRegistry = DEFAULT_KINDS,
): ModelObject {
  const value: ModelObject = {};
  for (const node of scopeNodes(nodes)) {
    if (isGroup(node)) value[node.key] = initialNodesValue(node.fields, kinds);
    else if (isRepeat(node)) {
      const count = Math.max(node.initialItems ?? Math.max(node.minItems ?? 0, 1), node.minItems ?? 0);
      value[node.key] = Array.from({ length: count }, () => initialNodesValue(node.fields, kinds));
    } else value[node.key] = defaultFieldValue(node, kinds);
  }
  return value;
}

export function initialValue(schema: FormSchema, kinds: FieldKindRegistry = DEFAULT_KINDS): ModelObject {
  return initialNodesValue(schema.fields, kinds);
}

export function initialRow(node: RepeatNode, kinds: FieldKindRegistry = DEFAULT_KINDS): ModelObject {
  return initialNodesValue(node.fields, kinds);
}

/**
 * A lexical scope for expressions: the root form, a group, or one row of a repeat.
 * Identifiers are resolved from the innermost scope outwards, so inside an "attendees"
 * row `price` means *this row's* price while `attendees.price` (at root) is the list.
 */
export interface StaticScope {
  readonly nodes: readonly KeyedNode[];
  readonly byKey: ReadonlyMap<string, KeyedNode>;
}

const scopeCache = new WeakMap<readonly SchemaNode[], StaticScope>();

/** Scopes are derived from immutable node arrays, so they are cached per array. */
export function makeScope(nodes: readonly SchemaNode[]): StaticScope {
  let scope = scopeCache.get(nodes);
  if (!scope) {
    const flat = scopeNodes(nodes);
    scope = { nodes: flat, byKey: new Map(flat.map((n) => [n.key, n])) };
    scopeCache.set(nodes, scope);
  }
  return scope;
}

export interface BoundRef {
  /** Index into the scope chain (0 = root). */
  readonly depth: number;
  readonly key: string;
  readonly rest: readonly string[];
  readonly node: KeyedNode;
}

/** Statically binds an identifier path to the scope that declares its first segment. */
export function bindRef(chain: readonly StaticScope[], path: readonly string[]): BoundRef | null {
  const [key, ...rest] = path;
  for (let depth = chain.length - 1; depth >= 0; depth--) {
    const node = chain[depth].byKey.get(key);
    if (node) return { depth, key, rest, node };
  }
  return null;
}

/** Checks that `rest` is a valid path below `node`; returns an error message or null. */
export function checkRefTail(node: KeyedNode, rest: readonly string[]): string | null {
  let current: KeyedNode = node;
  for (const segment of rest) {
    if (isGroup(current) || isRepeat(current)) {
      const child = scopeNodes(current.fields).find((c) => c.key === segment);
      if (!child) return `"${current.key}" has no field "${segment}"`;
      current = child;
    } else if (current.type === 'date-range' && (segment === 'start' || segment === 'end')) {
      return null;
    } else {
      return `"${current.key}" is a ${current.type} field and has no "${segment}"`;
    }
  }
  return null;
}

export interface LocatedNode {
  readonly node: KeyedNode;
  /** Index of the top-level wizard step containing the node, or -1. */
  readonly stepIndex: number;
  /** Human readable location, e.g. "Attendees › #2 › Email". */
  readonly labelPath: readonly string[];
}

/**
 * Maps a value path (e.g. `['attendees', '1', 'email']`) back to the schema node.
 * Used to label errors in the error summary and to jump to the right wizard step.
 */
export function locate(schema: FormSchema, keys: readonly string[]): LocatedNode | null {
  let nodes = schema.fields;
  let stepIndex = -1;
  const labelPath: string[] = [];
  let found: KeyedNode | null = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (i === 0) {
      stepIndex = nodes.findIndex((n) => isStep(n) && scopeNodes(n.fields).some((c) => c.key === key));
    }
    const node = scopeNodes(nodes).find((n) => n.key === key);
    if (!node) return null;
    found = node;
    labelPath.push(node.label);
    if (isRepeat(node) && i + 1 < keys.length && /^\d+$/.test(keys[i + 1])) {
      labelPath.push(`${node.itemLabel ?? 'Item'} #${Number(keys[i + 1]) + 1}`);
      i++;
    }
    if (isGroup(node) || isRepeat(node)) nodes = node.fields;
    else if (i + 1 < keys.length && node.type !== 'date-range') return null;
    else if (node.type === 'date-range' && i + 1 < keys.length) {
      const end = keys[i + 1] === 'end';
      labelPath.push(end ? (node.endLabel ?? 'End') : (node.startLabel ?? 'Start'));
      break;
    }
  }
  return found ? { node: found, stepIndex, labelPath } : null;
}

export interface VisitContext {
  /** Index path from the root, e.g. `[0, 2, 1]` (steps and groups count as levels). */
  readonly indexPath: readonly number[];
  /** Expression scope chain valid for this node's own expressions. */
  readonly scopes: readonly StaticScope[];
  readonly parent: SchemaNode | null;
}

/** Depth-first traversal that also tracks the scope chain (used by validation and type-gen). */
export function walk(
  schema: FormSchema,
  fn: (node: SchemaNode, ctx: VisitContext) => void,
): void {
  const rec = (
    nodes: readonly SchemaNode[],
    scopes: readonly StaticScope[],
    indexPath: readonly number[],
    parent: SchemaNode | null,
  ) => {
    nodes.forEach((node, i) => {
      const path = [...indexPath, i];
      fn(node, { indexPath: path, scopes, parent });
      if (isStep(node)) rec(node.fields, scopes, path, node);
      else if (isGroup(node) || isRepeat(node)) {
        rec(node.fields, [...scopes, makeScope(node.fields)], path, node);
      }
    });
  };
  rec(schema.fields, [makeScope(schema.fields)], [], null);
}

/**
 * Scope chain for expressions written on the node at `indexPath` (its parents' scopes).
 * With `inner: true` the node's own scope is added — for a group's / repeat's `checks`.
 */
export function scopeChainFor(schema: FormSchema, indexPath: readonly number[], inner = false): StaticScope[] {
  const chain = [makeScope(schema.fields)];
  let nodes = schema.fields;
  indexPath.forEach((i, depth) => {
    const node = nodes[i];
    if (!node || isField(node)) return;
    const isLast = depth === indexPath.length - 1;
    if ((isGroup(node) || isRepeat(node)) && (!isLast || inner)) chain.push(makeScope(node.fields));
    nodes = node.fields;
  });
  return chain;
}

export function steps(schema: FormSchema): StepNode[] {
  return schema.fields.filter(isStep);
}

export function allFields(nodes: readonly SchemaNode[]): FieldNode[] {
  return nodes.flatMap((n) => (isField(n) ? [n] : allFields(n.fields)));
}

/** Returns the node at an index path (as produced by `walk`). */
export function nodeAt(schema: FormSchema, indexPath: readonly number[]): SchemaNode | null {
  let nodes = schema.fields;
  let node: SchemaNode | null = null;
  for (const i of indexPath) {
    node = nodes[i] ?? null;
    if (!node) return null;
    nodes = isField(node) ? [] : node.fields;
  }
  return node;
}
