import { Injectable, signal } from '@angular/core';
import { FormSchema } from '../../engine';

const SAVED_KEY = 'sfb.saved.v1';
const DRAFT_KEY = 'sfb.draft.v1';

export interface SavedSchema {
  readonly name: string;
  readonly savedAt: string;
  readonly schema: unknown;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * localStorage persistence: named saves plus an autosaved draft. Everything read back is
 * treated as untrusted and goes through `validateSchema` before use.
 */
@Injectable({ providedIn: 'root' })
export class SchemaStorage {
  readonly saved = signal<readonly SavedSchema[]>(read<SavedSchema[]>(SAVED_KEY, []));

  save(name: string, schema: FormSchema): boolean {
    const entry: SavedSchema = { name, savedAt: new Date().toISOString(), schema };
    const next = [entry, ...this.saved().filter((s) => s.name !== name)].slice(0, 30);
    const ok = write(SAVED_KEY, next);
    if (ok) this.saved.set(next);
    return ok;
  }

  remove(name: string): void {
    const next = this.saved().filter((s) => s.name !== name);
    write(SAVED_KEY, next);
    this.saved.set(next);
  }

  loadDraft(): unknown {
    return read<unknown>(DRAFT_KEY, null);
  }

  saveDraft(schema: FormSchema): void {
    write(DRAFT_KEY, schema);
  }
}
