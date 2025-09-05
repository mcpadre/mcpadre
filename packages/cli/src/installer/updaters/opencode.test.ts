import { describe, expect, it } from "vitest";

import {
  updateOpenCodeConfig,
  updateOpenCodeConfigWithAnalysis,
} from "./opencode.js";

import type { McpServerV1 } from "../../config/types/v1/server/index.js";

describe("OpenCode config updater", () => {
  const mockServers: Record<string, McpServerV1> = {
    "test-server": {
      node: {
        package: "@test/server",
        version: "^1.0.0",
      },
    },
    "another-server": {
      python: {
        package: "test_server",
        version: "1.0.0",
      },
    },
  };

  describe("updateOpenCodeConfig", () => {
    it("should create new config when file doesn't exist", () => {
      const result = updateOpenCodeConfig("", mockServers);
      const parsed = JSON.parse(result);

      expect(parsed.mcp["test-server"]).toEqual({
        type: "local",
        command: ["mcpadre", "run", "test-server"],
        enabled: true,
      });
      expect(parsed.mcp["another-server"]).toEqual({
        type: "local",
        command: ["mcpadre", "run", "another-server"],
        enabled: true,
      });
    });

    it("should preserve schema reference when creating new config", () => {
      const result = updateOpenCodeConfig("", mockServers);
      const parsed = JSON.parse(result);

      // Should not add schema automatically - OpenCode users add it themselves
      expect(parsed.$schema).toBeUndefined();
    });

    it("should merge with existing config and preserve other settings", () => {
      const existing = JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        model: "anthropic/claude-sonnet-4-20250514",
        theme: "opencode",
        mcp: {
          "existing-server": {
            type: "local",
            command: ["some", "command"],
            enabled: true,
          },
        },
      });

      const result = updateOpenCodeConfig(existing, mockServers);
      const parsed = JSON.parse(result);

      // Should preserve schema and other settings
      expect(parsed.$schema).toBe("https://opencode.ai/config.json");
      expect(parsed.model).toBe("anthropic/claude-sonnet-4-20250514");
      expect(parsed.theme).toBe("opencode");

      // Should preserve existing MCP server
      expect(parsed.mcp["existing-server"]).toEqual({
        type: "local",
        command: ["some", "command"],
        enabled: true,
      });

      // Should add new mcpadre servers
      expect(parsed.mcp["test-server"]).toEqual({
        type: "local",
        command: ["mcpadre", "run", "test-server"],
        enabled: true,
      });
    });

    it("should preserve existing enabled states for mcpadre servers", () => {
      const existing = JSON.stringify({
        mcp: {
          "test-server": {
            type: "local",
            command: ["mcpadre", "run", "test-server"],
            enabled: false, // User disabled this server
          },
        },
      });

      const result = updateOpenCodeConfig(existing, mockServers);
      const parsed = JSON.parse(result);

      // Should preserve disabled state
      expect(parsed.mcp["test-server"]).toEqual({
        type: "local",
        command: ["mcpadre", "run", "test-server"],
        enabled: false,
      });

      // New server should default to enabled
      expect(parsed.mcp["another-server"]).toEqual({
        type: "local",
        command: ["mcpadre", "run", "another-server"],
        enabled: true,
      });
    });

    it("should handle malformed enabled values", () => {
      const existing = JSON.stringify({
        mcp: {
          "test-server": {
            type: "local",
            command: ["mcpadre", "run", "test-server"],
            enabled: "not-a-boolean",
          },
        },
      });

      const result = updateOpenCodeConfig(existing, mockServers);
      const parsed = JSON.parse(result);

      // Should default to true for malformed enabled value
      expect(parsed.mcp["test-server"].enabled).toBe(true);
    });

    it("should default enabled to true when missing", () => {
      const existing = JSON.stringify({
        mcp: {
          "test-server": {
            type: "local",
            command: ["mcpadre", "run", "test-server"],
            // enabled property missing
          },
        },
      });

      const result = updateOpenCodeConfig(existing, mockServers);
      const parsed = JSON.parse(result);

      expect(parsed.mcp["test-server"].enabled).toBe(true);
    });

    it("should handle empty existing config", () => {
      const result = updateOpenCodeConfig("{}", mockServers);
      const parsed = JSON.parse(result);

      expect(parsed.mcp).toBeDefined();
      expect(Object.keys(parsed.mcp)).toHaveLength(2);
    });

    it("should handle malformed JSON gracefully", () => {
      const result = updateOpenCodeConfig("{ invalid json", mockServers);
      const parsed = JSON.parse(result);

      expect(parsed.mcp["test-server"]).toEqual({
        type: "local",
        command: ["mcpadre", "run", "test-server"],
        enabled: true,
      });
    });
  });

  describe("updateOpenCodeConfigWithAnalysis", () => {
    it("should return config and analysis for empty config", () => {
      const result = updateOpenCodeConfigWithAnalysis("", mockServers);

      expect(result.updatedConfig).toBeDefined();
      expect(result.analysis).toBeDefined();

      // For empty config, no existing servers to analyze initially
      expect(result.analysis.mcpadreManaged).toHaveLength(0);
      expect(result.analysis.external).toHaveLength(0);
      expect(result.analysis.mcpadreOrphaned).toHaveLength(0);

      // But the updated config should contain the new servers
      const parsed = JSON.parse(result.updatedConfig);
      expect(parsed.mcp["test-server"]).toBeDefined();
      expect(parsed.mcp["another-server"]).toBeDefined();
    });

    it("should detect external servers", () => {
      const existing = JSON.stringify({
        mcp: {
          "external-server": {
            type: "remote",
            url: "https://example.com/mcp",
            enabled: true,
          },
        },
      });

      const result = updateOpenCodeConfigWithAnalysis(existing, mockServers);

      expect(result.analysis.external).toHaveLength(1);
      expect(result.analysis.external).toContain("external-server");
      expect(result.analysis.mcpadreManaged).toHaveLength(0); // No existing mcpadre servers in the existing config
    });

    it("should detect and remove orphaned mcpadre servers", () => {
      const existing = JSON.stringify({
        mcp: {
          "orphaned-server": {
            type: "local",
            command: ["mcpadre", "run", "orphaned-server"],
            enabled: false,
          },
          "test-server": {
            type: "local",
            command: ["mcpadre", "run", "test-server"],
            enabled: true,
          },
        },
      });

      const result = updateOpenCodeConfigWithAnalysis(existing, mockServers);
      const parsed = JSON.parse(result.updatedConfig);

      // Should identify orphan
      expect(result.analysis.mcpadreOrphaned).toHaveLength(1);
      expect(result.analysis.mcpadreOrphaned).toContain("orphaned-server");

      // Should remove orphaned server from config
      expect(parsed.mcp["orphaned-server"]).toBeUndefined();

      // Should keep current servers
      expect(parsed.mcp["test-server"]).toBeDefined();
      expect(parsed.mcp["another-server"]).toBeDefined();
    });

    it("should preserve enabled states during orphan cleanup", () => {
      const existing = JSON.stringify({
        mcp: {
          "orphaned-server": {
            type: "local",
            command: ["mcpadre", "run", "orphaned-server"],
            enabled: false, // Even disabled orphans should be removed
          },
          "test-server": {
            type: "local",
            command: ["mcpadre", "run", "test-server"],
            enabled: false, // This should be preserved
          },
        },
      });

      const result = updateOpenCodeConfigWithAnalysis(existing, mockServers);
      const parsed = JSON.parse(result.updatedConfig);

      // Orphan should be removed regardless of enabled state
      expect(parsed.mcp["orphaned-server"]).toBeUndefined();

      // Current server's enabled state should be preserved
      expect(parsed.mcp["test-server"].enabled).toBe(false);
      expect(parsed.mcp["another-server"].enabled).toBe(true); // New server defaults to true
    });

    it("should handle mixed server types correctly", () => {
      const existing = JSON.stringify({
        mcp: {
          "external-server": {
            type: "remote",
            url: "https://example.com",
            enabled: true,
          },
          "orphaned-mcpadre": {
            type: "local",
            command: ["mcpadre", "run", "orphaned-mcpadre"],
            enabled: true,
          },
          "test-server": {
            type: "local",
            command: ["mcpadre", "run", "test-server"],
            enabled: false,
          },
        },
      });

      const result = updateOpenCodeConfigWithAnalysis(existing, mockServers);
      const parsed = JSON.parse(result.updatedConfig);

      // Should classify correctly based on what was in existing config
      expect(result.analysis.external).toEqual(["external-server"]);
      expect(result.analysis.mcpadreOrphaned).toEqual(["orphaned-mcpadre"]);
      expect(result.analysis.mcpadreManaged).toEqual(["test-server"]); // Only test-server was in existing config

      // Should preserve external server
      expect(parsed.mcp["external-server"]).toBeDefined();

      // Should remove orphaned mcpadre server
      expect(parsed.mcp["orphaned-mcpadre"]).toBeUndefined();

      // Should preserve enabled state of current servers
      expect(parsed.mcp["test-server"].enabled).toBe(false);
    });
  });
});
