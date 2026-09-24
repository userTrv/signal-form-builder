import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'sfb.theme';

function readStored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Light / dark / system theme via `data-theme` on `<html>`; tokens live in styles.scss. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(readStored());

  constructor() {
    effect(() => {
      const theme = this.theme();
      const root = document.documentElement;
      if (theme === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', theme);
      try {
        localStorage.setItem(KEY, theme);
      } catch {
        /* storage unavailable (private mode) — theme still applies for this session */
      }
    });
  }

  cycle(): void {
    const order: Theme[] = ['system', 'light', 'dark'];
    this.theme.update((t) => order[(order.indexOf(t) + 1) % order.length]);
  }
}
