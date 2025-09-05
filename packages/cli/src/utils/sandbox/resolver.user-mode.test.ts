import { describe, expect, it } from "vitest";

import { createDirectoryResolver } from "../../runner/directory-resolver/index.js";

import { createSandboxConfig } from "./factory.js";
import { resolveSandboxConfig } from "./resolver.js";

describe("sandbox resolver user mode", () => {
  it("should default enabled to false for user mode", () => {
    const directoryResolver = createDirectoryResolver();

    // Test with user mode
    const userModeConfig = resolveSandboxConfig({
      config: createSandboxConfig(undefined, { isUserMode: true }),
      directoryResolver,
      parentEnv: process.env,
      isUserMode: true,
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

  it("should use user directory instead of workspace for user mode when omitProjectPath is false", () => {
    const directoryResolver = createDirectoryResolver();

    // Test with user mode - should use user directory
    const userModeConfig = resolveSandboxConfig({
      config: createSandboxConfig(
        { omitProjectPath: false },
        { isUserMode: true }
      ),
      directoryResolver,
      parentEnv: process.env,
      isUserMode: true,
    });

    expect(userModeConfig.allowRead).toContain(directoryResolver.user);

    // Test without user mode - should use workspace directory
    const projectModeConfig = resolveSandboxConfig({
      config: createSandboxConfig({ omitProjectPath: false }),
      directoryResolver,
      parentEnv: process.env,
    });

    expect(projectModeConfig.allowRead).toContain(directoryResolver.workspace);
  });

  it("should not add any directory when omitProjectPath is true", () => {
    const directoryResolver = createDirectoryResolver();

    // Test with user mode and omitProjectPath=true
    const userModeConfig = resolveSandboxConfig({
      config: createSandboxConfig(
        { omitProjectPath: true },
        { isUserMode: true }
      ),
      directoryResolver,
      parentEnv: process.env,
      isUserMode: true,
    });

    expect(userModeConfig.allowRead).not.toContain(directoryResolver.user);
    expect(userModeConfig.allowRead).not.toContain(directoryResolver.workspace);
  });

  it("should allow explicit sandbox.enabled=true to override user mode default", () => {
    const directoryResolver = createDirectoryResolver();

    // Test with user mode but explicit enabled=true
    const userModeConfig = resolveSandboxConfig({
      config: createSandboxConfig({ enabled: true }, { isUserMode: true }),
      directoryResolver,
      parentEnv: process.env,
      isUserMode: true,
    });

    expect(userModeConfig.enabled).toBe(true);
  });
});
