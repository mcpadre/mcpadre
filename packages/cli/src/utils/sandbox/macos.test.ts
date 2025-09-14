// Unit tests for MacOSSandbox
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDirectoryResolver } from "../../runner/directory-resolver";

import { MacOSSandbox } from "./macos";
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

// Mock execSync for validate method
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";

describe("MacOSSandbox", () => {
  const logger = pino({ level: "silent" });
  const mockExecSync = vi.mocked(execSync);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildSandboxArgs", () => {
    it("should return null when sandbox is disabled", () => {
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

      const sandbox = new MacOSSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(result).toBeNull();
    });

    it("should generate working S-expression policy", () => {
      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitWorkspacePath: true,
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

      const sandbox = new MacOSSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(result).not.toBeNull();
      expect(result!.executable).toBe("sandbox-exec");
      expect(result!.args[0]).toBe("-p");

      const policy = result!.args[1];
      expect(policy).toContain("(version 1)");
      expect(policy).toContain('(import "system.sb")');
      expect(policy).toContain("(deny default)");
      expect(policy).toContain("(allow mach*)");
    });

    it("should include command and args after policy", () => {
      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitWorkspacePath: true,
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

      const sandbox = new MacOSSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("npm", ["install", "typescript"]);

      expect(result!.args[2]).toBe("npm");
      expect(result!.args[3]).toBe("install");
      expect(result!.args[4]).toBe("typescript");
      expect(result!.appendCommand).toBe(false);
    });
  });

  describe("validate", () => {
    it("should return true when sandbox-exec is available and functional", async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === "which sandbox-exec") {
          return "/usr/bin/sandbox-exec\n";
        }
        if (cmd.includes("sandbox-exec") && cmd.includes("-p")) {
          return "";
        }
        throw new Error("Unexpected command");
      });

      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitWorkspacePath: true,
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

      const sandbox = new MacOSSandbox(logger, finalizedConfig);
      const result = await sandbox.validate();

      expect(result).toBe(true);
    });

    it("should return false when sandbox-exec is not found", async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error("Command not found");
      });

      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitWorkspacePath: true,
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

      const sandbox = new MacOSSandbox(logger, finalizedConfig);
      const result = await sandbox.validate();

      expect(result).toBe(false);
    });

    it("should return false when sandbox-exec exists but fails functionality test", async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === "which sandbox-exec") {
          return "/usr/bin/sandbox-exec\n";
        }
        throw new Error("sandbox-exec functionality test failed");
      });

      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitWorkspacePath: true,
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

      const sandbox = new MacOSSandbox(logger, finalizedConfig);
      const result = await sandbox.validate();

      expect(result).toBe(false);
    });

    it("should cache validation result", async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === "which sandbox-exec") {
          return "/usr/bin/sandbox-exec\n";
        }
        if (cmd.includes("sandbox-exec")) {
          return "";
        }
        throw new Error("Unexpected command");
      });

      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitWorkspacePath: true,
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

      const sandbox = new MacOSSandbox(logger, finalizedConfig);

      const result1 = await sandbox.validate();
      expect(result1).toBe(true);
      expect(mockExecSync).toHaveBeenCalledTimes(2);

      // Second call should use cached result
      const result2 = await sandbox.validate();
      expect(result2).toBe(true);
      expect(mockExecSync).toHaveBeenCalledTimes(2); // No additional calls
    });
  });
});
