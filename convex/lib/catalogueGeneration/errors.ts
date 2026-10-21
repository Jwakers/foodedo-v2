const phaseLabels: Record<string, string> = {
  authoring: "Recipe writing",
  culinary_review: "Culinary review",
  selection: "Recipe selection",
  targeted_repair: "Recipe repair",
  enrichment: "Catalogue tagging",
};

export function isGenerationTimeout(error: unknown): boolean {
  let current = error;
  for (let depth = 0; current && depth < 4; depth++) {
    if (typeof current === "string")
      return /timeout|timed[ -]?out/i.test(current);
    if (typeof current !== "object") return false;
    const detail = current as {
      name?: unknown;
      message?: unknown;
      cause?: unknown;
      responseBody?: unknown;
    };
    if (
      [detail.name, detail.message, detail.responseBody].some(
        (value) =>
          typeof value === "string" && /timeout|timed[ -]?out/i.test(value),
      )
    )
      return true;
    current = detail.cause;
  }
  return false;
}

export function generationTimeoutMessage(
  role: string,
  milliseconds: number,
  localAbort: boolean,
  deadlineLimited: boolean,
) {
  const label = phaseLabels[role] ?? "Recipe processing";
  const reason = localAbort
    ? deadlineLimited
      ? `${label} exhausted the remaining time for this run.`
      : `${label} timed out after ${Math.ceil(milliseconds / 1000)} seconds.`
    : `The AI provider timed out during ${label.toLowerCase()}.`;
  return `${reason} Retry explicitly when ready; the provider may have charged for this request.`;
}
