// pattern: Imperative Shell
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test environment
    environment: "node",
    
    // File patterns
    include: ["packages/**/src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}"],
    exclude: [
      "node_modules",
      "dist",
      "**/integration-tests/**"
    ],
    
    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["packages/**/src/**/*.{js,mjs,cjs,ts,mts,cts}"],
      exclude: [
        "node_modules",
        "dist",
        "**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}",
        "**/*.d.ts",
        "**/integration-tests/**"
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    
    // Performance and behavior
    testTimeout: 10000,
    hookTimeout: 10000,
    bail: 1,
    
    // Reporter configuration
    reporters: ["verbose"],
    
    // TypeScript support
    globals: false,
    typecheck: {
      checker: "tsc"
    }
  }
});