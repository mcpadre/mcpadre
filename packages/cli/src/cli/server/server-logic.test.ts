import { describe, expect, it } from "vitest";

import {
  addServersToConfig,
  getServerFromSpec,
  getServerNamesFromSpec,
  removeServerFromConfig,
  selectServersToAdd,
  serverExistsInConfig,
  type ServerSelectionOptions,
} from "./server-logic.js";

import type {
  McpServer,
  ServerSpec,
  SettingsProject,
} from "../../config/types/index.js";

describe("server-logic", () => {
  const mockServerConfig: McpServer = {
    node: {
      package: "test-package",
      version: "1.0.0",
    },
  };

  const mockServerSpec: ServerSpec = {
    version: 1,
    mcpServers: {
      "test-server": mockServerConfig,
      "another-server": mockServerConfig,
    },
  };

  const mockConfig: SettingsProject = {
    version: 1,
    mcpServers: {
      "existing-server": mockServerConfig,
    },
  };

  describe("serverExistsInConfig", () => {
    it("should return true when server exists", () => {
      expect(serverExistsInConfig(mockConfig, "existing-server")).toBe(true);
    });

    it("should return false when server does not exist", () => {
      expect(serverExistsInConfig(mockConfig, "non-existent")).toBe(false);
    });
  });

  describe("getServerNamesFromSpec", () => {
    it("should return array of server names", () => {
      const names = getServerNamesFromSpec(mockServerSpec);
      expect(names).toEqual(["test-server", "another-server"]);
    });

    it("should return empty array for empty spec", () => {
      const emptySpec: ServerSpec = { version: 1, mcpServers: {} };
      const names = getServerNamesFromSpec(emptySpec);
      expect(names).toEqual([]);
    });
  });

  describe("getServerFromSpec", () => {
    it("should return server config when exists", () => {
      const server = getServerFromSpec(mockServerSpec, "test-server");
      expect(server).toEqual(mockServerConfig);
    });

    it("should return undefined when server does not exist", () => {
      const server = getServerFromSpec(mockServerSpec, "non-existent");
      expect(server).toBeUndefined();
    });
  });

  describe("addServersToConfig", () => {
    it("should add new servers to config", () => {
      const result = addServersToConfig(mockConfig, mockServerSpec, [
        "test-server",
      ]);
      expect(result.mcpServers["test-server"]).toEqual(mockServerConfig);
      expect(result.mcpServers["existing-server"]).toEqual(mockServerConfig);
    });

    it("should handle empty server list", () => {
      const result = addServersToConfig(mockConfig, mockServerSpec, []);
      expect(result).toEqual(mockConfig);
    });
  });

  describe("removeServerFromConfig", () => {
    it("should remove existing server", () => {
      const result = removeServerFromConfig(mockConfig, "existing-server");
      expect(result.mcpServers["existing-server"]).toBeUndefined();
    });

    it("should return unchanged config when server does not exist", () => {
      const result = removeServerFromConfig(mockConfig, "non-existent");
      expect(result).toEqual(mockConfig);
    });
  });

  describe("selectServersToAdd", () => {
    const baseOptions: ServerSelectionOptions = {
      selectAll: false,
      availableServerNames: ["server1", "server2", "server3"],
      isInteractive: false,
    };

    it("should select all servers when selectAll is true", () => {
      const result = selectServersToAdd({ ...baseOptions, selectAll: true });
      expect(result.success).toBe(true);
      expect(result.selectedServerNames).toEqual([
        "server1",
        "server2",
        "server3",
      ]);
    });

    it("should select specific server when provided", () => {
      const result = selectServersToAdd({
        ...baseOptions,
        specificServerName: "server2",
      });
      expect(result.success).toBe(true);
      expect(result.selectedServerNames).toEqual(["server2"]);
    });

    it("should auto-select single server", () => {
      const result = selectServersToAdd({
        ...baseOptions,
        availableServerNames: ["only-server"],
      });
      expect(result.success).toBe(true);
      expect(result.selectedServerNames).toEqual(["only-server"]);
    });

    it("should fail in non-interactive mode with multiple servers", () => {
      const result = selectServersToAdd(baseOptions);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("Multiple servers available");
    });

    it("should handle interactive selections", () => {
      const result = selectServersToAdd({
        ...baseOptions,
        isInteractive: true,
        interactiveSelections: ["server1", "server3"],
      });
      expect(result.success).toBe(true);
      expect(result.selectedServerNames).toEqual(["server1", "server3"]);
    });

    it("should fail with invalid server name", () => {
      const result = selectServersToAdd({
        ...baseOptions,
        specificServerName: "invalid-server",
      });
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("not found in ServerSpec");
    });

    it("should fail with no servers available", () => {
      const result = selectServersToAdd({
        ...baseOptions,
        availableServerNames: [],
      });
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe(
        "No servers found in the ServerSpec file"
      );
    });
  });
});
