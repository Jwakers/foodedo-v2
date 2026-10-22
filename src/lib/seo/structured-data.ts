/** Escape HTML script boundaries without changing the structured JSON value. */
export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
