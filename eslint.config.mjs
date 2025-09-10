// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import simpleImportSort from "eslint-plugin-simple-import-sort";

export default tseslint.config(
  // Base configuration for all files
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "**/*.d.ts",
      "**/*.js",
      "**/*.mjs"
    ]
  },

  // JavaScript/TypeScript files
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strict,
      ...tseslint.configs.stylistic
    ],
    plugins: {
      "simple-import-sort": simpleImportSort
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        projectService: true
      }
    },
    rules: {
      // Import sorting and organization
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            // Node.js built-ins
            ["^node:"],
            // External packages
            ["^@?\\w"],
            // Internal packages (workspace)
            ["^@mcpadre/"],
            // Parent imports
            ["^\\.\\.(?!/?$)", "^\\.\\./?$"],
            // Same-folder imports
            ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
            // Type imports (last)
            ["^.+\\u0000$"]
          ]
        }
      ],
      "simple-import-sort/exports": "error",

      // TypeScript strict rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true
        }
      ],

      // General code quality
      "no-console": "warn",
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-template": "error",

      // Architecture enforcement - prevent isUserMode usage in CLI commands
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='isUserMode']",
          message: "Use WorkspaceContext instead of calling isUserMode() - CLI commands should receive WorkspaceContext from withConfigContextAndErrorHandling"
        }
      ]
    }
  },

  // Test files - more relaxed rules
  {
    files: ["**/*.{test,spec}.{ts,tsx}"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off"
    }
  },

  // Configuration files
  {
    files: ["*.config.{ts,mjs}", "vitest.*.{ts,mjs}"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  },

  // CLI entry points - allow console
  {
    files: ["**/cli.{ts,tsx}", "**/src/cli.{ts,tsx}"],
    rules: {
      "no-console": "off"
    }
  },

  // Context infrastructure - allow isUserMode for context creation only
  {
    files: [
      "**/with-config-base.ts",
      "**/contexts/index.ts"
    ],
    rules: {
      "no-restricted-syntax": "off"
    }
  }
);