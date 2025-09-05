// pattern: Imperative Shell
// Main entry point for the sandboxing module.
// Exports public APIs and integrates with CommandBuilder.

export { SandboxImplementation } from "./base.js";
export { createSandbox, createSandboxConfig } from "./factory.js";
export {
  getDefaultSystemPaths,
  getNetworkPaths,
  getPlatform,
  getSandboxBinary,
  isSandboxSupported,
} from "./platform.js";
export type { SandboxResolverOptions } from "./resolver.js";
export { resolveSandboxConfig } from "./resolver.js";
export type {
  FinalizedSandboxConfig,
  SandboxArgs,
  SandboxConfig,
  SandboxPath,
  SandboxValidation,
} from "./types.js";
export { PermissionType, SandboxPlatform } from "./types.js";
