// pattern: Functional Core

import { describe, expect, it, vi } from "vitest";

import { resolveSandboxConfig } from "./resolver.js";

import type { PathStringTemplate } from "../../config/types/utils.js";
import type { DirectoryResolver } from "../../runner/directory-resolver/index.js";
import type { ResolvedPath } from "../../runner/types/index.js";
import type { SandboxConfig } from "./types.js";

// Mock existsSync to control which system paths "exist"
vi.mock("node:fs", () => ({
  existsSync: vi.fn((path: string) => {
    // Only these paths "exist" in our tests
    return ["/bin", "/usr/bin", "/etc/resolv.conf"].includes(path);
  }),
}));

describe("resolveSandboxConfig", () => {
  const mockDirectoryResolver: DirectoryResolver = {
    workspace: "/workspace" as ResolvedPath,
    home: "/home/user" as ResolvedPath,
    data: "/data" as ResolvedPath,
    cache: "/cache" as ResolvedPath,
    log: "/log" as ResolvedPath,
    config: "/config" as ResolvedPath,
    temp: "/tmp" as ResolvedPath,
    user: "/home/user/.mcpadre" as ResolvedPath,
  };

  const defaultConfig: SandboxConfig = {
    enabled: true,
    networking: true,
    omitProjectPath: false,
    allowRead: [],
    allowReadWrite: [],
  };

  describe("basic functionality", () => {
    it("should include workspace path when omitProjectPath is false", () => {
      const result = resolveSandboxConfig({
        config: defaultConfig,
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
      });

      expect(result.allowRead).toContain("/workspace");
    });

    it("should not include workspace path when omitProjectPath is true", () => {
      const result = resolveSandboxConfig({
        config: { ...defaultConfig, omitProjectPath: true },
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
      });

      expect(result.allowRead).not.toContain("/workspace");
    });

    it("should include DNS paths when networking is enabled", () => {
      const result = resolveSandboxConfig({
        config: { ...defaultConfig, networking: true },
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
      });

      expect(result.allowRead).toContain("/etc/resolv.conf");
    });

    it("should not include DNS paths when networking is disabled", () => {
      const result = resolveSandboxConfig({
        config: { ...defaultConfig, networking: false },
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
      });

      expect(result.allowRead).not.toContain("/etc/resolv.conf");
    });

    it("should always include existing system paths", () => {
      const result = resolveSandboxConfig({
        config: defaultConfig,
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
      });

      expect(result.allowRead).toContain("/bin");
      expect(result.allowRead).toContain("/usr/bin");
    });
  });

  describe("template resolution", () => {
    it("should resolve template strings in allowRead", () => {
      const config: SandboxConfig = {
        ...defaultConfig,
        allowRead: ["{{dirs.home}}/documents" as PathStringTemplate],
        allowReadWrite: [],
      };

      const result = resolveSandboxConfig({
        config,
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
      });

      expect(result.allowRead).toContain("/home/user/documents");
    });

    it("should resolve template strings in allowReadWrite", () => {
      const config: SandboxConfig = {
        ...defaultConfig,
        allowRead: [],
        allowReadWrite: ["{{dirs.temp}}/scratch" as PathStringTemplate],
      };

      const result = resolveSandboxConfig({
        config,
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
      });

      expect(result.allowReadWrite).toContain("/tmp/scratch");
    });

    it("should resolve environment variable templates", () => {
      const config: SandboxConfig = {
        ...defaultConfig,
        allowRead: ["{{parentEnv.HOME}}/projects" as PathStringTemplate],
        allowReadWrite: [],
      };

      const result = resolveSandboxConfig({
        config,
        directoryResolver: mockDirectoryResolver,
        parentEnv: { HOME: "/users/alice" },
      });

      expect(result.allowRead).toContain("/users/alice/projects");
    });
  });

  describe("workspace options - disableAllSandboxes", () => {
    it("should disable sandbox when disableAllSandboxes is true", () => {
      const result = resolveSandboxConfig({
        config: { ...defaultConfig, enabled: true },
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
        workspaceOptions: {
          disableAllSandboxes: true,
        },
      });

      expect(result.enabled).toBe(false);
    });

    it("should not affect sandbox when disableAllSandboxes is false", () => {
      const result = resolveSandboxConfig({
        config: { ...defaultConfig, enabled: true },
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
        workspaceOptions: {
          disableAllSandboxes: false,
        },
      });

      expect(result.enabled).toBe(true);
    });

    it("should still disable when server config says disabled", () => {
      const result = resolveSandboxConfig({
        config: { ...defaultConfig, enabled: false },
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
        workspaceOptions: {
          disableAllSandboxes: false,
        },
      });

      expect(result.enabled).toBe(false);
    });

    it("should override server enabled setting when disableAllSandboxes is true", () => {
      const result = resolveSandboxConfig({
        config: { ...defaultConfig, enabled: true },
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
        workspaceOptions: {
          disableAllSandboxes: true,
        },
      });

      expect(result.enabled).toBe(false);
    });
  });

  describe("workspace options - extraAllowRead", () => {
    it("should add extra read paths to allowRead", () => {
      const result = resolveSandboxConfig({
        config: defaultConfig,
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
        workspaceOptions: {
          extraAllowRead: [
            "/extra/path1" as PathStringTemplate,
            "/extra/path2" as PathStringTemplate,
          ],
        },
      });

      expect(result.allowRead).toContain("/extra/path1");
      expect(result.allowRead).toContain("/extra/path2");
    });

    it("should resolve templates in extraAllowRead", () => {
      const result = resolveSandboxConfig({
        config: defaultConfig,
        directoryResolver: mockDirectoryResolver,
        parentEnv: { CUSTOM_DIR: "/custom" },
        workspaceOptions: {
          extraAllowRead: [
            "{{dirs.home}}/shared" as PathStringTemplate,
            "{{parentEnv.CUSTOM_DIR}}/data" as PathStringTemplate,
          ],
        },
      });

      expect(result.allowRead).toContain("/home/user/shared");
      expect(result.allowRead).toContain("/custom/data");
    });

    it("should merge with server's allowRead paths", () => {
      const config: SandboxConfig = {
        ...defaultConfig,
        allowRead: ["/server/path" as PathStringTemplate],
        allowReadWrite: [],
      };

      const result = resolveSandboxConfig({
        config,
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
        workspaceOptions: {
          extraAllowRead: ["/workspace/extra" as PathStringTemplate],
        },
      });

      expect(result.allowRead).toContain("/server/path");
      expect(result.allowRead).toContain("/workspace/extra");
    });
  });

  describe("workspace options - extraAllowWrite", () => {
    it("should add extra write paths to allowReadWrite", () => {
      const result = resolveSandboxConfig({
        config: defaultConfig,
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
        workspaceOptions: {
          extraAllowWrite: [
            "/writable/path1" as PathStringTemplate,
            "/writable/path2" as PathStringTemplate,
          ],
        },
      });

      expect(result.allowReadWrite).toContain("/writable/path1");
      expect(result.allowReadWrite).toContain("/writable/path2");
    });

    it("should resolve templates in extraAllowWrite", () => {
      const result = resolveSandboxConfig({
        config: defaultConfig,
        directoryResolver: mockDirectoryResolver,
        parentEnv: { TEMP_DIR: "/var/tmp" },
        workspaceOptions: {
          extraAllowWrite: [
            "{{dirs.cache}}/builds" as PathStringTemplate,
            "{{parentEnv.TEMP_DIR}}/work" as PathStringTemplate,
          ],
        },
      });

      expect(result.allowReadWrite).toContain("/cache/builds");
      expect(result.allowReadWrite).toContain("/var/tmp/work");
    });

    it("should merge with server's allowReadWrite paths", () => {
      const config: SandboxConfig = {
        ...defaultConfig,
        allowRead: [],
        allowReadWrite: ["/server/writable" as PathStringTemplate],
      };

      const result = resolveSandboxConfig({
        config,
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
        workspaceOptions: {
          extraAllowWrite: ["/workspace/output" as PathStringTemplate],
        },
      });

      expect(result.allowReadWrite).toContain("/server/writable");
      expect(result.allowReadWrite).toContain("/workspace/output");
    });
  });

  describe("workspace options - combined", () => {
    it("should apply all workspace options together", () => {
      const config: SandboxConfig = {
        enabled: true,
        networking: true,
        omitProjectPath: false,
        allowRead: ["/server/read" as PathStringTemplate],
        allowReadWrite: ["/server/write" as PathStringTemplate],
      };

      const result = resolveSandboxConfig({
        config,
        directoryResolver: mockDirectoryResolver,
        parentEnv: { APP_DIR: "/app" },
        workspaceOptions: {
          disableAllSandboxes: true,
          extraAllowRead: [
            "{{dirs.data}}/shared" as PathStringTemplate,
            "{{parentEnv.APP_DIR}}/resources" as PathStringTemplate,
          ],
          extraAllowWrite: ["{{dirs.temp}}/output" as PathStringTemplate],
        },
      });

      // Sandbox should be disabled
      expect(result.enabled).toBe(false);

      // But paths should still be resolved for when sandbox is re-enabled
      expect(result.allowRead).toContain("/server/read");
      expect(result.allowRead).toContain("/data/shared");
      expect(result.allowRead).toContain("/app/resources");

      expect(result.allowReadWrite).toContain("/server/write");
      expect(result.allowReadWrite).toContain("/tmp/output");
    });

    it("should handle undefined workspace options gracefully", () => {
      const result = resolveSandboxConfig({
        config: defaultConfig,
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
      });

      expect(result.enabled).toBe(true);
      expect(result.allowRead).toContain("/workspace");
      expect(result.allowRead).toContain("/bin");
    });

    it("should handle empty workspace options gracefully", () => {
      const result = resolveSandboxConfig({
        config: defaultConfig,
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
        workspaceOptions: {},
      });

      expect(result.enabled).toBe(true);
      expect(result.allowRead).toContain("/workspace");
    });

    it("should handle empty extra path arrays", () => {
      const result = resolveSandboxConfig({
        config: defaultConfig,
        directoryResolver: mockDirectoryResolver,
        parentEnv: {},
        workspaceOptions: {
          extraAllowRead: [],
          extraAllowWrite: [],
        },
      });

      expect(result.enabled).toBe(true);
      // Should still have default paths
      expect(result.allowRead).toContain("/workspace");
      expect(result.allowRead).toContain("/bin");
    });
  });
});
