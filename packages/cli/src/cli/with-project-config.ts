// pattern: Imperative Shell

import { discoverProjectConfig } from "../installer/discovery/project-discovery.js";

import { getNoParentFlag } from "./_globals.js";
import { withConfigBase } from "./with-config-base.js";

import type { SettingsProject } from "../config/types/index.js";

/**
 * Higher-order function that wraps a Commander action to automatically load project configuration
 *
 * This HOF:
 * 1. Discovers and loads the mcpadre project configuration using discoverProjectConfig()
 * 2. Passes the config, projectDir, and configPath as the first three parameters to the wrapped action
 * 3. Preserves all original action parameters after the config parameters
 * 4. Optionally handles configuration loading errors consistently with CLI-appropriate error messages
 *
 * @param action The action function to wrap, which will receive config parameters as first arguments
 * @param options Configuration options for the wrapper
 * @param options.enableErrorHandling If true, handles errors internally with process.exit(1). If false, re-throws errors for external handling.
 * @returns Wrapped action function suitable for use with Commander.js
 */
export function withProjectConfig<T extends unknown[]>(
  action: (
    config: SettingsProject,
    projectDir: string,
    configPath: string,
    ...args: T
  ) => Promise<void> | void,
  options: { enableErrorHandling?: boolean } = { enableErrorHandling: true }
): (...args: T) => Promise<void> {
  return withConfigBase(
    {
      loader: async () => {
        const noParent = getNoParentFlag();
        const result = await discoverProjectConfig(undefined, noParent);
        return {
          config: result.config,
          dir: result.projectDir,
          configPath: result.configPath,
        };
      },
      configType: "project",
      noConfigMessage: [
        "No mcpadre configuration file found.",
        "Please run this command from a directory containing mcpadre.yaml, mcpadre.json, or mcpadre.toml",
        "Or create a configuration file using: mcpadre init",
      ],
      paramName: "projectDir",
    },
    action,
    options
  );
}
