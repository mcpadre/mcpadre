import { describe, expect, it } from "vitest";

import { createDirectoryResolver } from "../../runner/directory-resolver/index.js";

import { createSandboxConfig } from "./factory.js";
import { resolveSandboxConfig } from "./resolver.js";

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

describe("sandbox resolver user mode", () => {
  it("should default enabled to false for user mode", () => {
    const directoryResolver = createDirectoryResolver(
      createTestWorkspaceContext("/tmp")
    );

    // Test with user mode
    const userModeConfig = resolveSandboxConfig({
      config: createSandboxConfig(undefined, { workspaceType: "user" }),
      directoryResolver,
      parentEnv: process.env,
    });

    expect(userModeConfig.enabled).toBe(false);

    // Test without user mode (project mode)
    const projectModeConfig = resolveSandboxConfig({
      config: createSandboxConfig(undefined),
      directoryResolver,
      parentEnv: process.env,
    });

    expect(projectModeConfig.enabled).toBe(true);
  });

  it("should use workspace directory for both user and project modes when omitWorkspacePath is false", () => {
    const directoryResolver = createDirectoryResolver(
      createTestWorkspaceContext("/tmp")
    );

    // Test with user mode - should use workspace directory (unified approach)
    const userModeConfig = resolveSandboxConfig({
      config: createSandboxConfig(
        { omitWorkspacePath: false },
        { workspaceType: "user" }
      ),
      directoryResolver,
      parentEnv: process.env,
    });

    expect(userModeConfig.allowRead).toContain(directoryResolver.workspace);

    // Test without user mode - should use workspace directory
    const projectModeConfig = resolveSandboxConfig({
      config: createSandboxConfig({ omitWorkspacePath: false }),
      directoryResolver,
      parentEnv: process.env,
    });

    expect(projectModeConfig.allowRead).toContain(directoryResolver.workspace);
  });

  it("should not add any directory when omitWorkspacePath is true", () => {
    const directoryResolver = createDirectoryResolver(
      createTestWorkspaceContext("/tmp")
    );

    // Test with user mode and omitWorkspacePath=true
    const userModeConfig = resolveSandboxConfig({
      config: createSandboxConfig(
        { omitWorkspacePath: true },
        { workspaceType: "user" }
      ),
      directoryResolver,
      parentEnv: process.env,
    });

    expect(userModeConfig.allowRead).not.toContain(directoryResolver.workspace);
  });

  it("should allow explicit sandbox.enabled=true to override user mode default", () => {
    const directoryResolver = createDirectoryResolver(
      createTestWorkspaceContext("/tmp")
    );

    // Test with user mode but explicit enabled=true
    const userModeConfig = resolveSandboxConfig({
      config: createSandboxConfig({ enabled: true }, { workspaceType: "user" }),
      directoryResolver,
      parentEnv: process.env,
    });

    expect(userModeConfig.enabled).toBe(true);
  });
});
