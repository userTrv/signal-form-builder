import { Injector, afterNextRender } from '@angular/core';
import { BuilderStore } from '../state/builder-store';
import { NodePath, nodeAtPath, pathKey } from '../state/commands';

/**
 * Removes a node and keeps keyboard focus on the canvas: on the node that took its place,
 * else the previous sibling, else the parent, else the canvas heading. Without this, focus
 * would fall back to `<body>` when the focused row disappears.
 */
export function removeKeepingFocus(store: BuilderStore, path: NodePath, injector: Injector): void {
  store.remove(path);
  const schema = store.schema();
  const index = path[path.length - 1];
  const parent = path.slice(0, -1);
  const candidates: NodePath[] = [path, ...(index > 0 ? [[...parent, index - 1]] : []), ...(parent.length ? [parent] : [])];
  const target = candidates.find((p) => nodeAtPath(schema, p));
  focusCanvasNode(target ?? null, injector);
}

/** After the next render, focuses a node's row on the canvas (or the canvas heading for `null`). */
export function focusCanvasNode(path: NodePath | null, injector: Injector): void {
  afterNextRender(
    () => {
      const el = path
        ? document.querySelector<HTMLElement>(`.b-canvas [data-path="${pathKey(path)}"]`)
        : document.getElementById('b-canvas-title');
      el?.focus();
    },
    { injector },
  );
}
