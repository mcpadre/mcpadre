// pattern: Imperative Shell
import { defineConfig, mergeConfig } from "vitest/config";

import workspaceConfig from "../../vitest.config.js";

export default mergeConfig(
  workspaceConfig,
  defineConfig({
    test: {
      // to reduce context burden on LLMs
      silent: "passed-only",
      // File patterns - only unit tests for this package
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      exclude: ["node_modules", "dist", "src/integration-tests/**/*"],

      // Coverage configuration for this package
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
        include: ["src/**/*.{js,mjs,cjs,ts,mts,cts}"],
        exclude: [
          "node_modules",
          "dist",
          "**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}",
          "**/*.d.ts",
          "src/integration-tests/**/*",
        ],
        thresholds: {
          global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
          },
        },
      },

      // Reporter configuration
      reporters: ["dot"],
    },
  })
);
