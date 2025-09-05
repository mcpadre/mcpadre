// pattern: Functional Core

import { describe, expect, it } from "vitest";

import { updateClaudeCodeConfig } from "./claude-code.js";

import type { EnvStringTemplateV1 } from "../../config/types/v1/env.js";
import type {
  CommandStringTemplate,
  McpServerV1,
} from "../../config/types/v1/server/index.js";

describe("updateClaudeCodeConfig", () => {
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
    const result = updateClaudeCodeConfig("", mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toEqual({
      "test-server": {
        command: "mcpadre",
        args: ["run", "test-server"],
      },
      "another-server": {
        command: "mcpadre",
        args: ["run", "another-server"],
      },
    });
  });

  it("preserves existing non-mcpadre servers when updating", () => {
    const existingConfig = JSON.stringify(
      {
        mcpServers: {
          "existing-server": {
            command: "other-tool",
            args: ["--config", "path"],
          },
        },
      },
      null,
      2
    );

    const result = updateClaudeCodeConfig(existingConfig, mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toEqual({
      "existing-server": {
        command: "other-tool",
        args: ["--config", "path"],
      },
      "test-server": {
        command: "mcpadre",
        args: ["run", "test-server"],
      },
      "another-server": {
        command: "mcpadre",
        args: ["run", "another-server"],
      },
    });
  });

  it("overwrites existing mcpadre servers with same names", () => {
    const existingConfig = JSON.stringify(
      {
        mcpServers: {
          "test-server": {
            command: "mcpadre",
            args: ["run", "test-server", "--old-config"],
          },
          "other-server": {
            command: "mcpadre",
            args: ["run", "other-server"],
          },
        },
      },
      null,
      2
    );

    const result = updateClaudeCodeConfig(existingConfig, mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toEqual({
      "other-server": {
        command: "mcpadre",
        args: ["run", "other-server"],
      },
      "test-server": {
        command: "mcpadre",
        args: ["run", "test-server"],
      },
      "another-server": {
        command: "mcpadre",
        args: ["run", "another-server"],
      },
    });
  });

  it("preserves other config properties outside mcpServers", () => {
    const existingConfig = JSON.stringify(
      {
        version: "1.0",
        mcpServers: {},
        otherProperty: "preserved",
      },
      null,
      2
    );

    const result = updateClaudeCodeConfig(existingConfig, mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.version).toBe("1.0");
    expect(parsed.otherProperty).toBe("preserved");
    expect(Object.keys(parsed.mcpServers)).toHaveLength(2);
  });

  it("handles malformed JSON by creating new config", () => {
    const malformedJson = "{ invalid json";

    const result = updateClaudeCodeConfig(malformedJson, mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toEqual({
      "test-server": {
        command: "mcpadre",
        args: ["run", "test-server"],
      },
      "another-server": {
        command: "mcpadre",
        args: ["run", "another-server"],
      },
    });
  });

  it("maintains JSON formatting with proper indentation", () => {
    const result = updateClaudeCodeConfig("", mockServers);

    // Check that the result is properly formatted
    expect(result).toContain("  ");
    expect(result.split("\n").length).toBeGreaterThan(5);
  });

  it("handles empty servers object", () => {
    const result = updateClaudeCodeConfig("", {});

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toEqual({});
  });
});
