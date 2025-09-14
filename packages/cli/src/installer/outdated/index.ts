// pattern: Functional Core
// Main orchestrator for outdated package detection

import path from "path";

import { loadAndValidateSettingsProject } from "../../config/loaders/settings-project.js";
import {
  findUserConfig,
  loadSettingsUserFromFile,
  validateSettingsUserObject,
} from "../../config/loaders/settings-user-loader.js";
import {
  type ContainerMcpServerV1,
  isContainerServer,
  isHttpServer,
  isNodeServer,
  isPythonServer,
  isShellServer,
  type McpServerV1,
  type NodeMcpServerV1,
  type PythonMcpServerV1,
} from "../../config/types/v1/server/index.js";
import { getServerDirectoryPath } from "../../runner/server-directory/index.js";
import { ConfigurationError } from "../../utils/errors.js";

import { checkDockerOutdated } from "./docker-detector.js";
import { auditNpmPackage, checkNpmOutdated } from "./npm-detector.js";
import { auditPythonPackage, checkPypiOutdated } from "./pypi-detector.js";

import type { SettingsBase } from "../../config/types/index.js";
import type {
  OutdatedCheckOptions,
  OutdatedCheckResult,
  OutdatedServerInfo,
} from "./types.js";
import type Docker from "dockerode";
import type { Logger } from "pino";

/**
 * Main function to check all installed MCP servers for updates
 */
