# Recipe import evaluation

The importer corpus lives in `tests/fixtures/recipe-import-corpus.json`. Sanitised HTML fixtures and pasted-text cases are evaluated through the production AI-only extraction, independent verification and bounded repair pipeline rather than a parallel evaluator prompt. See [the importer architecture](recipe-import.md).

Normal CI uses deterministic injected model clients and never contacts AI Gateway. Run the opt-in live corpus with:

```bash
pnpm eval:recipe-import
```

`AI_GATEWAY_API_KEY` must be present in the shell environment. Production and evaluation use the same configured model in `convex/lib/recipeImport/models.ts`, with no fallback parser, alternate-model routing or automatic provider retries. Use `--case=id,...` to select cases and `--repeat=3` to check repeatability (maximum five runs). `--inspect` prints normalized recipe content for local diagnosis; do not retain or commit private user content. Optional cost reporting reads `RECIPE_IMPORT_MODEL_PRICING_USD_PER_MILLION`, a JSON object keyed by resolved model ID with `input` and `output` prices per million tokens.

The report checks independently authored ingredient amounts, groups, alternatives, cooking actions, temperatures, durations and note expectations. It reports semantic preservation, metadata accuracy, ingredient formatting, primary-method coverage, notes, concrete review rate, hard failures, provider telemetry, p50/p95 latency, tokens, and estimated cost. URL access failures are excluded from usable-core latency and should be measured separately because publisher blocking and network conditions are not parser performance. Report initial failures and targeted recheck results separately: a passing recheck is not a clean first-pass corpus result.
