import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worker has its own tsconfig + @cloudflare/workers-types; it's not a
    // Next.js source. Lint it via `cd workers/cdn-gate && tsc --noEmit`.
    "workers/**",
  ]),
]);

export default eslintConfig;
