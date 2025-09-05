// pattern: Functional Core

import { describe, expect, it } from "vitest";

import {
  createHostConfigUpdater,
  createHostConfigUpdaterWithAnalysis,
} from "./generic-updater.js";

import type { EnvStringTemplateV1 } from "../../config/types/v1/env.js";
import type {
  CommandStringTemplate,
  McpServerV1,
} from "../../config/types/v1/server/index.js";

describe("createHostConfigUpdater", () => {
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

  describe("simple format (Claude Code, Cursor)", () => {
    const simpleUpdater = createHostConfigUpdater({
      serversKey: "mcpServers",
      serverFormat: "simple",
    });

    it("creates new config when existing content is empty", () => {
      const result = simpleUpdater("", mockServers);

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
      const existingConfig = JSON.stringify({
        mcpServers: {
          "existing-server": {
            command: "some-other-command",
            args: ["--flag"],
          },
        },
      });

      const result = simpleUpdater(existingConfig, mockServers);

      const parsed = JSON.parse(result);
      expect(parsed.mcpServers["existing-server"]).toEqual({
        command: "some-other-command",
        args: ["--flag"],
      });
      expect(parsed.mcpServers["test-server"]).toEqual({
        command: "mcpadre",
        args: ["run", "test-server"],
      });
    });

    it("handles malformed JSON by starting fresh", () => {
      const result = simpleUpdater("{ invalid json", mockServers);

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

    it("returns properly formatted JSON with newline", () => {
      const result = simpleUpdater("", mockServers);

      expect(result).toMatch(/^\{[\s\S]*\}\n$/);
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe("stdio format (VS Code)", () => {
    const stdioUpdater = createHostConfigUpdater({
      serversKey: "servers",
      serverFormat: "stdio",
    });

    it("adds type field to server entries", () => {
      const result = stdioUpdater("", mockServers);

      const parsed = JSON.parse(result);
      expect(parsed.servers["test-server"]).toEqual({
        type: "stdio",
        command: "mcpadre",
        args: ["run", "test-server"],
      });
    });

    it("preserves other config sections", () => {
      const existingConfig = JSON.stringify({
        inputs: [
          {
            type: "promptString",
            id: "some-input",
            description: "Enter value",
          },
        ],
        servers: {},
      });

      const result = stdioUpdater(existingConfig, mockServers);

      const parsed = JSON.parse(result);
      expect(parsed.inputs).toEqual([
        {
          type: "promptString",
          id: "some-input",
          description: "Enter value",
        },
      ]);
      expect(parsed.servers["test-server"]).toEqual({
        type: "stdio",
        command: "mcpadre",
        args: ["run", "test-server"],
      });
    });
  });

  describe("zed format (Zed)", () => {
    const zedUpdater = createHostConfigUpdater({
      serversKey: "context_servers",
      serverFormat: "zed",
      preserveOtherKeys: true,
    });

    it("uses nested command structure", () => {
      const result = zedUpdater("", mockServers);

      const parsed = JSON.parse(result);
      expect(parsed.context_servers["test-server"]).toEqual({
        command: {
          path: "mcpadre",
          args: ["run", "test-server"],
        },
      });
    });

    it("preserves all existing user settings", () => {
      const existingConfig = JSON.stringify({
        theme: "dark",
        font_size: 14,
        context_servers: {
          "existing-context": {
            command: {
              path: "some-command",
              args: ["--config"],
            },
          },
        },
        editor: {
          tab_size: 2,
        },
      });

      const result = zedUpdater(existingConfig, mockServers);

      const parsed = JSON.parse(result);
      expect(parsed.theme).toBe("dark");
      expect(parsed.font_size).toBe(14);
      expect(parsed.editor).toEqual({ tab_size: 2 });
      expect(parsed.context_servers["existing-context"]).toEqual({
        command: {
          path: "some-command",
          args: ["--config"],
        },
      });
      expect(parsed.context_servers["test-server"]).toEqual({
        command: {
          path: "mcpadre",
          args: ["run", "test-server"],
        },
      });
    });
  });

  describe("edge cases", () => {
    const simpleUpdater = createHostConfigUpdater({
      serversKey: "mcpServers",
      serverFormat: "simple",
    });

    it("handles empty server list", () => {
      const result = simpleUpdater("", {});

      const parsed = JSON.parse(result);
      expect(parsed.mcpServers).toEqual({});
    });

    it("handles whitespace-only existing content", () => {
      const result = simpleUpdater("   \n  \t  ", mockServers);

      const parsed = JSON.parse(result);
      expect(parsed.mcpServers).toBeDefined();
      expect(Object.keys(parsed.mcpServers)).toHaveLength(2);
    });

    it("creates servers key if config exists but key is missing", () => {
      const existingConfig = JSON.stringify({
        someOtherKey: "value",
      });

      const result = simpleUpdater(existingConfig, mockServers);

      const parsed = JSON.parse(result);
      expect(parsed.someOtherKey).toBe("value");
      expect(parsed.mcpServers).toBeDefined();
      expect(Object.keys(parsed.mcpServers)).toHaveLength(2);
    });
  });

  describe("createHostConfigUpdaterWithAnalysis", () => {
    const simpleUpdaterWithAnalysis = createHostConfigUpdaterWithAnalysis({
      serversKey: "mcpServers",
      serverFormat: "simple",
    });

    it("analyzes and classifies servers correctly", () => {
      const existingConfig = JSON.stringify({
        mcpServers: {
          "external-server": {
            command: "node",
            args: ["server.js"],
          },
          "orphaned-mcpadre-server": {
            command: "mcpadre",
            args: ["run", "orphaned-mcpadre-server"],
          },
        },
      });

      const currentServers = {
        "new-server": {
          shell: {
            command: "python" as CommandStringTemplate,
          },
        },
      };

      const result = simpleUpdaterWithAnalysis(existingConfig, currentServers);

      // Check analysis results
      expect(result.analysis.external).toEqual(["external-server"]);
      expect(result.analysis.mcpadreOrphaned).toEqual([
        "orphaned-mcpadre-server",
      ]);
      expect(result.analysis.mcpadreManaged).toEqual([]);

      // Check updated config
      const parsed = JSON.parse(result.updatedConfig);
      expect(parsed.mcpServers["external-server"]).toBeDefined(); // Preserved
      expect(parsed.mcpServers["orphaned-mcpadre-server"]).toBeUndefined(); // Removed
      expect(parsed.mcpServers["new-server"]).toEqual({
        command: "mcpadre",
        args: ["run", "new-server"],
      });
    });

    it("handles mixed scenarios with managed, orphaned, and external servers", () => {
      const existingConfig = JSON.stringify({
        mcpServers: {
          "managed-server": {
            command: "mcpadre",
            args: ["run", "managed-server"],
          },
          "external-server": {
            command: "node",
            args: ["server.js"],
          },
          "orphaned-server": {
            command: "mcpadre",
            args: ["run", "orphaned-server"],
          },
        },
      });

      const currentServers = {
        "managed-server": {
          shell: {
            command: "python" as CommandStringTemplate,
          },
        },
        "new-server": {
          shell: {
            command: "node" as CommandStringTemplate,
          },
        },
      };

      const result = simpleUpdaterWithAnalysis(existingConfig, currentServers);

      // Check analysis results
      expect(result.analysis.external).toEqual(["external-server"]);
      expect(result.analysis.mcpadreOrphaned).toEqual(["orphaned-server"]);
      expect(result.analysis.mcpadreManaged).toEqual(["managed-server"]);

      // Check updated config
      const parsed = JSON.parse(result.updatedConfig);
      expect(parsed.mcpServers["external-server"]).toBeDefined(); // Preserved
      expect(parsed.mcpServers["orphaned-server"]).toBeUndefined(); // Removed
      expect(parsed.mcpServers["managed-server"]).toEqual({
        command: "mcpadre",
        args: ["run", "managed-server"],
      });
      expect(parsed.mcpServers["new-server"]).toEqual({
        command: "mcpadre",
        args: ["run", "new-server"],
      });
    });

    it("works with stdio format", () => {
      const stdioUpdaterWithAnalysis = createHostConfigUpdaterWithAnalysis({
        serversKey: "servers",
        serverFormat: "stdio",
      });

      const existingConfig = JSON.stringify({
        servers: {
          "external-server": {
            type: "stdio",
            command: "node",
            args: ["server.js"],
          },
          "orphaned-server": {
            type: "stdio",
            command: "mcpadre",
            args: ["run", "orphaned-server"],
          },
        },
      });

      const currentServers = {
        "new-server": {
          shell: {
            command: "python" as CommandStringTemplate,
          },
        },
      };

      const result = stdioUpdaterWithAnalysis(existingConfig, currentServers);

      // Check analysis results
      expect(result.analysis.external).toEqual(["external-server"]);
      expect(result.analysis.mcpadreOrphaned).toEqual(["orphaned-server"]);

      // Check updated config has proper stdio format
      const parsed = JSON.parse(result.updatedConfig);
      expect(parsed.servers["new-server"]).toEqual({
        type: "stdio",
        command: "mcpadre",
        args: ["run", "new-server"],
      });
    });
  });
});
