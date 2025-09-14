// pattern: Functional Core

import { describe, expect, it } from "vitest";

import { mergeUserProjectConfig } from "./user-project-merger.js";

import type { SettingsProject, SettingsUser } from "../types/index.js";

describe("mergeUserProjectConfig", () => {
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
    it("should return project config when user config is null", () => {
      const projectConfig = createProjectConfig({
        mcpServers: {
          "project-server": {
            http: { url: "http://localhost:3000" },
          },
        },
      });

      const result = mergeUserProjectConfig(null, projectConfig);

      expect(result).toEqual({
        ...projectConfig,
        hasUserConfig: false,
      });
      // No longer the same reference since we add hasUserConfig
      expect(result).not.toBe(projectConfig);
    });

    it("should return project config with hasUserConfig when user config is null", () => {
      const projectConfig = createProjectConfig();

      // TypeScript doesn't allow null, but testing defensive programming
      const result = mergeUserProjectConfig(null as any, projectConfig);

      expect(result).toEqual({
        ...projectConfig,
        hasUserConfig: false,
      });
    });
  });

  describe("server handling", () => {
    it("should only include project servers, not user servers", () => {
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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

      // User servers are NOT included in merged config (they run with --user flag)
      expect(result.mcpServers).toEqual({
        "project-server": {
          http: { url: "http://project.local" },
        },
      });
      expect(result.hasUserConfig).toBe(true);
    });

    it("should always use project servers regardless of user servers", () => {
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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

      // Only project servers are included
      expect(result.mcpServers).toEqual(projectConfig.mcpServers);
      expect(result.hasUserConfig).toBe(true);
    });

    it("should not include user servers even when project has no servers", () => {
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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

      // User servers are never included in merged config
      expect(result.mcpServers).toEqual({});
      expect(result.hasUserConfig).toBe(true);
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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

      expect(result.hosts).toEqual({
        cursor: false,
        "claude-desktop": true,
      });
    });

    it("should use user host value when explicitly set", () => {
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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

      // User explicit true/false overrides project setting
      expect((result.hosts as any)?.["claude-desktop"]).toBe(false);
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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

      expect(result.env).toEqual(projectEnv);
    });

    it("should omit env field when project.env is undefined", () => {
      const projectConfig = createProjectConfig();
      // env is optional in project config, so it won't be present

      const userConfig = createUserConfig();

      const result = mergeUserProjectConfig(userConfig, projectConfig);

      expect(Object.prototype.hasOwnProperty.call(result, "env")).toBe(false);
    });

    it("should include env field when project.env is empty object", () => {
      const projectConfig = createProjectConfig({
        env: {},
      });

      const userConfig = createUserConfig();

      const result = mergeUserProjectConfig(userConfig, projectConfig);

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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

      expect(result).toEqual({
        version: 1,
        mcpServers: {},
        hosts: {},
        options: {},
        hasUserConfig: true,
        userConfig,
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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

      // User servers are NOT included
      expect(result.mcpServers["user-only-server"]).toBeUndefined();
      // User hosts ARE included
      expect((result.hosts as any)?.cursor).toBe(true);
      // User options ARE included
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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

      // Verify the result satisfies SettingsProject type structure
      expect(typeof result.version).toBe("number");
      expect(typeof result.env).toBe("object");
      expect(typeof result.mcpServers).toBe("object");
      expect(typeof result.hosts).toBe("object");
      expect(typeof result.options).toBe("object");

      // Verify specific merged content - only project server
      expect(Object.keys(result.mcpServers)).toEqual(["test-server"]);
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

      const result = mergeUserProjectConfig(userConfig, projectConfig);

      // Verify server handling - only project servers included
      expect(result.mcpServers["shared-server"]).toEqual({
        node: { package: "project-pkg", version: "1.0.0" },
      });
      expect(result.mcpServers["project-only"]).toBeDefined();
      expect(result.mcpServers["user-only"]).toBeUndefined(); // User servers NOT included

      // Verify host merging
      expect((result.hosts as any)?.["claude-desktop"]).toBe(false); // User wins when explicitly set
      expect((result.hosts as any)?.cursor).toBe(false);
      expect((result.hosts as any)?.zed).toBe(true);

      // Verify options merging
      expect(result.options?.logMcpTraffic).toBe(true);
      expect(result.options?.extraAllowRead).toEqual(["/project/read"]);
      expect(result.options?.extraAllowWrite).toEqual(["/user/write"]);
    });
  });
});
