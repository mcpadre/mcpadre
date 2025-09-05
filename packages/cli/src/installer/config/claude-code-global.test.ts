// pattern: Functional Core

import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  updateClaudeCodeGlobalConfig,
  updateClaudeCodeGlobalConfigWithAnalysis,
} from "../updaters/claude-code-global.js";

import { getClaudeCodeGlobalConfigPath } from "./claude-code-global.js";

import type {
  CommandStringTemplate,
  McpServerV1,
} from "../../config/types/v1/server/index.js";

describe("Claude Code Global Config", () => {
  describe("getClaudeCodeGlobalConfigPath", () => {
    it("returns path to $HOME/.claude.json", () => {
      const expected = path.join(os.homedir(), ".claude.json");
      const actual = getClaudeCodeGlobalConfigPath();
      expect(actual).toBe(expected);
    });
  });

  describe("updateClaudeCodeGlobalConfig", () => {
    const mockServers: Record<string, McpServerV1> = {
      "test-server": {
        shell: {
          command: "node" as CommandStringTemplate,
        },
      },
    };

    it("creates new config when existing content is empty", () => {
      const result = updateClaudeCodeGlobalConfig("", mockServers);

      const parsed = JSON.parse(result);
      expect(parsed.mcpServers).toEqual({
        "test-server": {
          command: "mcpadre",
          args: ["run", "--user", "test-server"],
        },
      });
    });

    it("preserves existing non-mcpadre servers", () => {
      const existingConfig = JSON.stringify({
        mcpServers: {
          "existing-server": {
            command: "other-tool",
            args: ["--config", "path"],
          },
        },
      });

      const result = updateClaudeCodeGlobalConfig(existingConfig, mockServers);

      const parsed = JSON.parse(result);
      expect(parsed.mcpServers).toEqual({
        "existing-server": {
          command: "other-tool",
          args: ["--config", "path"],
        },
        "test-server": {
          command: "mcpadre",
          args: ["run", "--user", "test-server"],
        },
      });
    });
  });

  describe("updateClaudeCodeGlobalConfigWithAnalysis", () => {
    const mockServers: Record<string, McpServerV1> = {
      "test-server": {
        shell: {
          command: "node" as CommandStringTemplate,
        },
      },
    };

    it("analyzes existing servers and updates config", () => {
      const existingConfig = JSON.stringify({
        mcpServers: {
          "existing-server": {
            command: "other-tool",
          },
          "mcpadre-server": {
            command: "mcpadre",
            args: ["run", "old-server"],
          },
        },
      });

      const result = updateClaudeCodeGlobalConfigWithAnalysis(
        existingConfig,
        mockServers
      );

      // Verify analysis
      expect(result.analysis).toBeDefined();
      expect(result.analysis.mcpadreOrphaned).toContain("mcpadre-server");
      expect(result.analysis.external).toContain("existing-server");

      // Verify updated config
      const parsed = JSON.parse(result.updatedConfig);
      expect(parsed.mcpServers).toEqual({
        "existing-server": {
          command: "other-tool",
        },
        "test-server": {
          command: "mcpadre",
          args: ["run", "--user", "test-server"],
        },
      });

      // mcpadre-server should be removed as it's orphaned
      expect(parsed.mcpServers["mcpadre-server"]).toBeUndefined();
    });
  });
});
