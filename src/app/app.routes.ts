import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'playground' },
  {
    path: 'playground',
    title: 'Playground · Signal Form Builder',
    loadComponent: () => import('./pages/playground/playground-page').then((m) => m.PlaygroundPage),
  },
  {
    path: 'builder',
    title: 'Builder · Signal Form Builder',
    loadComponent: () => import('./builder/components/builder-page').then((m) => m.BuilderPage),
  },
  {
    path: 'why',
    title: 'Why Signal Forms · Signal Form Builder',
    loadComponent: () => import('./pages/why/why-page').then((m) => m.WhyPage),
  },
  {
    path: 'perf',
    title: 'Performance · Signal Form Builder',
    loadComponent: () => import('./pages/perf/perf-page').then((m) => m.PerfPage),
  },
  { path: '**', redirectTo: 'playground' },
];
