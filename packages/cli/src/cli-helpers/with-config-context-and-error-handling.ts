// pattern: Imperative Shell

import { createConfigContext } from "../cli/contexts/index.js";
import { withErrorHandling } from "../cli/utils/with-error-handling.js";

import type { ConfigContext } from "../cli/contexts/index.js";
import type { SettingsProject, SettingsUser } from "../config/types/index.js";

/**
 * Convenience function to wrap a Commander action with ConfigContext and error handling
 *
 * This creates the appropriate context (user or project) based on the current mode,
 * loads the configuration, and wraps the action with error handling.
 *
 * @param configAction Action that requires configuration context
 * @param options Options for creating the context
 * @returns Action wrapped with context creation, config loading, and error handling
 */
export function withConfigContextAndErrorHandling<T extends unknown[]>(
  configAction: (
    context: ConfigContext,
    config: SettingsProject | SettingsUser,
    ...args: T
  ) => Promise<void> | void,
  options?: {
    target?: string;
    forceType?: "user" | "project";
  }
): (...args: T) => Promise<void> {
  return withErrorHandling(async (...args: T) => {
    // Create the appropriate context based on the current mode
    const context = createConfigContext(options);

    // Initialize config path based on existing files (format preservation)
    await context.initConfigPath();

    // Load the configuration using the context
    const config = await context.loadConfig();

    // Call the action with the context and loaded config
    await configAction(context, config, ...args);
  });
}
