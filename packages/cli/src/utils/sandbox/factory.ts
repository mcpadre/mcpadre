// pattern: Imperative Shell
// Factory for creating appropriate sandbox implementations based on platform.
// Performs platform detection and instantiation of concrete implementations.

import { SandboxImplementation } from "./base.js";
import { BwrapSandbox } from "./bwrap.js";
import { MacOSSandbox } from "./macos.js";
import { PassthroughSandbox } from "./passthrough.js";
import {
  getPlatform,
  isSandboxSupported,
  SandboxPlatform,
} from "./platform.js";

import type { FinalizedSandboxConfig, SandboxConfig } from "./types.js";
import type { Logger } from "pino";

/**
 * Create a sandbox implementation appropriate for the current platform
 *
 * @param logger Logger instance for debugging and warnings
 * @param config Finalized sandbox configuration with resolved paths
 * @returns A platform-specific sandbox implementation
 */
export function createSandbox(
  logger: Logger,
  config: FinalizedSandboxConfig
): SandboxImplementation {
  // If sandboxing is explicitly disabled, use passthrough
  if (!config.enabled) {
    logger.debug("Sandboxing disabled, using passthrough implementation");
    return new PassthroughSandbox(logger, config);
  }

  // Check if platform supports sandboxing
  if (!isSandboxSupported()) {
    logger.debug(
      { platform: getPlatform() },
      "Platform does not support sandboxing, using passthrough"
    );
    return new PassthroughSandbox(logger, config);
  }

  // Select implementation based on platform
  const platform = getPlatform();

  switch (platform) {
    case SandboxPlatform.Linux:
      logger.debug("Using bubblewrap sandbox for Linux");
      return new BwrapSandbox(logger, config);

    case SandboxPlatform.MacOS:
      logger.debug("Using sandbox-exec for macOS");
      return new MacOSSandbox(logger, config);

    default:
      // This should not happen due to isSandboxSupported check above
      logger.warn(
        { platform },
        "Unexpected platform in sandbox factory, using passthrough"
      );
      return new PassthroughSandbox(logger, config);
  }
}

/**
 * Convert user-provided SandboxOptions to internal SandboxConfig.
 * This creates the raw config before path resolution.
 */
export function createSandboxConfig(
  options: Partial<SandboxConfig> | undefined,
  opts?: { isUserMode?: boolean }
): SandboxConfig {
  // User servers default to disabled sandbox unless explicitly enabled
  const defaultEnabled = opts?.isUserMode ? false : true;

  return {
    enabled: options?.enabled ?? defaultEnabled,
    networking: options?.networking ?? true,
    omitProjectPath: options?.omitProjectPath ?? false,
    allowRead: options?.allowRead ?? [],
    allowReadWrite: options?.allowReadWrite ?? [],
  };
}
