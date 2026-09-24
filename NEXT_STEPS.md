# Next steps (work paused mid-task)

State at pause: engine, runtime renderer, builder UI, playground, "Why Signal Forms" and performance pages are
implemented and build (`pnpm build` OK, output in `dist/` with `index.html` at the root). 119 of 121 tests pass.
Verified manually in headless Chrome from a sub-path (`/projects/signal-form-builder/`): sign-up, job wizard,
insurance (computed premium), event registration (repeatable rows), builder (add/select/edit/expression editor/
undo/redo/palette drag/nesting drag/JSON two-way). Console was clean in all runs.

## Known failing tests (fix first)

- `src/app/runtime/dynamic-form.spec.ts` → "async validators (fake timers)":
  - "debounces, reports pending…": `backend.stats.started` is already 1 after 100 ms — the `debounce` option of
    `validateAsync` apparently does not delay the resource with fake timers the way the test assumes (or the
    debounce applies differently). Investigate how `validateAsync`'s `debounce` interacts with `resource()` in
    Angular 22.2 and adjust the test (or the implementation in `engine/model/build-rules.ts`).
  - "cancels an in-flight check…": `stats.aborted` is 0 — same root cause; re-time the steps once the debounce
    behaviour is understood. Cancellation itself is implemented via the resource `AbortSignal`
    (`engine/model/mock-backend.ts` → `delay()`).

## Not done yet (from the task spec)

1. Tests still to write:
   - component tests for the renderer (`DynamicFormComponent`: renders fields from a schema, hides/shows on
     conditions) and for the error summary (focus moves to the summary on failed submit, links focus the field,
     wizard jumps to the step);
   - `BuilderStore` integration test (add / move / nest / undo through the store);
   - `repeat-ops.ts` unit tests (currently only covered indirectly).
2. `pnpm lint` has never been run — run it and fix findings (angular-eslint flat config is set up, selector
   prefix `sfb`).
3. `.github/workflows/ci.yml` (name exactly `CI`: pnpm install, lint, test, build; actions/checkout@v5,
   pnpm/action-setup@v4, actions/setup-node@v5 with Node 24). `notify-site.yml` is already copied.
4. `LICENSE` (MIT, Kirill Levin 2026).
5. README (English): pitch, live demo link https://usertrv.dev/projects/signal-form-builder/, screenshots in
   `docs/` (< 500 KB each), features, architecture (mermaid), schema format docs (`docs/SCHEMA.md` or README
   section), how to register a custom field type (`provideFieldTypes` + `CustomFieldValues` augmentation),
   tech decisions & trade-offs, measured numbers, how to run/test/build, limitations. Replace the Angular CLI
   default README.
6. Measured numbers so far (in-app benchmark, headless Chrome on this Mac, production build):
   first render of the stress form (305 schema fields → 501 controls) ≈ 63 ms; keystroke → render in a plain
   field: median 2.0 ms / p95 6.1 ms; in a row quantity (recomputes line + grand total): median 2.6 ms /
   p95 4.4 ms (40 samples each). Re-measure after changes and put them in the README with the machine name.
7. Final verification pass: copy `dist/` to `<tmp>/x/projects/signal-form-builder/`, serve `<tmp>/x` on port 8942,
   walk every flow as a first-time user at 1440 px and 375 px, light and dark theme, check console; take README
   screenshots. Not yet checked: 375 px width, dark theme, keyboard-only pass through builder and wizard,
   perf page UI screenshot.
8. Split history into logical conventional commits if desired (currently one WIP commit).

## Small known issues / ideas noticed during manual testing

- Renaming a field key in the builder does not rewrite expressions that reference it (validation flags them as
  "Unknown field"); document as a limitation or implement.
- Hidden fields keep their values in the submitted object (Signal Forms behaviour) — document.
- Builder palette → drag works with CDK drop lists connected deepest-first; keyboard alternative is click-to-add
  plus the "Move to…" select in the inspector — mention in README.
- `DynamicFormComponent` creates the form inside a `computed` (untracked) and tears the previous instance down
  via a child `EnvironmentInjector`; worth a comment in README "trade-offs".
- Component file sizes: all components are under ~300 lines; `inspector.html` is ~150 lines of template.
