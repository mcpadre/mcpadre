// pattern: Functional Core

import { describe, expect, it } from "vitest";

import { updateZedConfig } from "./zed.js";

import type { EnvStringTemplateV1 } from "../../config/types/v1/env.js";
import type {
  CommandStringTemplate,
  McpServerV1,
} from "../../config/types/v1/server/index.js";

describe("updateZedConfig", () => {
  const mockServers: Record<string, McpServerV1> = {
    "test-server": {
      shell: {
        command: "node" as CommandStringTemplate,
      },
      env: {
        TEST_VAR: "value" as EnvStringTemplateV1,
      },
    },
    "another-server": {
      shell: {
        command: "python" as CommandStringTemplate,
      },
    },
  };

  it("creates new config when existing content is empty", () => {
    const result = updateZedConfig("", mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.context_servers).toEqual({
      "test-server": {
        command: {
          path: "mcpadre",
          args: ["run", "test-server"],
        },
      },
      "another-server": {
        command: {
          path: "mcpadre",
          args: ["run", "another-server"],
        },
      },
    });
  });

  it("preserves all existing user settings when adding MCP servers", () => {
    const existingConfig = JSON.stringify(
      {
        theme: "dark",
        vim_mode: true,
        context_servers: {
          "existing-server": {
            command: {
              path: "other-tool",
              args: ["--config", "path"],
            },
          },
        },
        editor: {
          tab_size: 2,
          show_whitespace: "selection",
        },
        terminal: {
          shell: "/bin/zsh",
        },
      },
      null,
      2
    );

    const result = updateZedConfig(existingConfig, mockServers);

    const parsed = JSON.parse(result);

    // Verify all user settings are preserved
    expect(parsed.theme).toBe("dark");
    expect(parsed.vim_mode).toBe(true);
    expect(parsed.editor).toEqual({
      tab_size: 2,
      show_whitespace: "selection",
    });
    expect(parsed.terminal).toEqual({
      shell: "/bin/zsh",
    });

    // Verify MCP servers were added correctly
    expect(parsed.context_servers).toEqual({
      "existing-server": {
        command: {
          path: "other-tool",
          args: ["--config", "path"],
        },
      },
      "test-server": {
        command: {
          path: "mcpadre",
          args: ["run", "test-server"],
        },
      },
      "another-server": {
        command: {
          path: "mcpadre",
          args: ["run", "another-server"],
        },
      },
    });
  });

  it("overwrites existing mcpadre servers with same names", () => {
    const existingConfig = JSON.stringify(
      {
        context_servers: {
          "test-server": {
            command: {
              path: "mcpadre",
              args: ["run", "test-server", "--old-config"],
            },
          },
          "other-server": {
            command: {
              path: "mcpadre",
              args: ["run", "other-server"],
            },
          },
        },
      },
      null,
      2
    );

    const result = updateZedConfig(existingConfig, mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.context_servers).toEqual({
      "other-server": {
        command: {
          path: "mcpadre",
          args: ["run", "other-server"],
        },
      },
      "test-server": {
        command: {
          path: "mcpadre",
          args: ["run", "test-server"],
        },
      },
      "another-server": {
        command: {
          path: "mcpadre",
          args: ["run", "another-server"],
        },
      },
    });
  });

  it("creates context_servers section when it doesn't exist", () => {
    const existingConfig = JSON.stringify(
      {
        theme: "light",
        vim_mode: false,
        editor: {
          tab_size: 4,
        },
      },
      null,
      2
    );

    const result = updateZedConfig(existingConfig, mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.theme).toBe("light");
    expect(parsed.vim_mode).toBe(false);
    expect(parsed.editor).toEqual({ tab_size: 4 });
    expect(parsed.context_servers).toEqual({
      "test-server": {
        command: {
          path: "mcpadre",
          args: ["run", "test-server"],
        },
      },
      "another-server": {
        command: {
          path: "mcpadre",
          args: ["run", "another-server"],
        },
      },
    });
  });

  it("handles malformed JSON by creating new config", () => {
    const malformedJson = "{ invalid json";

    const result = updateZedConfig(malformedJson, mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.context_servers).toEqual({
      "test-server": {
        command: {
          path: "mcpadre",
          args: ["run", "test-server"],
        },
      },
      "another-server": {
        command: {
          path: "mcpadre",
          args: ["run", "another-server"],
        },
      },
    });
  });

  it("maintains JSON formatting with proper indentation", () => {
    const result = updateZedConfig("", mockServers);

    // Check that the result is properly formatted
    expect(result).toContain("  ");
    expect(result.split("\n").length).toBeGreaterThan(5);
  });

  it("handles empty servers object while preserving user settings", () => {
    const existingConfig = JSON.stringify(
      {
        theme: "dark",
        vim_mode: true,
      },
      null,
      2
    );

    const result = updateZedConfig(existingConfig, {});

    const parsed = JSON.parse(result);
    expect(parsed.theme).toBe("dark");
    expect(parsed.vim_mode).toBe(true);
    expect(parsed.context_servers).toEqual({});
  });

  it("preserves complex nested user settings", () => {
    const existingConfig = JSON.stringify(
      {
        languages: {
          TypeScript: {
            tab_size: 2,
            hard_tabs: false,
          },
          Python: {
            tab_size: 4,
          },
        },
        lsp: {
          typescript: {
            initialization_options: {
              preferences: {
                includeInlayParameterNameHints: "all",
              },
            },
          },
        },
        context_servers: {},
      },
      null,
      2
    );

    const result = updateZedConfig(existingConfig, mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.languages).toEqual({
      TypeScript: {
        tab_size: 2,
        hard_tabs: false,
      },
      Python: {
        tab_size: 4,
      },
    });
    expect(parsed.lsp).toEqual({
      typescript: {
        initialization_options: {
          preferences: {
            includeInlayParameterNameHints: "all",
          },
        },
      },
    });
    expect(Object.keys(parsed.context_servers)).toHaveLength(2);
  });
});
