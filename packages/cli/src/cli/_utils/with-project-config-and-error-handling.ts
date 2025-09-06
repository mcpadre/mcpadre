// pattern: Imperative Shell

import { withConfigAndErrorHandlingBase } from "./with-config-and-error-handling-base.js";
import { withProjectConfig } from "./with-project-config.js";

import type { SettingsProject } from "../../config/types/index.js";

/**
 * Convenience function to wrap a Commander action with both project config loading and error handling
 *
 * This combines withProjectConfig (with error handling disabled) and withErrorHandling for commands that need both.
 * Apply error handling as the outer wrapper so it catches config loading errors too.
 *
 * @param configAction Action that requires project configuration
 * @returns Action wrapped with config loading and error handling
 */
export function withProjectConfigAndErrorHandling<T extends unknown[]>(
  configAction: (
    config: SettingsProject,
    projectDir: string,
    configPath: string,
    ...args: T
  ) => Promise<void> | void
): (...args: T) => Promise<void> {
  return withConfigAndErrorHandlingBase<SettingsProject, T>(withProjectConfig)(
    configAction
  );
}
