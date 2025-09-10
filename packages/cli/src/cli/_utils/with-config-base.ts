// pattern: Imperative Shell

import { join } from "node:path";

import { loadAndValidateSettingsProject } from "../../config/loaders/settings-project.js";
import { loadAndValidateSettingsUser } from "../../config/loaders/settings-user-loader.js";
import { CLI_LOGGER } from "../_deps.js";
import { getUserDir, getWorkspaceDir } from "../_globals.js";
import { isUserMode } from "../_globals.js";

import type {
  ProjectWorkspaceContext,
  SettingsBase,
  SettingsProject,
  SettingsUser,
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
 * Attempts to load user configuration, returning undefined if it fails
 */
async function tryLoadUserConfig(): Promise<SettingsUser | undefined> {
  try {
    const userDir = getUserDir();
    const userConfigPath = join(userDir, "mcpadre.yaml");
    return await loadAndValidateSettingsUser(userConfigPath);
  } catch {
    return undefined;
  }
}

/**
 * Merges project and user configs, with project config taking precedence
 */
function mergeConfigs(
  projectConfig: SettingsProject,
  userConfig?: SettingsUser
): SettingsProject {
  if (!userConfig) {
    return projectConfig;
  }

  // For now, simple merge - project config takes precedence
  // In the future, we might want more sophisticated merging
  return {
    ...userConfig,
    ...projectConfig,
    // Ensure project-specific options override user options
    options: {
      ...userConfig.options,
      ...projectConfig.options,
    },
  };
}

/**
 * Creates a WorkspaceContext based on the current mode (user or project)
 */
export async function createWorkspaceContext(options?: {
  target?: string;
}): Promise<WorkspaceContext> {
  if (isUserMode()) {
    const userDir = getUserDir();
    const userConfig = await loadAndValidateSettingsUser(
      join(userDir, "mcpadre.yaml")
    );

    const context: UserWorkspaceContext = {
      workspaceType: "user",
      workspaceDir: userDir,
      userConfig,
      mergedConfig: userConfig, // User mode has no merging
    };

    return context;
  } else {
    const projectDir = options?.target ?? getWorkspaceDir() ?? process.cwd();
    const projectConfig = await loadAndValidateSettingsProject(
      join(projectDir, "mcpadre.yaml")
    );
    const userConfig = await tryLoadUserConfig(); // Optional
    const mergedConfig = mergeConfigs(projectConfig, userConfig);

    const context: ProjectWorkspaceContext = {
      workspaceType: "project",
      workspaceDir: projectDir,
      projectConfig,
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
