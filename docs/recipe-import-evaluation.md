# Recipe import evaluation

The importer corpus lives in `tests/fixtures/recipe-import-corpus.json`. Sanitised HTML fixtures and pasted-text cases are deliberately evaluated through the production extraction and adaptive pipeline rather than a parallel evaluator prompt.

Normal CI uses deterministic injected model clients and never contacts AI Gateway. Run the opt-in live corpus with:

```bash
pnpm eval:recipe-import
```

`AI_GATEWAY_API_KEY` must be present in the shell environment. Production and evaluation both use the model assignments and Gateway fallbacks versioned in `convex/lib/recipeImport/models.ts`. Optional cost reporting reads `RECIPE_IMPORT_MODEL_PRICING_USD_PER_MILLION`, a JSON object keyed by resolved model ID with `input` and `output` prices per million tokens.

The report covers semantic preservation, metadata accuracy, ingredient formatting, primary-method coverage, notes, concrete review rate, hard failures, Gateway fallback use, p50/p95 latency, tokens, and estimated cost. URL access failures are excluded from usable-core latency and should be measured separately because publisher blocking and network conditions are not parser performance.
