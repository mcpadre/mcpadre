// pattern: Imperative Shell

import { loadProjectConfigOrFail } from "../../config/loaders/settings-project.js";
import {
  loadRequiredUserConfig,
  loadUserConfigOrDefault,
} from "../../config/loaders/settings-user-loader.js";
import { mergeUserProjectConfig } from "../../config/mergers/user-project-merger.js";
import { CLI_LOGGER } from "../_deps.js";
import { getUserDir, getWorkspaceDir } from "../_globals.js";
import { isUserMode } from "../_globals.js";

import type {
  ProjectWorkspaceContext,
  SettingsBase,
  UserWorkspaceContext,
  WorkspaceContext,
} from "../../config/types/index.js";

export type ConfigLoader<T extends SettingsBase> = () => Promise<{
  config: T;
  dir: string;
  configPath: string;
}>;

export interface ConfigContext<T extends SettingsBase> {
  loader: ConfigLoader<T>;
  configType: "project" | "user";
  noConfigMessage: string[];
  paramName: string; // 'projectDir' or 'userDir'
}

/**
 * Creates a WorkspaceContext based on the current mode (user or project)
 */
export async function createWorkspaceContext(options?: {
  target?: string;
}): Promise<WorkspaceContext> {
  if (isUserMode()) {
    const userDir = getUserDir();
    const { config: userConfig, configPath: userConfigPath } =
      await loadRequiredUserConfig(userDir);

    const context: UserWorkspaceContext = {
      workspaceType: "user",
      workspaceDir: userDir,
      userConfig,
      userConfigPath,
      mergedConfig: userConfig, // User mode has no merging
    };

    return context;
  } else {
    const projectDir = options?.target ?? getWorkspaceDir() ?? process.cwd();
    const { config: projectConfig, configPath: projectConfigPath } =
      await loadProjectConfigOrFail(projectDir);

    const { config: userConfig } = await loadUserConfigOrDefault(getUserDir());

    const mergedConfig = mergeUserProjectConfig(userConfig, projectConfig);

    const context: ProjectWorkspaceContext = {
      workspaceType: "project",
      workspaceDir: projectDir,
      projectConfig,
      projectConfigPath,
      userConfig,
      mergedConfig,
    };

    return context;
  }
}

/**
 * Generic higher-order function for wrapping Commander actions with config loading
 *
 * @internal This is an implementation detail - use withProjectConfig or withUserConfig
 */
export function withConfigBase<T extends SettingsBase, Args extends unknown[]>(
  context: ConfigContext<T>,
  action: (
    config: T,
    dir: string,
    configPath: string,
    ...args: Args
  ) => Promise<void> | void,
  options: { enableErrorHandling?: boolean } = { enableErrorHandling: true }
): (...args: Args) => Promise<void> {
  return async (...args: Args): Promise<void> => {
    try {
      // Load configuration using the provided loader
      const { config, dir, configPath } = await context.loader();

      CLI_LOGGER.debug(
        `${context.configType === "project" ? "Project" : "User"} config loaded from: ${configPath}`
      );

      // Call the wrapped action with config parameters first, then original parameters
      await action(config, dir, configPath, ...args);
    } catch (error) {
      if (!options.enableErrorHandling) {
        // Re-throw error for external handling
        throw error;
      }

      // Handle configuration loading errors with CLI-appropriate messages
      if (
        error instanceof Error &&
        error.message.includes(
          `No mcpadre ${context.configType} configuration file found`
        )
      ) {
        context.noConfigMessage.forEach(line => CLI_LOGGER.error(line));
      } else {
        CLI_LOGGER.error(`Failed to load ${context.configType} configuration:`);
        if (error instanceof Error) {
          CLI_LOGGER.error(`    ${error.message}`);
          if (error.stack) {
            const stackLines = error.stack.split("\n").slice(1, 9); // Skip message, limit to 8 lines
            for (const line of stackLines) {
              const trimmedLine = line.trim();
              if (trimmedLine) {
                CLI_LOGGER.info(`        ${trimmedLine}`);
              }
            }
          }
        } else {
          CLI_LOGGER.error(error);
        }
      }

      // Exit with error code for CLI commands
      setTimeout(() => {
        process.exit(1);
      }, 200);
    }
  };
}
