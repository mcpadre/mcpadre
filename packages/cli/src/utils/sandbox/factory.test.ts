// pattern: Functional Core

import { describe, expect, it } from "vitest";

import { createSandboxConfig } from "./factory.js";

import type { SandboxConfig } from "./types.js";

describe("createSandboxConfig", () => {
  describe("default enabled behavior", () => {
    it("should default to disabled for user workspace", () => {
      const config = createSandboxConfig(undefined, { workspaceType: "user" });

      expect(config.enabled).toBe(false);
    });

    it("should default to enabled for project workspace", () => {
      const config = createSandboxConfig(undefined, {
        workspaceType: "project",
      });

      expect(config.enabled).toBe(true);
    });

    it("should default to enabled when workspaceType is not specified", () => {
      const config = createSandboxConfig(undefined);

      expect(config.enabled).toBe(true);
    });

    it("should respect explicit enabled setting over workspace defaults", () => {
      // Explicit enabled=true should override user workspace default (false)
      const userConfig = createSandboxConfig(
        { enabled: true },
        { workspaceType: "user" }
      );
      expect(userConfig.enabled).toBe(true);

      // Explicit enabled=false should override project workspace default (true)
      const projectConfig = createSandboxConfig(
        { enabled: false },
        { workspaceType: "project" }
      );
      expect(projectConfig.enabled).toBe(false);
    });
  });

  describe("other default values", () => {
    it("should have correct default values for all properties", () => {
      const config = createSandboxConfig(undefined, {
        workspaceType: "project",
      });

      expect(config).toEqual({
        enabled: true,
        networking: true,
        omitWorkspacePath: false,
        allowRead: [],
        allowReadWrite: [],
      });
    });

    it("should preserve user-provided values while filling defaults", () => {
      const partialConfig: Partial<SandboxConfig> = {
        networking: false,
        allowRead: ["/custom/path"],
      };

      const config = createSandboxConfig(partialConfig, {
        workspaceType: "user",
      });

      expect(config).toEqual({
        enabled: false, // from user workspace default
        networking: false, // from user input
        omitWorkspacePath: false, // default
        allowRead: ["/custom/path"], // from user input
        allowReadWrite: [], // default
      });
    });

    it("should handle undefined options parameter", () => {
      const config = createSandboxConfig(undefined);

      expect(config).toEqual({
        enabled: true,
        networking: true,
        omitWorkspacePath: false,
        allowRead: [],
        allowReadWrite: [],
      });
    });

    it("should handle empty options object", () => {
      const config = createSandboxConfig({}, { workspaceType: "project" });

      expect(config).toEqual({
        enabled: true,
        networking: true,
        omitWorkspacePath: false,
        allowRead: [],
        allowReadWrite: [],
      });
    });
  });

  describe("workspace type edge cases", () => {
    it("should handle undefined workspace options", () => {
      const config = createSandboxConfig(undefined, undefined);

      // Should default to project behavior when workspace type is not specified
      expect(config.enabled).toBe(true);
    });

    it("should handle empty workspace options object", () => {
      const config = createSandboxConfig(undefined, {});

      // Should default to project behavior when workspaceType is not specified
      expect(config.enabled).toBe(true);
    });
  });

  describe("security implications", () => {
    it("should prioritize security by defaulting to disabled sandbox for user workspace", () => {
      // User workspace is more permissive environment, so sandbox should be disabled by default
      // to prevent users from accidentally exposing their entire user directory
      const userConfig = createSandboxConfig(undefined, {
        workspaceType: "user",
      });
      expect(userConfig.enabled).toBe(false);
    });

    it("should enable sandbox by default for project workspace for security", () => {
      // Project workspace should be sandboxed by default to limit access
      const projectConfig = createSandboxConfig(undefined, {
        workspaceType: "project",
      });
      expect(projectConfig.enabled).toBe(true);
    });

    it("should allow users to explicitly enable sandbox in user mode if desired", () => {
      // Users should be able to opt into sandboxing even in user mode
      const userConfigWithSandbox = createSandboxConfig(
        { enabled: true },
        { workspaceType: "user" }
      );
      expect(userConfigWithSandbox.enabled).toBe(true);
    });
  });

  describe("option overrides", () => {
    it("should override networking default", () => {
      const config = createSandboxConfig(
        { networking: false },
        { workspaceType: "project" }
      );

      expect(config.networking).toBe(false);
      expect(config.enabled).toBe(true); // other defaults should remain
    });

    it("should override omitWorkspacePath default", () => {
      const config = createSandboxConfig(
        { omitWorkspacePath: true },
        { workspaceType: "project" }
      );

      expect(config.omitWorkspacePath).toBe(true);
      expect(config.enabled).toBe(true); // other defaults should remain
    });

    it("should override path arrays", () => {
      const customPaths = ["/custom/read", "/another/read"];
      const customWritePaths = ["/custom/write"];

      const config = createSandboxConfig(
        {
          allowRead: customPaths,
          allowReadWrite: customWritePaths,
        },
        { workspaceType: "project" }
      );

      expect(config.allowRead).toEqual(customPaths);
      expect(config.allowReadWrite).toEqual(customWritePaths);
    });
  });
});
