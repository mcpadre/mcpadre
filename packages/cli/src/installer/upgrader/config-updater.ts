// pattern: Functional Core
// Configuration file update logic

import { findProjectConfig } from "../../config/loaders/settings-project.js";
import { findUserConfig } from "../../config/loaders/settings-user-loader.js";
import {
  isContainerServer,
  isNodeServer,
  isPythonServer,
} from "../../config/types/v1/server/index.js";
import { writeSettingsProjectToFile } from "../../config/writers/settings-project-writer.js";
import { writeSettingsUserToFile } from "../../config/writers/settings-user-writer.js";

import type {
  SettingsBase,
  SettingsProject,
  SettingsUser,
} from "../../config/types/index.js";
import type { ServerUpgradeInfo } from "./types.js";
import type { Logger } from "pino";

/**
 * Update mcpadre.yaml with new server versions
 */
export async function updateConfigWithNewVersions(
  config: SettingsBase,
  workingDir: string,
  successful: ServerUpgradeInfo[],
  logger: Logger,
  mode: "project" | "user" = "project"
): Promise<void> {
  logger.debug(`Updating configuration with new versions in ${workingDir}`);
  logger.debug(`Updating ${successful.length} server versions`);

  if (successful.length === 0) {
    logger.debug("No successful upgrades to update in config");
    return;
  }

  try {
    // Find the actual config file path based on mode
    let configPath: string | null;
    if (mode === "user") {
      configPath = await findUserConfig(workingDir);
    } else {
      configPath = await findProjectConfig(workingDir);
    }

    if (!configPath) {
      logger.warn(`Could not find ${mode} config file to update`);
      return;
    }

    logger.debug(`Found ${mode} config file at: ${configPath}`);

    // Create a deep copy of the config to modify
    const updatedConfig = JSON.parse(JSON.stringify(config)) as SettingsBase;

    // Update server versions for successful upgrades
    for (const upgrade of successful) {
      const server = updatedConfig.mcpServers[upgrade.serverName];
      if (!server) {
        logger.warn(`Server ${upgrade.serverName} not found in config`);
        continue;
      }

      // Update version based on server type using type guards
      if (upgrade.serverType === "node" && isNodeServer(server)) {
        server.node.version = upgrade.newVersion;
        logger.debug(
          `Updated Node.js server ${upgrade.serverName} to version ${upgrade.newVersion}`
        );
      } else if (upgrade.serverType === "python" && isPythonServer(server)) {
        server.python.version = upgrade.newVersion;
        logger.debug(
          `Updated Python server ${upgrade.serverName} to version ${upgrade.newVersion}`
        );
      } else if (
        upgrade.serverType === "container" &&
        isContainerServer(server)
      ) {
        server.container.tag = upgrade.newVersion;
        logger.debug(
          `Updated Docker server ${upgrade.serverName} to tag ${upgrade.newVersion}`
        );
      } else if (
        upgrade.serverType === "shell" ||
        upgrade.serverType === "http"
      ) {
        // Shell and HTTP servers don't have version fields to update
        logger.debug(
          `Server type ${upgrade.serverType} doesn't require config version updates`
        );
      } else {
        logger.warn(
          `Server type mismatch or unknown type for ${upgrade.serverName}: ${upgrade.serverType}`
        );
      }
    }

    // Write the updated config back to the file based on mode
    if (mode === "user") {
      await writeSettingsUserToFile(configPath, updatedConfig as SettingsUser);
    } else {
      await writeSettingsProjectToFile(
        configPath,
        updatedConfig as SettingsProject
      );
    }

    const upgradeList = successful
      .map(u => `${u.serverName} (${u.oldVersion} → ${u.newVersion})`)
      .join(", ");
    logger.info(`Updated config file with new versions: ${upgradeList}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to update config file: ${message}`);
    throw new Error(`Config update failed: ${message}`);
  }
}
