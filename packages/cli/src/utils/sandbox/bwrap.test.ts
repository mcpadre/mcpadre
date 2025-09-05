// Unit tests for BwrapSandbox
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDirectoryResolver } from "../../runner/directory-resolver";

import { BwrapSandbox } from "./bwrap";
import { resolveSandboxConfig } from "./resolver";

import type { SandboxConfig } from "./types";

// Mock existsSync to control filesystem checks
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

// Mock execSync for validate method
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

describe("BwrapSandbox", () => {
  const logger = pino({ level: "silent" });
  const mockExistsSync = vi.mocked(existsSync);
  const mockExecSync = vi.mocked(execSync);

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all paths exist
    mockExistsSync.mockReturnValue(true);
  });

  describe("buildSandboxArgs", () => {
    it("should return null when sandbox is disabled", () => {
      const config: SandboxConfig = {
        enabled: false,
        networking: false,
        omitProjectPath: false,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new BwrapSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(result).toBeNull();
    });

    it("should build args with security flags when enabled", () => {
      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitProjectPath: true,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new BwrapSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(result).not.toBeNull();
      expect(result!.executable).toBe("bwrap");
      expect(result!.args).toContain("--new-session");
      expect(result!.args).toContain("--die-with-parent");
      expect(result!.args).toContain("--unshare-user");
      expect(result!.args).toContain("--unshare-pid");
      expect(result!.args).toContain("--unshare-ipc");
      expect(result!.args).toContain("--unshare-uts");
      expect(result!.args).toContain("--unshare-cgroup");
      expect(result!.args).toContain("--cap-drop");
      expect(result!.args).toContain("ALL");
      expect(result!.args).toContain("--hostname");
      expect(result!.args).toContain("sandbox");
      // Note: --clearenv is no longer used to allow parent process environment to pass through
    });

    it("should disable networking with --unshare-net when networking is false", () => {
      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitProjectPath: true,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new BwrapSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(result!.args).toContain("--unshare-net");
    });

    it("should bind DNS files when networking is enabled", () => {
      const config: SandboxConfig = {
        enabled: true,
        networking: true,
        omitProjectPath: true,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new BwrapSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(result!.args).not.toContain("--unshare-net");
      // Should bind DNS files somewhere in the arguments
      const args = result!.args;
      const argsString = args.join(" ");
      expect(argsString).toMatch(/resolv\.conf|hosts/);
    });

    it("should mount read-only paths with --ro-bind", () => {
      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitProjectPath: true,
        allowRead: ["/usr/local/bin", "/opt/tools"],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new BwrapSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("echo", ["hello"]);

      const args = result!.args;
      expect(args).toContain("--ro-bind");
      const roBindIndex = args.indexOf("--ro-bind");
      expect(args[roBindIndex + 1]).toBe("/usr/local/bin");
      expect(args[roBindIndex + 2]).toBe("/usr/local/bin");
    });

    it("should mount read-write paths with --bind", () => {
      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitProjectPath: true,
        allowRead: [],
        allowReadWrite: ["/tmp/work", "/home/user/project"],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new BwrapSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("echo", ["hello"]);

      const args = result!.args;
      expect(args).toContain("--bind");
      const bindIndex = args.indexOf("--bind");
      expect(args[bindIndex + 1]).toBe("/tmp/work");
      expect(args[bindIndex + 2]).toBe("/tmp/work");
    });

    it("should always include system paths for bash compatibility", () => {
      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitProjectPath: true,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new BwrapSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("echo", ["hello"]);

      const args = result!.args;
      // Should always have mounted system paths
      expect(args).toContain("--ro-bind");
      const argString = args.join(" ");
      expect(argString).toMatch(/\/bin|\/usr\/bin|\/lib|\/usr\/lib/);
    });

    it("should skip non-existent paths with warning", () => {
      mockExistsSync.mockImplementation(path => {
        return path !== "/nonexistent/path";
      });

      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitProjectPath: true,
        allowRead: ["/nonexistent/path", "/usr/local/bin"],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const warnSpy = vi.spyOn(logger, "warn");
      const sandbox = new BwrapSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ path: "/nonexistent/path" }),
        expect.stringContaining("non-existent")
      );

      const args = result!.args;
      expect(args).toContain("/usr/local/bin");
      expect(args).not.toContain("/nonexistent/path");
    });

    it("should append command and args at the end after --", () => {
      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitProjectPath: true,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new BwrapSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("npm", ["install", "typescript"]);

      const args = result!.args;
      const dashIndex = args.indexOf("--");
      expect(dashIndex).toBeGreaterThan(-1);
      expect(args[dashIndex + 1]).toBe("npm");
      expect(args[dashIndex + 2]).toBe("install");
      expect(args[dashIndex + 3]).toBe("typescript");
    });

    it("should set appendCommand to false", () => {
      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitProjectPath: true,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new BwrapSandbox(logger, finalizedConfig);
      const result = sandbox.buildSandboxArgs("echo", ["hello"]);

      expect(result!.appendCommand).toBe(false);
    });
  });

  describe("validate", () => {
    it("should return true when bwrap is available and functional", async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === "which bwrap") {
          return "/usr/bin/bwrap\n";
        }
        if (cmd.includes("bwrap") && cmd.includes("--ro-bind")) {
          return "";
        }
        throw new Error("Unexpected command");
      });

      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitProjectPath: true,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new BwrapSandbox(logger, finalizedConfig);
      const result = await sandbox.validate();

      expect(result).toBe(true);
    });

    it("should return false when bwrap is not found", async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error("Command not found");
      });

      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitProjectPath: true,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new BwrapSandbox(logger, finalizedConfig);
      const result = await sandbox.validate();

      expect(result).toBe(false);
    });

    it("should return false when bwrap exists but fails functionality test", async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === "which bwrap") {
          return "/usr/bin/bwrap\n";
        }
        throw new Error("Bwrap functionality test failed");
      });

      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitProjectPath: true,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new BwrapSandbox(logger, finalizedConfig);
      const result = await sandbox.validate();

      expect(result).toBe(false);
    });

    it("should cache validation result", async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === "which bwrap") {
          return "/usr/bin/bwrap\n";
        }
        if (cmd.includes("bwrap")) {
          return "";
        }
        throw new Error("Unexpected command");
      });

      const config: SandboxConfig = {
        enabled: true,
        networking: false,
        omitProjectPath: true,
        allowRead: [],
        allowReadWrite: [],
      };

      const directoryResolver = createDirectoryResolver();
      const finalizedConfig = resolveSandboxConfig({
        config,
        directoryResolver,
        parentEnv: process.env,
      });

      const sandbox = new BwrapSandbox(logger, finalizedConfig);

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
