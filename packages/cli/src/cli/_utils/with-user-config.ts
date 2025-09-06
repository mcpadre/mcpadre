// pattern: Imperative Shell

import { loadRequiredUserConfig } from "../../config/loaders/settings-user-loader.js";

import { withConfigBase } from "./with-config-base.js";

import type { SettingsUser } from "../../config/types/index.js";

/**
 * Higher-order function that wraps a Commander action to automatically load user configuration
 *
 * This HOF:
 * 1. Loads the mcpadre user configuration using loadRequiredUserConfig()
 * 2. Passes the config, userDir, and configPath as the first three parameters to the wrapped action
 * 3. Preserves all original action parameters after the config parameters
 * 4. Optionally handles configuration loading errors consistently with CLI-appropriate error messages
 *
 * @param action The action function to wrap, which will receive config parameters as first arguments
 * @param options Configuration options for the wrapper
 * @param options.enableErrorHandling If true, handles errors internally with process.exit(1). If false, re-throws errors for external handling.
 * @returns Wrapped action function suitable for use with Commander.js
 */
export function withUserConfig<T extends unknown[]>(
  action: (
    config: SettingsUser,
    userDir: string,
    configPath: string,
    ...args: T
  ) => Promise<void> | void,
  options: { enableErrorHandling?: boolean } = { enableErrorHandling: true }
): (...args: T) => Promise<void> {
  return withConfigBase(
    {
      loader: async () => {
        const result = await loadRequiredUserConfig();
        return {
          config: result.config,
          dir: result.userDir,
          configPath: result.configPath,
        };
      },
      configType: "user",
      noConfigMessage: [
        "No mcpadre user configuration file found.",
        "Please create a user configuration using: mcpadre init --user",
        "User configuration allows you to define global MCP servers that work across all projects.",
      ],
      paramName: "userDir",
    },
    action,
    options
  );
}
