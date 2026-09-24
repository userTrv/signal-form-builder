import {
  DEFAULT_KINDS,
  FieldKindRegistry,
  FormSchema,
  SchemaNode,
  isField,
  isStep,
  scopeNodes,
} from '../../engine';

/**
 * Pure, immutable edit operations on a schema. Nodes are addressed by index path
 * (`[]` = root, `[1, 0]` = first child of the second root node). Every function returns a
 * new schema that shares untouched branches with the old one, which keeps undo/redo
 * snapshots cheap and lets Angular skip unchanged subtrees.
 */
export type NodePath = readonly number[];

export class CommandError extends Error {}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export function childrenAt(schema: FormSchema, parent: NodePath): readonly SchemaNode[] {
  let nodes = schema.fields;
  for (const i of parent) {
    const node = nodes[i];
    if (!node || isField(node)) throw new CommandError(`No container at ${parent.join('.')}`);
    nodes = node.fields;
  }
  return nodes;
}

export function nodeAtPath(schema: FormSchema, path: NodePath): SchemaNode | null {
  if (!path.length) return null;
  try {
    return childrenAt(schema, path.slice(0, -1))[path[path.length - 1]] ?? null;
  } catch {
    return null;
  }
}

/** Replaces the children of the container at `parent`. */
function withChildren(schema: FormSchema, parent: NodePath, update: (nodes: SchemaNode[]) => SchemaNode[]): FormSchema {
  const rec = (nodes: readonly SchemaNode[], depth: number): SchemaNode[] => {
    if (depth === parent.length) return update([...nodes]);
    const i = parent[depth];
    const node = nodes[i];
    if (!node || isField(node)) throw new CommandError(`No container at ${parent.join('.')}`);
    const copy = [...nodes];
    copy[i] = { ...node, fields: rec(node.fields, depth + 1) } as SchemaNode;
    return copy;
  };
  return { ...schema, fields: rec(schema.fields, 0) };
}

const isPrefix = (a: NodePath, b: NodePath) => a.length <= b.length && a.every((v, i) => b[i] === v);

/** Keys already used in the scope that `parent` belongs to (steps share the root scope). */
export function keysInScope(schema: FormSchema, parent: NodePath, exclude?: SchemaNode): Set<string> {
  let scopeParent = parent;
  const first = parent.length ? schema.fields[parent[0]] : undefined;
  if (parent.length === 1 && first && isStep(first)) scopeParent = [];
  const nodes = scopeParent.length ? childrenAt(schema, scopeParent) : schema.fields;
  return new Set(scopeNodes(nodes).filter((n) => n !== exclude).map((n) => n.key));
}

export function uniqueKey(base: string, taken: ReadonlySet<string>): string {
  const clean = base.replace(/[^A-Za-z0-9_]/g, '').replace(/^[0-9]+/, '') || 'field';
  if (!taken.has(clean)) return clean;
  let i = 2;
  while (taken.has(`${clean}${i}`)) i++;
  return `${clean}${i}`;
}

function assertPlacement(schema: FormSchema, parent: NodePath, node: SchemaNode): void {
  if (isStep(node) && parent.length) throw new CommandError('Steps can only live at the top level');
  if (!parent.length) {
    const hasSteps = schema.fields.some(isStep);
    const others = schema.fields.some((n) => !isStep(n));
    if (isStep(node) && others) throw new CommandError('Move the top-level fields into a step first');
    if (!isStep(node) && hasSteps) throw new CommandError('This form is a wizard — drop fields inside a step');
  }
}

/** Gives a keyed node a key that is unique in the target scope. */
function withUniqueKey(schema: FormSchema, parent: NodePath, node: SchemaNode, exclude?: SchemaNode): SchemaNode {
  if (isStep(node)) {
    const ids = new Set(schema.fields.filter(isStep).filter((s) => s !== exclude).map((s) => s.id));
    return ids.has(node.id) ? { ...node, id: uniqueKey(node.id, ids) } : node;
  }
  const taken = keysInScope(schema, parent, exclude);
  return taken.has(node.key) ? { ...node, key: uniqueKey(node.key, taken) } : node;
}

export function insertNode(schema: FormSchema, parent: NodePath, index: number, node: SchemaNode): { schema: FormSchema; path: NodePath } {
  assertPlacement(schema, parent, node);
  const placed = withUniqueKey(schema, parent, node);
  const count = childrenAt(schema, parent).length;
  const at = Math.max(0, Math.min(index, count));
  return {
    schema: withChildren(schema, parent, (nodes) => [...nodes.slice(0, at), placed, ...nodes.slice(at)]),
    path: [...parent, at],
  };
}

/**
 * Turns a flat form into a wizard: the existing top-level nodes become the first step.
 * Returns the schema unchanged when it already has steps or has no fields.
 */
export function wrapInStep(schema: FormSchema, title = 'Step 1'): FormSchema {
  if (!schema.fields.length || schema.fields.some(isStep)) return schema;
  return { ...schema, fields: [{ type: 'step', id: 'step1', title, fields: schema.fields }] };
}

