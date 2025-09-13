// pattern: Imperative Shell
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test environment
    environment: "node",

    // File patterns - only integration tests
    include: ["src/integration-tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist"],

    // Global setup file for process cleanup
    setupFiles: ["src/integration-tests/setup.ts"],

    // to reduce context burden on LLMs
    silent: "passed-only",

    // Longer timeouts for integration tests
    testTimeout: 300000,
    hookTimeout: 300000,
    bail: 1,

    // Limit concurrent workers to reduce CPU contention
    pool: "threads",
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
      },
    },

    // Reporter configuration
    reporters: ["dot"],

    // TypeScript support
    globals: false,
    typecheck: {
      checker: "tsc",
    },
  },
});
