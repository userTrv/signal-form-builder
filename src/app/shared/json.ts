/** Pretty JSON for display; `undefined` becomes absent, as in real submissions. */
export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'undefined';
}