export function removeNode(schema: FormSchema, path: NodePath): FormSchema {
  if (!nodeAtPath(schema, path)) throw new CommandError('Nothing to remove');
  const index = path[path.length - 1];
  return withChildren(schema, path.slice(0, -1), (nodes) => nodes.filter((_, i) => i !== index));
}

/**
 * Moves a node to `toIndex` within `toParent` (index as seen *before* the move, like
 * CDK drag-drop reports it). Refuses to move a container into itself.
 */
export function moveNode(
  schema: FormSchema,
  from: NodePath,
  toParent: NodePath,
  toIndex: number,
): { schema: FormSchema; path: NodePath } {
  const node = nodeAtPath(schema, from);
  if (!node) throw new CommandError('Nothing to move');
  if (isPrefix(from, toParent)) throw new CommandError('A container cannot be moved into itself');
  const fromParent = from.slice(0, -1);
  const fromIndex = from[from.length - 1];
  const sameParent = fromParent.length === toParent.length && isPrefix(fromParent, toParent);

  if (sameParent) {
    const count = childrenAt(schema, toParent).length;
    const target = Math.max(0, Math.min(toIndex, count - 1));
    return {
      schema: withChildren(schema, toParent, (nodes) => {
        const [moved] = nodes.splice(fromIndex, 1);
        nodes.splice(target, 0, moved);
        return nodes;
      }),
      path: [...toParent, target],
    };
  }

  const removed = removeNode(schema, from);
  // Removing `from` shifts later siblings of an ancestor of `toParent` one to the left.
  const adjusted = toParent.map((v, depth) =>
    depth === fromParent.length && isPrefix(fromParent, toParent) && v > fromIndex ? v - 1 : v,
  );
  assertPlacement(removed, adjusted, node);
  const placed = withUniqueKey(removed, adjusted, node);
  return insertNode(removed, adjusted, toIndex, placed);
}

export function updateNode(schema: FormSchema, path: NodePath, patch: Partial<Record<string, unknown>>): FormSchema {
  const index = path[path.length - 1];
  return withChildren(schema, path.slice(0, -1), (nodes) => {
    const node = nodes[index];
    if (!node) throw new CommandError('Nothing to update');
    const next = { ...node, ...patch } as Mutable<SchemaNode> & Record<string, unknown>;
    // `undefined` removes a property, so exported JSON stays clean.
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
    nodes[index] = next as SchemaNode;
    return nodes;
  });
}

export function updateForm(schema: FormSchema, patch: Partial<Record<string, unknown>>): FormSchema {
  const next = { ...schema, ...patch } as FormSchema & Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
  return next;
}

export function duplicateNode(schema: FormSchema, path: NodePath): { schema: FormSchema; path: NodePath } {
  const node = nodeAtPath(schema, path);
  if (!node) throw new CommandError('Nothing to duplicate');
  const copy = structuredClone(node) as SchemaNode;
  const labelled = isStep(copy) ? { ...copy, title: `${copy.title} (copy)` } : { ...copy, label: `${copy.label} (copy)` };
  return insertNode(schema, path.slice(0, -1), path[path.length - 1] + 1, labelled);
}

const DEFAULT_OPTIONS = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
];

/** A fresh node of the given palette type with sensible defaults. */
export function createNode(type: string, kinds: FieldKindRegistry = DEFAULT_KINDS): SchemaNode {
  switch (type) {
    case 'step':
      return { type: 'step', id: 'step', title: 'New step', fields: [] };
    case 'group':
      return { type: 'group', key: 'group', label: 'Group', fields: [] };
    case 'repeat':
      return { type: 'repeat', key: 'items', label: 'Repeatable group', itemLabel: 'Item', fields: [] };
  }
  const spec = kinds.get(type);
  if (!spec) throw new CommandError(`Unknown field type "${type}"`);
  const key = type.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
  return {
    type,
    key,
    label: spec.label,
    ...(spec.needsOptions ? { options: DEFAULT_OPTIONS } : {}),
    ...(type === 'phone' ? { mask: '+1 (###) ###-####' } : {}),
  };
}

/** Every container path (for "move to…" menus and drop-list wiring), deepest first. */
export function containerPaths(schema: FormSchema): { path: NodePath; label: string; depth: number }[] {
  const out: { path: NodePath; label: string; depth: number }[] = [];
  const rec = (nodes: readonly SchemaNode[], prefix: NodePath, trail: string) =>
    nodes.forEach((n, i) => {
      if (isField(n)) return;
      const path = [...prefix, i];
      const label = `${trail}${isStep(n) ? n.title : n.label}`;
      out.push({ path, label, depth: path.length });
      rec(n.fields, path, `${label} › `);
    });
  if (!schema.fields.some(isStep)) out.push({ path: [], label: 'Form (top level)', depth: 0 });
  rec(schema.fields, [], '');
  return out.sort((a, b) => b.depth - a.depth);
}

export function pathKey(path: NodePath): string {
  return path.length ? path.join('.') : 'root';
}

export function parsePathKey(key: string): NodePath {
  return key === 'root' ? [] : key.split('.').map(Number);
}

export function samePath(a: NodePath | null, b: NodePath | null): boolean {
  return !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);
}
