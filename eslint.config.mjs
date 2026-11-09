import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "test-results/**",
    "playwright-report/**",
    "coverage/**",
    "ios/**",
    "convex/_generated/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
