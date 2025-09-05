// pattern: Functional Core

import { describe, expect, it } from "vitest";

import {
  getLoggingConfig,
  shouldLogMcpTraffic,
  supportsTrafficLogging,
} from "./mcp-traffic.js";

import type { SettingsProject } from "../../config/types/index.js";
import type {
  CommandStringTemplate,
  McpServerV1,
} from "../../config/types/v1/server/index.js";

describe("MCP Traffic Configuration Resolution", () => {
  // Helper to create minimal workspace config
  const createWorkspaceConfig = (logMcpTraffic?: boolean): SettingsProject => ({
    version: 1,
    mcpServers: {},
    ...(logMcpTraffic !== undefined && { options: { logMcpTraffic } }),
  });

  // Helper to create shell server config
  const createShellServerConfig = (logMcpTraffic?: boolean): McpServerV1 => {
    const config: any = {
      shell: {
        command: "test-command" as CommandStringTemplate,
      },
    };
    if (logMcpTraffic !== undefined) {
      config.logMcpTraffic = logMcpTraffic;
    }
    return config;
  };

  // Helper to create HTTP server config
  const createHttpServerConfig = (): McpServerV1 => ({
    http: {
      url: "https://example.com/mcp",
    },
  });

  describe("shouldLogMcpTraffic", () => {
    it("should return false when neither workspace nor server config enables logging", () => {
      const serverConfig = createShellServerConfig();
      const workspaceConfig = createWorkspaceConfig();

      expect(shouldLogMcpTraffic(serverConfig, workspaceConfig)).toBe(false);
    });

    it("should return true when workspace config enables logging", () => {
      const serverConfig = createShellServerConfig();
      const workspaceConfig = createWorkspaceConfig(true);

      expect(shouldLogMcpTraffic(serverConfig, workspaceConfig)).toBe(true);
    });

    it("should return false when workspace config explicitly disables logging", () => {
      const serverConfig = createShellServerConfig();
      const workspaceConfig = createWorkspaceConfig(false);

      expect(shouldLogMcpTraffic(serverConfig, workspaceConfig)).toBe(false);
    });

    it("should return true when server config enables logging", () => {
      const serverConfig = createShellServerConfig(true);
      const workspaceConfig = createWorkspaceConfig(false);

      expect(shouldLogMcpTraffic(serverConfig, workspaceConfig)).toBe(true);
    });

    it("should return false when server config explicitly disables logging", () => {
      const serverConfig = createShellServerConfig(false);
      const workspaceConfig = createWorkspaceConfig(true);

      expect(shouldLogMcpTraffic(serverConfig, workspaceConfig)).toBe(false);
    });

    it("should prefer server-level setting over workspace-level setting", () => {
      const serverConfigEnabled = createShellServerConfig(true);
      const serverConfigDisabled = createShellServerConfig(false);
      const workspaceConfigEnabled = createWorkspaceConfig(true);
      const workspaceConfigDisabled = createWorkspaceConfig(false);

      // Server enabled should override workspace disabled
      expect(
        shouldLogMcpTraffic(serverConfigEnabled, workspaceConfigDisabled)
      ).toBe(true);

      // Server disabled should override workspace enabled
      expect(
        shouldLogMcpTraffic(serverConfigDisabled, workspaceConfigEnabled)
      ).toBe(false);
    });

    it("should work with HTTP servers (no server-level logMcpTraffic support)", () => {
      const httpServerConfig = createHttpServerConfig();
      const workspaceConfigEnabled = createWorkspaceConfig(true);
      const workspaceConfigDisabled = createWorkspaceConfig(false);

      // HTTP servers should fall back to workspace config
      expect(
        shouldLogMcpTraffic(httpServerConfig, workspaceConfigEnabled)
      ).toBe(true);
      expect(
        shouldLogMcpTraffic(httpServerConfig, workspaceConfigDisabled)
      ).toBe(false);
    });

    it("should default to false when no config is provided", () => {
      const serverConfig = createShellServerConfig();
      const workspaceConfig: SettingsProject = {
        version: 1,
        mcpServers: {},
      };

      expect(shouldLogMcpTraffic(serverConfig, workspaceConfig)).toBe(false);
    });
  });

  describe("supportsTrafficLogging", () => {
    it("should return true for stdio/shell servers", () => {
      const shellServerConfig = createShellServerConfig();
      expect(supportsTrafficLogging(shellServerConfig)).toBe(true);
    });

    it("should return false for HTTP servers", () => {
      const httpServerConfig = createHttpServerConfig();
      expect(supportsTrafficLogging(httpServerConfig)).toBe(false);
    });
  });

  describe("getLoggingConfig", () => {
    it("should return server source when server config sets logging", () => {
      const serverConfig = createShellServerConfig(true);
      const workspaceConfig = createWorkspaceConfig(false);

      const result = getLoggingConfig(serverConfig, workspaceConfig);

      expect(result).toEqual({
        enabled: true,
        source: "server",
      });
    });

    it("should return workspace source when only workspace config sets logging", () => {
      const serverConfig = createShellServerConfig();
      const workspaceConfig = createWorkspaceConfig(true);

      const result = getLoggingConfig(serverConfig, workspaceConfig);

      expect(result).toEqual({
        enabled: true,
        source: "workspace",
      });
    });

    it("should return default source when no config sets logging", () => {
      const serverConfig = createShellServerConfig();
      const workspaceConfig = createWorkspaceConfig();

      const result = getLoggingConfig(serverConfig, workspaceConfig);

      expect(result).toEqual({
        enabled: false,
        source: "default",
      });
    });

    it("should prioritize server config over workspace config", () => {
      const serverConfigDisabled = createShellServerConfig(false);
      const workspaceConfigEnabled = createWorkspaceConfig(true);

      const result = getLoggingConfig(
        serverConfigDisabled,
        workspaceConfigEnabled
      );

      expect(result).toEqual({
        enabled: false,
        source: "server",
      });
    });

    it("should handle HTTP servers correctly", () => {
      const httpServerConfig = createHttpServerConfig();
      const workspaceConfig = createWorkspaceConfig(true);

      const result = getLoggingConfig(httpServerConfig, workspaceConfig);

      expect(result).toEqual({
        enabled: true,
        source: "workspace",
      });
    });
  });
});
