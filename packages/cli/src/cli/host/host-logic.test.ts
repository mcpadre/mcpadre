import { describe, expect, it } from "vitest";

import {
  addHostToConfig,
  getProjectCapableHosts,
  getSimilarHosts,
  getUserCapableHosts,
  isHostEnabled,
  isValidHost,
  removeHostFromConfig,
} from "./host-logic.js";

import type { SettingsProject } from "../../config/types/index.js";

function createTestConfig(
  overrides: Partial<SettingsProject> = {}
): SettingsProject {
  return {
    version: 1,
    mcpServers: {},
    ...overrides,
  };
}

describe("Host Logic", () => {
  describe("getUserCapableHosts", () => {
    it("should return only user-capable hosts", () => {
      const userHosts = getUserCapableHosts();

      expect(userHosts).toContain("claude-code");
      expect(userHosts).toContain("claude-desktop");
      expect(userHosts).toContain("cursor");
      expect(userHosts).toContain("opencode");

      expect(userHosts).not.toContain("zed");
      expect(userHosts).not.toContain("vscode");
    });
  });

  describe("getProjectCapableHosts", () => {
    it("should return only project-capable hosts", () => {
      const projectHosts = getProjectCapableHosts();

      expect(projectHosts).toContain("claude-code");
      expect(projectHosts).toContain("cursor");
      expect(projectHosts).toContain("opencode");
      expect(projectHosts).toContain("zed");
      expect(projectHosts).toContain("vscode");

      expect(projectHosts).not.toContain("claude-desktop");
    });
  });

  describe("isValidHost", () => {
    it("should return true for supported hosts", () => {
      expect(isValidHost("claude-code")).toBe(true);
      expect(isValidHost("claude-desktop")).toBe(true);
      expect(isValidHost("cursor")).toBe(true);
      expect(isValidHost("opencode")).toBe(true);
      expect(isValidHost("zed")).toBe(true);
      expect(isValidHost("vscode")).toBe(true);
    });

    it("should return false for unsupported hosts", () => {
      expect(isValidHost("invalid-host")).toBe(false);
      expect(isValidHost("sublime")).toBe(false);
      expect(isValidHost("")).toBe(false);
    });
  });

  describe("getSimilarHosts", () => {
    it("should suggest similar host names", () => {
      const similar = getSimilarHosts("code");
      expect(similar).toContain("claude-code");
      expect(similar).toContain("vscode");
      expect(similar).toContain("opencode");
    });

    it("should handle partial matches", () => {
      const similar = getSimilarHosts("zed");
      expect(similar).toContain("zed");
    });
  });

  describe("addHostToConfig", () => {
    it("should add a host to empty config", () => {
      const config = createTestConfig();
      const result = addHostToConfig(config, "claude-code");

      expect(result.hosts).toEqual({ "claude-code": true });
    });

    it("should add a host to existing hosts", () => {
      const config = createTestConfig({ hosts: { cursor: true } });
      const result = addHostToConfig(config, "claude-code");

      expect(result.hosts).toEqual({
        cursor: true,
        "claude-code": true,
      });
    });
  });

  describe("removeHostFromConfig", () => {
    it("should remove a host from config", () => {
      const config = createTestConfig({
        hosts: { "claude-code": true, cursor: true },
      });
      const result = removeHostFromConfig(config, "claude-code");

      expect(result.hosts).toEqual({ cursor: true });
    });

    it("should remove hosts field when last host is removed", () => {
      const config = createTestConfig({ hosts: { "claude-code": true } });
      const result = removeHostFromConfig(config, "claude-code");

      expect("hosts" in result).toBe(false);
    });

    it("should handle removing non-existent host", () => {
      const config = createTestConfig({ hosts: { cursor: true } });
      const result = removeHostFromConfig(config, "claude-code");

      expect(result).toEqual(config);
    });
  });

  describe("isHostEnabled", () => {
    it("should return true for enabled hosts", () => {
      const config = createTestConfig({ hosts: { "claude-code": true } });
      expect(isHostEnabled(config, "claude-code")).toBe(true);
    });

    it("should return false for disabled hosts", () => {
      const config = createTestConfig({ hosts: { "claude-code": false } });
      expect(isHostEnabled(config, "claude-code")).toBe(false);
    });

    it("should return false for missing hosts", () => {
      const config = createTestConfig();
      expect(isHostEnabled(config, "claude-code")).toBe(false);
    });
  });
});
