// pattern: Functional Core
// Factory and exports for configuration contexts

import { isUserMode } from "../_globals.js";

import { ProjectConfigContext } from "./project-context.js";
import { UserConfigContext } from "./user-context.js";

import type { ConfigContext } from "./config-context.js";

/**
 * Options for creating a configuration context
 */
export interface CreateContextOptions {
  /**
   * Target directory for project mode (ignored in user mode)
   */
  target?: string;

  /**
   * Force a specific context type (for testing)
   */
  forceType?: "user" | "project";
}

/**
 * Factory function to create the appropriate configuration context
 * based on the current mode (user or project)
 *
 * Note: This does NOT automatically call initConfigPath() - you must call it
 * manually before using the context for operations that require the correct
 * config path. The withConfigContextAndErrorHandling helper handles this for you.
 */
export function createConfigContext(
  options?: CreateContextOptions
): ConfigContext {
  const contextType = options?.forceType ?? (isUserMode() ? "user" : "project");

  if (contextType === "user") {
    return new UserConfigContext();
  } else {
    return new ProjectConfigContext(options?.target);
  }
}

// Re-export types and classes for convenience
export type { ConfigContext } from "./config-context.js";
export { BaseConfigContext } from "./config-context.js";
export { ProjectConfigContext } from "./project-context.js";
export { UserConfigContext } from "./user-context.js";
