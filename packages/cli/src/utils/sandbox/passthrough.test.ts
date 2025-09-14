// Unit tests for PassthroughSandbox
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDirectoryResolver } from "../../runner/directory-resolver";

import { PassthroughSandbox } from "./passthrough";
import { resolveSandboxConfig } from "./resolver";

import type { WorkspaceContext } from "../../config/types/index.js";
import type { SandboxConfig } from "./types";

// Helper function to create a WorkspaceContext for testing
function createTestWorkspaceContext(workspaceDir: string): WorkspaceContext {
  const config = {
    mcpServers: {},
    hosts: {},
    options: {},
    version: 1,
  } as const;

  return {
    workspaceType: "project",
    workspaceDir,
    mergedConfig: config,
    projectConfig: config,
    projectConfigPath: `${workspaceDir}/mcpadre.yaml`,
    userConfig: config,
  };
}

// Mock getPlatform
vi.mock("./platform", async () => {
  const actual = await vi.importActual("./platform");
  return {
    ...actual,
    getPlatform: vi.fn(),
  };
});

import { getPlatform, SandboxPlatform } from "./platform";

describe("PassthroughSandbox", () => {
  const logger = pino({ level: "silent" });
  const mockGetPlatform = vi.mocked(getPlatform);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildSandboxArgs", () => {
    it("should always return null regardless of config", () => {
      const config: SandboxConfig = {
        enabled: true,
        networking: true,
        omitWorkspacePath: false,
        allowRead: ["/usr/bin", "/lib"],
        allowReadWrite: ["/tmp"],
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext("/tmp")
      );
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new PassthroughSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(result).toBeNull();
    });

    it("should warn on Windows when sandbox is requested", () => {
      mockGetPlatform.mockReturnValue(SandboxPlatform.Windows);

      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitWorkspacePath: false,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext("/tmp")
      );
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const warnSpy = vi.spyOn(logger, "warn");
      const sandbox = new PassthroughSandbox(logger, finalizedConfig);
      sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Windows"));
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("without isolation")
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("VM or container")
      );
    });

    it("should warn on unknown platform when sandbox is requested", () => {
      mockGetPlatform.mockReturnValue(SandboxPlatform.Unknown);

      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitWorkspacePath: false,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext("/tmp")
      );
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const warnSpy = vi.spyOn(logger, "warn");
      const sandbox = new PassthroughSandbox(logger, finalizedConfig);
      sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("platform is not recognized")
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("without isolation")
      );
    });

    it("should not warn on Linux when sandbox is disabled", () => {
      mockGetPlatform.mockReturnValue(SandboxPlatform.Linux);

      const config: SandboxConfig = {
        enabled: false,
        networking: false,
        omitWorkspacePath: false,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext("/tmp")
      );
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const warnSpy = vi.spyOn(logger, "warn");
      const sandbox = new PassthroughSandbox(logger, finalizedConfig);
      sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should not warn on macOS when sandbox is disabled", () => {
      mockGetPlatform.mockReturnValue(SandboxPlatform.MacOS);

      const config: SandboxConfig = {
        enabled: false,
        networking: false,
        omitWorkspacePath: false,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext("/tmp")
      );
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const warnSpy = vi.spyOn(logger, "warn");
      const sandbox = new PassthroughSandbox(logger, finalizedConfig);
      sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should only warn once even with multiple calls", () => {
      mockGetPlatform.mockReturnValue(SandboxPlatform.Windows);

      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitWorkspacePath: false,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext("/tmp")
      );
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const warnSpy = vi.spyOn(logger, "warn");
      const sandbox = new PassthroughSandbox(logger, finalizedConfig);

      // First call
      sandbox.buildSandboxArgs("echo", ["hello"]);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Second call
      sandbox.buildSandboxArgs("echo", ["world"]);
      expect(warnSpy).toHaveBeenCalledTimes(1); // Still only 1

      // Third call
      sandbox.buildSandboxArgs("ls", ["-la"]);
      expect(warnSpy).toHaveBeenCalledTimes(1); // Still only 1
    });

    it("should not warn when sandbox is disabled on Windows", () => {
      mockGetPlatform.mockReturnValue(SandboxPlatform.Windows);

      const config: SandboxConfig = {
        enabled: false,
        networking: false,
        omitWorkspacePath: false,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext("/tmp")
      );
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const warnSpy = vi.spyOn(logger, "warn");
      const sandbox = new PassthroughSandbox(logger, finalizedConfig);
      sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("validate", () => {
    it("should always return true", async () => {
      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitWorkspacePath: false,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext("/tmp")
      );
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new PassthroughSandbox(logger, finalizedConfig);
      const result = await sandbox.validate();

      expect(result).toBe(true);
    });

    it("should return true even when disabled", async () => {
      const config: SandboxConfig = {
        enabled: false,
        networking: false,
        omitWorkspacePath: false,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext("/tmp")
      );
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new PassthroughSandbox(logger, finalizedConfig);
      const result = await sandbox.validate();

      expect(result).toBe(true);
    });
  });

  describe("name property", () => {
    it("should return 'passthrough'", () => {
      const config: SandboxConfig = {
        enabled: false,
        networking: false,
        omitWorkspacePath: false,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext("/tmp")
      );
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new PassthroughSandbox(logger, finalizedConfig);
      expect(sandbox.name).toBe("passthrough");
    });
  });
});
