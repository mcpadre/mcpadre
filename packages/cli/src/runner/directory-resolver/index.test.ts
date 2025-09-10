// pattern: Imperative Shell
import { mkdir, rm } from "fs/promises";
import { homedir } from "os";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDirectoryResolver } from "./index.js";

import type { WorkspaceContext } from "../../config/types/index.js";

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
    userConfig: undefined,
  };
}

describe("createDirectoryResolver", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create unique test directory
    testDir = join(
      tmpdir(),
      `mcpadre-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  it("should resolve all standard directories", () => {
    const resolver = createDirectoryResolver(
      createTestWorkspaceContext(testDir)
    );

    expect(resolver.home).toBeDefined();
    expect(resolver.config).toBeDefined();
    expect(resolver.cache).toBeDefined();
    expect(resolver.data).toBeDefined();
    expect(resolver.log).toBeDefined();
    expect(resolver.temp).toBeDefined();
    expect(resolver.workspace).toBeDefined();

    // All paths should be strings
    expect(typeof resolver.home).toBe("string");
    expect(typeof resolver.config).toBe("string");
    expect(typeof resolver.cache).toBe("string");
    expect(typeof resolver.data).toBe("string");
    expect(typeof resolver.log).toBe("string");
    expect(typeof resolver.temp).toBe("string");
    expect(typeof resolver.workspace).toBe("string");
  });

  it("should use OS home directory for home path", () => {
    const resolver = createDirectoryResolver(
      createTestWorkspaceContext(testDir)
    );

    expect(resolver.home as string).toBe(homedir());
  });

  it("should use current working directory when specified", () => {
    const resolver = createDirectoryResolver(
      createTestWorkspaceContext(process.cwd())
    );

    expect(resolver.workspace as string).toBe(process.cwd());
  });

  it("should use provided workspace path when it exists", async () => {
    const workspaceDir = join(testDir, "workspace");
    await mkdir(workspaceDir);

    const resolver = createDirectoryResolver(
      createTestWorkspaceContext(workspaceDir)
    );

    expect(resolver.workspace as string).toBe(workspaceDir);
  });

  it("should throw error when workspace path doesn't exist", () => {
    const nonExistentPath = join(testDir, "non-existent");

    expect(() =>
      createDirectoryResolver(createTestWorkspaceContext(nonExistentPath))
    ).toThrow(`Workspace directory does not exist: ${nonExistentPath}`);
  });

  it("should use current working directory when specified", () => {
    const resolver = createDirectoryResolver(
      createTestWorkspaceContext(process.cwd())
    );

    expect(resolver.workspace as string).toBe(process.cwd());
  });

  it("should resolve parent directories from env-paths", () => {
    const resolver = createDirectoryResolver(
      createTestWorkspaceContext(testDir)
    );

    // These should be parent directories, not app-specific ones
    // We can't test exact paths since they're platform-specific,
    // but we can verify they're non-empty strings
    expect((resolver.config as string).length).toBeGreaterThan(0);
    expect((resolver.cache as string).length).toBeGreaterThan(0);
    expect((resolver.data as string).length).toBeGreaterThan(0);
    expect((resolver.log as string).length).toBeGreaterThan(0);
    expect((resolver.temp as string).length).toBeGreaterThan(0);
  });

  it("should preserve branding through the resolver", () => {
    const resolver = createDirectoryResolver(
      createTestWorkspaceContext(testDir)
    );

    // The branded types should work with type system
    // We can't directly test the branding, but we can verify the structure
    const paths = [
      resolver.home,
      resolver.config,
      resolver.cache,
      resolver.data,
      resolver.log,
      resolver.temp,
      resolver.workspace,
    ];

    paths.forEach(path => {
      expect(typeof path).toBe("string");
      expect((path as string).length).toBeGreaterThan(0);
    });
  });
});
