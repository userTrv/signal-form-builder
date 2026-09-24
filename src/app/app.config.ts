import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Hash routing: the demo is served from a sub-path by a static server without SPA fallback.
    provideRouter(routes, withHashLocation(), withComponentInputBinding()),
  ],
};
