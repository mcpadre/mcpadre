// pattern: Imperative Shell

import { withUserConfig } from "../cli/with-user-config.js";

import { withConfigAndErrorHandlingBase } from "./with-config-and-error-handling-base.js";

import type { SettingsUser } from "../config/types/index.js";

/**
 * Convenience function to wrap a Commander action with both user config loading and error handling
 *
 * This combines withUserConfig (with error handling disabled) and withErrorHandling for commands that need both.
 * Apply error handling as the outer wrapper so it catches config loading errors too.
 *
 * @param configAction Action that requires user configuration
 * @returns Action wrapped with config loading and error handling
 */
export function withUserConfigAndErrorHandling<T extends unknown[]>(
  configAction: (
    config: SettingsUser,
    userDir: string,
    configPath: string,
    ...args: T
  ) => Promise<void> | void
): (...args: T) => Promise<void> {
  return withConfigAndErrorHandlingBase<SettingsUser, T>(withUserConfig)(
    configAction
  );
}
