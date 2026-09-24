import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from './shared/theme.service';

@Component({
  selector: 'sfb-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a class="skip-link" href="#main" (click)="skip($event)">Skip to content</a>
    <header class="app-bar">
      <a class="brand" routerLink="/playground">
        <span class="logo" aria-hidden="true">⧉</span>
        <span>Signal Form Builder</span>
      </a>
      <nav aria-label="Main">
        <a routerLink="/playground" routerLinkActive="active" ariaCurrentWhenActive="page">Playground</a>
        <a routerLink="/builder" routerLinkActive="active" ariaCurrentWhenActive="page">Builder</a>
        <a routerLink="/why" routerLinkActive="active" ariaCurrentWhenActive="page">Why Signal Forms</a>
        <a routerLink="/perf" routerLinkActive="active" ariaCurrentWhenActive="page">Performance</a>
      </nav>
      <div class="bar-end">
        <button type="button" class="icon-btn" (click)="theme.cycle()" [attr.aria-label]="'Theme: ' + theme.theme() + ' (click to change)'">
          {{ theme.theme() === 'dark' ? '☾' : theme.theme() === 'light' ? '☀' : '◐' }}
        </button>
        <a class="icon-btn" href="https://github.com/userTrv/signal-form-builder" target="_blank" rel="noopener" aria-label="Source on GitHub">
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
        </a>
      </div>
    </header>
    <main id="main" tabindex="-1">
      <router-outlet />
    </main>
  `,
})
export class App {
  protected readonly theme = inject(ThemeService);

  protected skip(event: Event): void {
    event.preventDefault();
    document.getElementById('main')?.focus();
  }
}
