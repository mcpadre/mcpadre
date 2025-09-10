// pattern: Functional Core

import { describe, expect, it } from "vitest";

import { mergeConfigs } from "./with-config-base.js";

import type {
  SettingsProject,
  SettingsUser,
} from "../../config/types/index.js";

describe("mergeConfigs", () => {
  // Helper function to create minimal valid configs for testing
  const createProjectConfig = (
    overrides: Partial<SettingsProject> = {}
  ): SettingsProject => ({
    version: 1,
    mcpServers: {},
    ...overrides,
  });

  const createUserConfig = (
    overrides: Partial<SettingsUser> = {}
  ): SettingsUser => ({
    version: 1,
    mcpServers: {},
    ...overrides,
  });

  describe("basic functionality", () => {
    it("should return project config when user config is undefined", () => {
      const projectConfig = createProjectConfig({
        mcpServers: {
          "project-server": {
            http: { url: "http://localhost:3000" },
          },
        },
      });

      const result = mergeConfigs(projectConfig, undefined);

      expect(result).toEqual(projectConfig);
      expect(result).toBe(projectConfig); // Should return the exact same reference
    });

    it("should return project config when user config is null", () => {
      const projectConfig = createProjectConfig();

      // TypeScript doesn't allow null, but testing defensive programming
      const result = mergeConfigs(projectConfig, null as any);

      expect(result).toEqual(projectConfig);
    });
  });

  describe("server merging", () => {
    it("should combine servers when names are unique", () => {
      const projectConfig = createProjectConfig({
        mcpServers: {
          "project-server": {
            http: { url: "http://project.local" },
          },
        },
      });

      const userConfig = createUserConfig({
        mcpServers: {
          "user-server": {
            http: { url: "http://user.local" },
          },
        },
      });

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result.mcpServers).toEqual({
        "user-server": {
          http: { url: "http://user.local" },
        },
        "project-server": {
          http: { url: "http://project.local" },
        },
      });
    });

    it("should use project server when names conflict", () => {
      const projectConfig = createProjectConfig({
        mcpServers: {
          "conflicting-server": {
            http: { url: "http://project.local" },
          },
        },
      });

      const userConfig = createUserConfig({
        mcpServers: {
          "conflicting-server": {
            http: { url: "http://user.local" },
          },
        },
      });

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result.mcpServers["conflicting-server"]).toEqual({
        http: { url: "http://project.local" },
      });
    });

    it("should handle empty mcpServers objects", () => {
      const projectConfig = createProjectConfig({
        mcpServers: {},
      });

      const userConfig = createUserConfig({
        mcpServers: {
          "user-server": {
            http: { url: "http://user.local" },
          },
        },
      });

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result.mcpServers).toEqual({
        "user-server": {
          http: { url: "http://user.local" },
        },
      });
    });
  });

  describe("host merging", () => {
    it("should combine hosts when keys are unique", () => {
      const projectConfig = createProjectConfig({
        hosts: {
          "claude-desktop": true,
        },
      });

      const userConfig = createUserConfig({
        hosts: {
          cursor: false,
        },
      });

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result.hosts).toEqual({
        cursor: false,
        "claude-desktop": true,
      });
    });

    it("should use project host value when keys conflict", () => {
      const projectConfig = createProjectConfig({
        hosts: {
          "claude-desktop": true,
        },
      });

      const userConfig = createUserConfig({
        hosts: {
          "claude-desktop": false,
        },
      });

      const result = mergeConfigs(projectConfig, userConfig);

      expect((result.hosts as any)?.["claude-desktop"]).toBe(true);
    });

    it("should handle empty hosts objects", () => {
      const projectConfig = createProjectConfig({
        hosts: {},
      });

      const userConfig = createUserConfig({
        hosts: {
          cursor: true,
        },
      });

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result.hosts).toEqual({
        cursor: true,
      });
    });
  });

  describe("options merging", () => {
    it("should combine options when keys are unique", () => {
      const projectConfig = createProjectConfig({
        options: {
          logMcpTraffic: true,
        },
      });

      const userConfig = createUserConfig({
        options: {
          // Use only valid user config option
          extraAllowRead: ["/user/path" as any],
        },
      });

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result.options).toEqual({
        extraAllowRead: ["/user/path"],
        logMcpTraffic: true,
      });
    });

    it("should use project option when keys conflict", () => {
      const projectConfig = createProjectConfig({
        options: {
          logMcpTraffic: true,
        },
      });

      const userConfig = createUserConfig({
        options: {
          // Both configs can have logMcpTraffic
          logMcpTraffic: false,
        },
      });

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result.options?.logMcpTraffic).toBe(true);
    });

    it("should handle empty options objects", () => {
      const projectConfig = createProjectConfig({
        options: {},
      });

      const userConfig = createUserConfig({
        options: {
          extraAllowRead: ["/user/path" as any],
        },
      });

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result.options).toEqual({
        extraAllowRead: ["/user/path"],
      });
    });

    it("should correctly merge different option types", () => {
      const projectConfig = createProjectConfig({
        options: {
          logMcpTraffic: true,
          extraAllowRead: ["/project/path" as any],
        },
      });

      const userConfig = createUserConfig({
        options: {
          extraAllowWrite: ["/user/write" as any],
        },
      });

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result.options).toEqual({
        extraAllowWrite: ["/user/write"],
        logMcpTraffic: true,
        extraAllowRead: ["/project/path"],
      });
    });
  });

  describe("top-level fields", () => {
    it("should always use project version field", () => {
      const projectConfig = createProjectConfig({
        version: 1,
      });

      const userConfig = createUserConfig({
        version: 1, // This should be ignored
      });

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result.version).toBe(1);
    });

    it("should use project env field when defined", () => {
      const projectEnv = {
        PROJECT_VAR: { string: "project-value" },
      };

      const projectConfig = createProjectConfig({
        env: projectEnv as any,
      });

      const userConfig = createUserConfig();

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result.env).toEqual(projectEnv);
    });

    it("should omit env field when project.env is undefined", () => {
      const projectConfig = createProjectConfig();
      // env is optional in project config, so it won't be present

      const userConfig = createUserConfig();

      const result = mergeConfigs(projectConfig, userConfig);

      expect(Object.prototype.hasOwnProperty.call(result, "env")).toBe(false);
    });

    it("should include env field when project.env is empty object", () => {
      const projectConfig = createProjectConfig({
        env: {},
      });

      const userConfig = createUserConfig();

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result.env).toEqual({});
      expect(Object.prototype.hasOwnProperty.call(result, "env")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle all empty objects", () => {
      const projectConfig = createProjectConfig({
        mcpServers: {},
        hosts: {},
        options: {},
      });

      const userConfig = createUserConfig({
        mcpServers: {},
        hosts: {},
        options: {},
      });

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result).toEqual({
        version: 1,
        mcpServers: {},
        hosts: {},
        options: {},
      });
    });

    it("should preserve user properties not present in project config", () => {
      const projectConfig = createProjectConfig({
        mcpServers: {},
        hosts: {},
        options: {},
      });

      const userConfig = createUserConfig({
        mcpServers: {
          "user-only-server": {
            http: { url: "http://user-only.local" },
          },
        },
        hosts: {
          cursor: true,
        },
        options: {
          extraAllowRead: ["/user/read" as any],
        },
      });

      const result = mergeConfigs(projectConfig, userConfig);

      expect(result.mcpServers["user-only-server"]).toBeDefined();
      expect((result.hosts as any)?.cursor).toBe(true);
      expect(result.options?.extraAllowRead).toBeDefined();
    });

    it("should maintain correct type structure", () => {
      const projectConfig = createProjectConfig({
        version: 1,
        env: { TEST: { string: "value" } } as any,
        mcpServers: {
          "test-server": {
            node: { package: "test-package", version: "1.0.0" },
          },
        },
        hosts: { "claude-desktop": true },
        options: { logMcpTraffic: true },
      });

      const userConfig = createUserConfig({
        mcpServers: {
          "user-server": {
            http: { url: "http://user.local" },
          },
        },
      });

      const result = mergeConfigs(projectConfig, userConfig);

      // Verify the result satisfies SettingsProject type structure
      expect(typeof result.version).toBe("number");
      expect(typeof result.env).toBe("object");
      expect(typeof result.mcpServers).toBe("object");
      expect(typeof result.hosts).toBe("object");
      expect(typeof result.options).toBe("object");

      // Verify specific merged content
      expect(Object.keys(result.mcpServers)).toEqual([
        "user-server",
        "test-server",
      ]);
    });

    it("should handle complex nested merging scenarios", () => {
      const projectConfig = createProjectConfig({
        mcpServers: {
          "shared-server": {
            node: { package: "project-pkg", version: "1.0.0" },
          },
          "project-only": {
            http: { url: "http://project.local" },
          },
        },
        hosts: {
          "claude-desktop": true,
          cursor: false,
        },
        options: {
          logMcpTraffic: true,
          extraAllowRead: ["/project/read" as any],
        },
      });

      const userConfig = createUserConfig({
        mcpServers: {
          "shared-server": {
            http: { url: "http://user.local" }, // Different type - should be overridden
          },
          "user-only": {
            python: { package: "user-pkg", version: "2.0.0" },
          },
        },
        hosts: {
          "claude-desktop": false, // Should be overridden by project
          zed: true,
        },
        options: {
          extraAllowWrite: ["/user/write" as any],
        },
      });

      const result = mergeConfigs(projectConfig, userConfig);

      // Verify server merging
      expect(result.mcpServers["shared-server"]).toEqual({
        node: { package: "project-pkg", version: "1.0.0" },
      });
      expect(result.mcpServers["project-only"]).toBeDefined();
      expect(result.mcpServers["user-only"]).toBeDefined();

      // Verify host merging
      expect((result.hosts as any)?.["claude-desktop"]).toBe(true); // Project wins
      expect((result.hosts as any)?.cursor).toBe(false);
      expect((result.hosts as any)?.zed).toBe(true);

      // Verify options merging
      expect(result.options?.logMcpTraffic).toBe(true);
      expect(result.options?.extraAllowRead).toEqual(["/project/read"]);
      expect(result.options?.extraAllowWrite).toEqual(["/user/write"]);
    });
  });
});
