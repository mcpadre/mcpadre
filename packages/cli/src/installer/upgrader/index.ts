// pattern: Imperative Shell
// Main upgrade orchestration

import Docker from "dockerode";

import {
  isContainerServer,
  isNodeServer,
  isPythonServer,
} from "../../config/types/v1/server/index.js";
import {
  ConfigurationError,
  ServerError,
  ValidationError,
} from "../../utils/errors.js";
import { checkAllOutdated } from "../outdated/index.js";

import { updateConfigWithNewVersions } from "./config-updater.js";
import { upgradeDockerServer } from "./docker-upgrader.js";
import { upgradeNodeServer } from "./node-upgrader.js";
import { upgradePythonServer } from "./python-upgrader.js";

import type { SettingsBase } from "../../config/types/index.js";
import type {
  DockerUpgradeOptions,
  NodeUpgradeOptions,
  PythonUpgradeOptions,
  ServerUpgradeInfo,
  UpgradeOptions,
  UpgradeResult,
  UpgradeWarning,
} from "./types.js";
import type { Logger } from "pino";

/**
 * Upgrade servers based on the provided options
 */
export async function upgradeServers(
  config: SettingsBase,
  workingDir: string,
  options: UpgradeOptions,
  logger: Logger,
  mode: "project" | "user" = "project"
): Promise<UpgradeResult> {
  logger.debug(`Starting upgrade process in ${workingDir}`);
  logger.debug(
    `Options: upgradeAll=${options.upgradeAll}, serverNames=[${options.serverNames.join(",")}], skipAudit=${options.skipAudit}`
  );

  const warnings: UpgradeWarning[] = [];

  try {
    // Initialize Docker client for container checks
    const docker = new Docker();

    // First, check which servers are outdated
    logger.debug("Checking for outdated servers");
    const outdatedResult = await checkAllOutdated(workingDir, docker, logger, {
      includeAudit: false,
      skipCache: false,
    });

    // Filter outdated servers based on options
    let serversToUpgrade = outdatedResult.servers.filter(
      server => server.isOutdated
    );

    if (!options.upgradeAll && options.serverNames.length > 0) {
      // Only upgrade specified servers
      serversToUpgrade = serversToUpgrade.filter(server =>
        options.serverNames.includes(server.serverName)
      );

      // Check for servers that were requested but are not outdated
      const requestedButNotOutdated = options.serverNames.filter(
        name =>
          !outdatedResult.servers.some(
            server => server.serverName === name && server.isOutdated
          )
      );

      for (const serverName of requestedButNotOutdated) {
        const serverExists = outdatedResult.servers.some(
          s => s.serverName === serverName
        );
        if (serverExists) {
          warnings.push({
            serverName,
            message: "Server is already up to date",
          });
        } else {
          warnings.push({
            serverName,
            message: "Server not found in configuration",
          });
        }
      }
    }

    if (serversToUpgrade.length === 0) {
      logger.info("No servers need upgrading");
      return {
        successful: [],
        failed: [],
        warnings,
        summary: {
          total: warnings.length,
          successful: 0,
          failed: 0,
          warnings: warnings.length,
        },
      };
    }

    logger.info(`Found ${serversToUpgrade.length} servers that need upgrading`);

    const successful: ServerUpgradeInfo[] = [];
    const failed: { serverName: string; error: string }[] = [];

    // Upgrade each server individually
    for (const server of serversToUpgrade) {
      const serverDir = `${workingDir}/.mcpadre/servers/${server.serverName}`;

      try {
        // Get the server config to extract package/image information
        const serverConfig = config.mcpServers[server.serverName];
        if (!serverConfig) {
          throw new ConfigurationError(
            `Server ${server.serverName} not found in config`
          );
        }

        if (!server.latestVersion) {
          throw new ValidationError(
            `No latest version available for ${server.serverName}`
          );
        }

        let result;

        switch (server.serverType) {
          case "node": {
            if (!isNodeServer(serverConfig)) {
              throw new ServerError(
                `Server ${server.serverName} is not a Node.js server`,
                server.serverName
              );
            }

            const nodeOptions: NodeUpgradeOptions = {
              serverName: server.serverName,
              packageName: serverConfig.node.package,
              currentVersion: server.currentVersion,
              targetVersion: server.latestVersion,
              serverDir,
              skipAudit: options.skipAudit,
            };

            result = await upgradeNodeServer(nodeOptions, logger);
            break;
          }

          case "python": {
            if (!isPythonServer(serverConfig)) {
              throw new ServerError(
                `Server ${server.serverName} is not a Python server`,
                server.serverName
              );
            }

            const pythonOptions: PythonUpgradeOptions = {
              serverName: server.serverName,
              packageName: serverConfig.python.package,
              currentVersion: server.currentVersion,
              targetVersion: server.latestVersion,
              serverDir,
              skipAudit: options.skipAudit,
              ...(serverConfig.python.pythonVersion && {
                pythonVersion: serverConfig.python.pythonVersion,
              }),
            };

            result = await upgradePythonServer(pythonOptions, logger);
            break;
          }

          case "container": {
            if (!isContainerServer(serverConfig)) {
              throw new ServerError(
                `Server ${server.serverName} is not a container server`,
                server.serverName
              );
            }

            const dockerOptions: DockerUpgradeOptions = {
              serverName: server.serverName,
              image: serverConfig.container.image,
              currentTag: server.currentVersion,
              targetTag: server.latestVersion,
              serverDir,
              ...(server.digestInfo && {
                digestInfo: {
                  currentDigest: server.digestInfo.currentDigest,
                  latestDigest: server.digestInfo.latestDigest,
                  digestChanged: server.digestInfo.digestChanged,
                },
              }),
            };

            result = await upgradeDockerServer(dockerOptions, logger);
            break;
          }

          default:
            throw new ServerError(
              `Unsupported server type: ${server.serverType}`,
              server.serverName
            );
        }

        if (result.success && result.newVersion) {
          successful.push({
            serverName: server.serverName,
            serverType: server.serverType,
            oldVersion: result.oldVersion,
            newVersion: result.newVersion,
            ...(result.upgradeType && { upgradeType: result.upgradeType }),
            ...(result.digestInfo && { digestInfo: result.digestInfo }),
          });
        } else {
          failed.push({
            serverName: server.serverName,
            error: result.error ?? "Unknown upgrade error",
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          { serverName: server.serverName, error },
          `Failed to upgrade ${server.serverName}: ${message}`
        );

        failed.push({
          serverName: server.serverName,
          error: message,
        });
      }
    }

    // Update config file with successful upgrades
    if (successful.length > 0) {
      try {
        await updateConfigWithNewVersions(
          config,
          workingDir,
          successful,
          logger,
          mode
        );
      } catch (error) {
        logger.warn(`Failed to update config file: ${error}`);
        warnings.push({
          serverName: "config-update",
          message: "Failed to update config file with new versions",
        });
      }
    }

    return {
      successful,
      failed,
      warnings,
      summary: {
        total: serversToUpgrade.length + warnings.length,
        successful: successful.length,
        failed: failed.length,
        warnings: warnings.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Upgrade process failed: ${message}`);

    return {
      successful: [],
      failed: [
        {
          serverName: "upgrade-process",
          error: `Upgrade process failed: ${message}`,
        },
      ],
      warnings,
      summary: {
        total: 1 + warnings.length,
        successful: 0,
        failed: 1,
        warnings: warnings.length,
      },
    };
  }
}