export async function checkAllOutdated(
  workingDir: string,
  docker: Docker,
  logger: Logger,
  options: OutdatedCheckOptions = {},
  mode: "project" | "user" = "project"
): Promise<OutdatedCheckResult> {
  const startTime = Date.now();

  try {
    // Load appropriate configuration based on mode
    let settings: SettingsBase;
    if (mode === "user") {
      const userConfigPath = await findUserConfig(workingDir);
      if (!userConfigPath) {
        throw new Error("No user configuration found");
      }
      const data = await loadSettingsUserFromFile(userConfigPath);
      if (!validateSettingsUserObject(data)) {
        throw new ConfigurationError("Invalid user configuration file");
      }
      settings = data;
    } else {
      const configPath = path.join(workingDir, "mcpadre.yaml");
      settings = await loadAndValidateSettingsProject(configPath);
    }

    if (Object.keys(settings.mcpServers).length === 0) {
      return {
        servers: [],
        summary: {
          total: 0,
          outdated: 0,
          withVulnerabilities: 0,
          errors: 0,
        },
        checkedAt: new Date().toISOString(),
      };
    }

    const serverEntries = Object.entries(settings.mcpServers);
    const filteredServers = serverEntries.filter(([serverName, server]) => {
      // Apply server name filter
      if (
        options.serverNames?.length &&
        !options.serverNames.includes(serverName)
      ) {
        return false;
      }

      // Apply server type filter
      if (options.serverTypes?.length) {
        const serverType = getServerType(server);
        if (!options.serverTypes.includes(serverType)) {
          return false;
        }
      }

      return true;
    });

    logger.debug(`Checking ${filteredServers.length} servers for updates`);

    // Check each server in parallel for better performance
    const serverChecks = filteredServers.map(([serverName, server]) =>
      checkSingleServer(
        serverName,
        server,
        workingDir,
        docker,
        logger,
        options,
        mode === "user" // Pass isUserMode
      )
    );

    const servers = await Promise.all(serverChecks);

    // Calculate summary statistics
    const summary = {
      total: servers.length,
      outdated: servers.filter(s => s.isOutdated).length,
      withVulnerabilities: servers.filter(s => s.auditInfo?.hasVulnerabilities)
        .length,
      errors: servers.filter(s => s.error).length,
    };

    const endTime = Date.now();
    logger.debug(`Outdated check completed in ${endTime - startTime}ms`);

    return {
      servers,
      summary,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to check for outdated packages: ${message}`);

    return {
      servers: [],
      summary: {
        total: 0,
        outdated: 0,
        withVulnerabilities: 0,
        errors: 1,
      },
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Check a single server for updates
 */
async function checkSingleServer(
  serverName: string,
  server: McpServerV1,
  workingDir: string,
  docker: Docker,
  logger: Logger,
  options: OutdatedCheckOptions,
  isUserMode = false
): Promise<OutdatedServerInfo> {
  const serverType = getServerType(server);

  // Create a temporary WorkspaceContext for compatibility
  const emptyConfig = {
    mcpServers: {},
    hosts: {},
    options: {},
    version: 1,
  } as const;

  const tempContext: import("../../config/types/index.js").WorkspaceContext =
    isUserMode
      ? {
          workspaceType: "user",
          workspaceDir: workingDir,
          userConfigPath: `${workingDir}/mcpadre.yaml`,
          mergedConfig: emptyConfig,
          userConfig: emptyConfig,
        }
      : {
          workspaceType: "project",
          workspaceDir: workingDir,
          projectConfigPath: `${workingDir}/mcpadre.yaml`,
          mergedConfig: emptyConfig,
          projectConfig: emptyConfig,
          userConfig: emptyConfig,
        };

  const serverDir = getServerDirectoryPath(tempContext, serverName);

  logger.debug(`Checking ${serverName} (${serverType}) for updates`);

  try {
    if (isNodeServer(server)) {
      return await checkNodeServer(
        serverName,
        server,
        serverDir,
        logger,
        options
      );
    } else if (isPythonServer(server)) {
      return await checkPythonServer(
        serverName,
        server,
        serverDir,
        logger,
        options
      );
    } else if (isContainerServer(server)) {
      return await checkContainerServer(
        serverName,
        server,
        serverDir,
        docker,
        logger
      );
    } else if (isHttpServer(server)) {
      return {
        serverName,
        serverType: "http",
        currentVersion: server.http.url,
        latestVersion: server.http.url,
        isOutdated: false,
      };
    } else if (isShellServer(server)) {
      return {
        serverName,
        serverType: "shell",
        currentVersion: server.shell.command,
        latestVersion: server.shell.command,
        isOutdated: false,
      };
    } else {
      return {
        serverName,
        serverType: "shell",
        currentVersion: "unknown",
        latestVersion: null,
        isOutdated: false,
        error: "Unknown server type",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug(`Failed to check ${serverName}: ${message}`);

    return {
      serverName,
      serverType,
      currentVersion: "unknown",
      latestVersion: null,
      isOutdated: false,
      error: message,
    };
  }
}

/**
 * Check Node.js server for updates
 */
async function checkNodeServer(
  serverName: string,
  server: NodeMcpServerV1,
  serverDir: string,
  logger: Logger,
  options: OutdatedCheckOptions
): Promise<OutdatedServerInfo> {
  const packageName = server.node.package;
  const currentVersion = server.node.version;

  // Check for version updates
  const versionCheck = await checkNpmOutdated(
    packageName,
    currentVersion,
    logger
  );

  let auditInfo;
  if (options.includeAudit) {
    try {
      auditInfo = await auditNpmPackage(serverDir, logger);
    } catch (error) {
      logger.debug(`Audit failed for ${serverName}: ${error}`);
    }
  }

  const result: OutdatedServerInfo = {
    serverName,
    serverType: "node",
    currentVersion,
    latestVersion: versionCheck.latestVersion,
    isOutdated: versionCheck.isOutdated,
    ...(versionCheck.upgradeType && { upgradeType: versionCheck.upgradeType }),
    ...(auditInfo && { auditInfo }),
    ...(versionCheck.error && { error: versionCheck.error }),
  };

  return result;
}

/**
 * Check Python server for updates
 */
async function checkPythonServer(
  serverName: string,
  server: PythonMcpServerV1,
  serverDir: string,
  logger: Logger,
  options: OutdatedCheckOptions
): Promise<OutdatedServerInfo> {
  const packageName = server.python.package;
  const currentVersion = server.python.version;

  // Check for version updates
  const versionCheck = await checkPypiOutdated(
    packageName,
    currentVersion,
    logger
  );

  let auditInfo;
  if (options.includeAudit) {
    try {
      auditInfo = await auditPythonPackage(serverDir, logger);
    } catch (error) {
      logger.debug(`Audit failed for ${serverName}: ${error}`);
    }
  }

  const result: OutdatedServerInfo = {
    serverName,
    serverType: "python",
    currentVersion,
    latestVersion: versionCheck.latestVersion,
    isOutdated: versionCheck.isOutdated,
    ...(versionCheck.upgradeType && { upgradeType: versionCheck.upgradeType }),
    ...(auditInfo && { auditInfo }),
    ...(versionCheck.error && { error: versionCheck.error }),
  };

  return result;
}

/**
 * Check container server for updates (digest changes)
 */
async function checkContainerServer(
  serverName: string,
  server: ContainerMcpServerV1,
  serverDir: string,
  docker: Docker,
  logger: Logger
): Promise<OutdatedServerInfo> {
  const image = server.container.image;
  const tag = server.container.tag;

  // Check for digest changes
  const digestCheck = await checkDockerOutdated(
    image,
    tag,
    serverDir,
    docker,
    logger
  );

  const result: OutdatedServerInfo = {
    serverName,
    serverType: "container",
    currentVersion: tag,
    latestVersion: digestCheck.latestVersion,
    isOutdated: digestCheck.isOutdated,
    ...(digestCheck.digestInfo && { digestInfo: digestCheck.digestInfo }),
    ...(digestCheck.error && { error: digestCheck.error }),
  };

  return result;
}

/**
 * Determine server type from server configuration
 */
function getServerType(
  server: McpServerV1
): "node" | "python" | "container" | "shell" | "http" {
  if (isNodeServer(server)) return "node";
  if (isPythonServer(server)) return "python";
  if (isContainerServer(server)) return "container";
  if (isHttpServer(server)) return "http";
  if (isShellServer(server)) return "shell";
  return "shell"; // Default fallback
}

// Export individual detector functions for testing
export { checkDockerOutdated } from "./docker-detector.js";
export { auditNpmPackage, checkNpmOutdated } from "./npm-detector.js";
export { auditPythonPackage, checkPypiOutdated } from "./pypi-detector.js";
export type * from "./types.js";
