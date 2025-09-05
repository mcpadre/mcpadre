// pattern: Functional Core

import { dirname } from "path";

import {
  findProjectConfig,
  loadAndValidateSettingsProject,
} from "../../config/loaders/settings-project.js";
import { ConfigurationError } from "../../utils/errors.js";

import type { SettingsProjectV1 } from "../../config/types/v1/index.js";

/**
 * Discovers and loads the mcpadre project configuration
 * @param startDir Directory to start searching from (defaults to cwd)
 * @param noParent If true, only search in the specified directory (don't climb tree)
 * @returns Object containing the config, project directory, and config file path
 * @throws Error if no config is found or config is invalid
 */
export async function discoverProjectConfig(
  startDir?: string,
  noParent?: boolean
): Promise<{
  config: SettingsProjectV1;
  projectDir: string;
  configPath: string;
}> {
  // Find the configuration file
  const configPath = await findProjectConfig(startDir, noParent);

  if (!configPath) {
    throw new ConfigurationError(
      "No mcpadre configuration file found. Please create one of: mcpadre.yaml, mcpadre.json, or mcpadre.toml"
    );
  }

  // Load and validate the configuration
  const config = await loadAndValidateSettingsProject(configPath);

  // Project directory is the directory containing the config file
  const projectDir = dirname(configPath);

  return {
    config,
    projectDir,
    configPath,
  };
}
