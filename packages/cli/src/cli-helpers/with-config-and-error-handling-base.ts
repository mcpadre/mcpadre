// pattern: Imperative Shell

import { withErrorHandling } from "../cli/utils/with-error-handling.js";

import type { SettingsBase } from "../config/types/index.js";

/**
 * Generic convenience function to wrap a Commander action with both config loading and error handling
 *
 * @internal This is an implementation detail - use specific wrappers
 */
export function withConfigAndErrorHandlingBase<
  T extends SettingsBase,
  Args extends unknown[],
>(
  withConfigFn: (
    action: (
      config: T,
      dir: string,
      configPath: string,
      ...args: Args
    ) => Promise<void> | void,
    options: { enableErrorHandling?: boolean }
  ) => (...args: Args) => Promise<void>
): (
  configAction: (
    config: T,
    dir: string,
    configPath: string,
    ...args: Args
  ) => Promise<void> | void
) => (...args: Args) => Promise<void> {
  return configAction => {
    return withErrorHandling(
      withConfigFn(configAction, { enableErrorHandling: false })
    );
  };
}
