// pattern: Imperative Shell

import { CLI_LOGGER } from "../cli/_deps.js";
import { getServerPath } from "../config/types/workspace.js";
import { HostError } from "../utils/errors.js";

import { readConfigFile, writeConfigFile } from "./config/config-io.js";
import { HOST_CONFIGS } from "./config/host-configs.js";
import {
  analyzeServerDirectories,
  type ServerClassification,
  type ServerDirectoryAnalysis,
} from "./discovery/server-detector.js";
import { ContainerManager } from "./managers/container-manager.js";
import { NodeManager } from "./managers/node-manager.js";
import { PythonManager } from "./managers/python-manager.js";
import {
  addToGitignore,
  getGitignorePatternsForHosts,
  getMcpadreGitignorePatterns,
  shouldManageGitignore,
} from "./gitignore-manager.js";

import type { SettingsBase, WorkspaceContext } from "../config/types/index.js";
import type { SupportedHostV1 } from "../config/types/v1/hosts.js";
import type {
  ContainerMcpServerV1,
  NodeMcpServerV1,
  NodeOptionsV1,
  PythonMcpServerV1,
} from "../config/types/v1/server/index.js";
import type { Logger } from "pino";

/**
 * Options for the install operation
 */
export interface InstallOptions {
  /** Target host to install configuration for */
  host: SupportedHostV1;
  /** Workspace context containing configuration and directory paths */
  context: WorkspaceContext;
  /** Override project skipGitignoreOnInstall setting (force skip gitignore management) */
  skipGitignore?: boolean;
  /** Logger for container operations */
  logger?: Logger;
  /** Force upgrades even when package versions change (overrides installImplicitlyUpgradesChangedPackages setting) */
  force?: boolean;
}

/**
 * Result of the install operation
 */
export interface InstallResult {
  /** Path to the host configuration file that was created/updated */
  configPath: string;
  /** Whether the configuration file was newly created (vs updated) */
  wasCreated: boolean;
  /** Whether gitignore was updated */
  gitignoreUpdated: boolean;
  /** Number of servers installed for the host */
  serverCount: number;
  /** Number of container images that were pulled */
  containerImagesPulled: number;
  /** Analysis of servers found in the host configuration */
  analysis: ServerClassification;
  /** Analysis of server directories on disk */
  directoryAnalysis: ServerDirectoryAnalysis;
}

/**
 * Options for bulk installation operation
 */
export interface BulkInstallOptions {
  /** Workspace context containing configuration and directory paths */
  context: WorkspaceContext;
  /** Override project skipGitignoreOnInstall setting (force skip gitignore management) */
  skipGitignore?: boolean;
  /** Logger for container operations */
  logger?: Logger;
  /** Force upgrades even when package versions change (overrides installImplicitlyUpgradesChangedPackages setting) */
  force?: boolean;
}

/**
 * Result of the bulk install operation
 */
export interface BulkInstallResult {
  /** Results for each installed host */
  results: Record<SupportedHostV1, InstallResult>;
  /** List of hosts that were enabled for installation */
  enabledHosts: SupportedHostV1[];
  /** Total number of servers configured across all hosts */
  totalServers: number;
  /** Number of configuration files created */
  filesCreated: number;
  /** Number of configuration files updated */
  filesUpdated: number;
}

/**
 * Check if a server configuration is a container server
 */
function isContainerServer(server: unknown): server is ContainerMcpServerV1 {
  return Boolean(server && typeof server === "object" && "container" in server);
}

/**
 * Check if a server configuration is a Python server
 */
function isPythonServer(server: unknown): server is PythonMcpServerV1 {
  return Boolean(server && typeof server === "object" && "python" in server);
}

/**
 * Check if a server configuration is a Node.js server
 */
function isNodeServer(server: unknown): server is NodeMcpServerV1 {
  return Boolean(server && typeof server === "object" && "node" in server);
}

/**
 * Installs mcpadre server configuration for a specific host
 *
 * This orchestrates the complete installation process:
 * 1. Pull container images for any container servers (respects TOFU model)
 * 2. Read existing host configuration (if any)
 * 3. Update host configuration with mcpadre servers
 * 4. Write updated configuration to disk
 * 5. Update .gitignore if appropriate
 *
 * @param options Installation options (including pre-loaded config and projectDir)
 * @returns Installation result
 */
export async function installForHost(
  options: InstallOptions
): Promise<InstallResult> {
  const {
    host,
    context,
    skipGitignore = false,
    logger,
    force = false,
  } = options;

  const config = context.mergedConfig;
  const projectDir = context.workspaceDir;

  // Install container images for any container servers
  let containerImagesPulled = 0;
  if (logger) {
    const containerManager = new ContainerManager(logger);

    for (const [serverName, serverConfig] of Object.entries(
      config.mcpServers
    )) {
      if (isContainerServer(serverConfig)) {
        try {
          const installResult = await containerManager.installContainer({
            serverName,
            container: serverConfig.container,
            context,
            logger,
          });

          if (installResult.imagePulled) {
            containerImagesPulled++;
          }

          logger.debug(
            { serverName, message: installResult.message },
            "Container install result"
          );
        } catch (error: unknown) {
          logger.error(
            { error, serverName },
            `Failed to install container for server ${serverName}`
          );
          throw error;
        }
      }
    }
  }

  // Install Python environments for any Python servers
  if (logger) {
    const pythonManager = new PythonManager();

    for (const [serverName, serverConfig] of Object.entries(
      config.mcpServers
    )) {
      if (isPythonServer(serverConfig)) {
        try {
          const serverDir = getServerPath(context, serverName);
          const installResult = await pythonManager.installPython({
            serverName,
            python: serverConfig.python,
            context,
            serverDir,
            logger,
            force,
            installImplicitlyUpgradesChangedPackages:
              serverConfig.installImplicitlyUpgradesChangedPackages ??
              config.options?.installImplicitlyUpgradesChangedPackages ??
              false,
          });

          if (
            installResult.environmentSynced &&
            !installResult.dependenciesInstalled &&
            !installResult.upgradeOccurred
          ) {
            // Log sync result at info level so tests can see it
            logger.info(installResult.message);
          } else if (
            !installResult.dependenciesInstalled &&
            !installResult.environmentSynced &&
            !installResult.upgradeOccurred &&
            installResult.message.includes(
              "Version changes detected but upgrade not permitted"
            )
          ) {
            // Log SKIP result as warning so it appears in stderr for tests
            const formattedMessage = `Package/Python version changed but installImplicitlyUpgradesChangedPackages=false. ${installResult.message}. Use --force to override or set installImplicitlyUpgradesChangedPackages=true in config`;
            logger.warn(formattedMessage);
          } else {
            logger.debug(
              { serverName, message: installResult.message },
              "Python install result"
            );
          }
        } catch (error: unknown) {
          logger.error(
            { error, serverName },
            `Failed to install Python server ${serverName}`
          );
          throw error;
        }
      }
    }
  }

  // Install Node.js environments for any Node.js servers
  if (logger) {
    const nodeManager = new NodeManager();

    for (const [serverName, serverConfig] of Object.entries(
      config.mcpServers
    )) {
      if (isNodeServer(serverConfig) && "node" in serverConfig) {
        try {
          const serverDir = getServerPath(context, serverName);
          const nodeServerConfig = serverConfig as NodeMcpServerV1 & {
            node: NodeOptionsV1;
            installImplicitlyUpgradesChangedPackages?: boolean;
          };
          const installResult = await nodeManager.installNode({
            serverName,
            node: nodeServerConfig.node,
            context,
            serverDir,
            logger,
            force,
            installImplicitlyUpgradesChangedPackages:
              nodeServerConfig.installImplicitlyUpgradesChangedPackages ??
              config.options?.installImplicitlyUpgradesChangedPackages ??
              false,
          });

          if (
            installResult.environmentSynced &&
            !installResult.dependenciesInstalled &&
            !installResult.upgradeOccurred
          ) {
            // Log sync result at info level so tests can see it
            logger.info(installResult.message);
          } else if (
            !installResult.dependenciesInstalled &&
            !installResult.environmentSynced &&
            !installResult.upgradeOccurred &&
            installResult.message.includes(
              "Version changes detected but upgrade not permitted"
            )
          ) {
            // Log SKIP result as warning so it appears in stderr for tests
            const formattedMessage = `Package/Node version changed but installImplicitlyUpgradesChangedPackages=false. ${installResult.message}. Use --force to override or set installImplicitlyUpgradesChangedPackages=true in config`;
            logger.warn(formattedMessage);
          } else {
            logger.debug(
              { serverName, message: installResult.message },
              "Node install result"
            );
          }
        } catch (error: unknown) {
          logger.error(
            { error, serverName },
            `Failed to install Node.js server ${serverName}`
          );
          throw error;
        }
      }
    }
  }

  // Get host configuration details
  const hostConfig = HOST_CONFIGS[host];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!hostConfig) {
    throw new HostError(`Unsupported host: ${host}`, host);
  }
  const configPath = hostConfig.projectConfigPath;

  // Read existing host configuration
  const existingContent = await readConfigFile(projectDir, configPath);
  const wasCreated = existingContent === "";

  // Update configuration with analysis to detect external/orphaned servers
  const configUpdateResult = hostConfig.projectMcpConfigUpdaterWithAnalysis(
    existingContent,
    config.mcpServers
  );

  const serverCount = Object.keys(config.mcpServers).length;

  // Analyze server directories on disk
  const directoryAnalysis = await analyzeServerDirectories(
    context,
    new Set(Object.keys(config.mcpServers))
  );

  // Log external servers (INFO level)
  if (configUpdateResult.analysis.external.length > 0 && logger) {
    const externalServers = configUpdateResult.analysis.external.join(", ");
    const hostConfigName = configPath;
    logger.info(
      `Found ${configUpdateResult.analysis.external.length} non-mcpadre server(s) in ${hostConfigName}: ${externalServers}`
    );
    logger.info(
      "Consider adding these to your mcpadre.yaml to manage them centrally"
    );
  }

  // Log orphaned servers (WARN level)
  if (configUpdateResult.analysis.mcpadreOrphaned.length > 0 && logger) {
    for (const orphanedServer of configUpdateResult.analysis.mcpadreOrphaned) {
      const hostConfigName = configPath;
      logger.warn(
        `Removing orphaned mcpadre server '${orphanedServer}' from ${hostConfigName} (no longer in mcpadre.yaml)`
      );
      logger.warn(
        `Server directory ${getServerPath(context, orphanedServer)} was preserved - delete manually if no longer needed`
      );
    }
  }

  // Log orphaned directories (WARN level)
  if (directoryAnalysis.orphanedDirectories.length > 0 && logger) {
    for (const orphanedDir of directoryAnalysis.orphanedDirectories) {
      logger.warn(
        `Found orphaned server directory: ${getServerPath(context, orphanedDir)} (no longer in mcpadre.yaml)`
      );
      logger.warn(
        `Delete manually if no longer needed: rm -rf ${getServerPath(context, orphanedDir)}`
      );
    }
  }

  // Write updated configuration
  await writeConfigFile(
    projectDir,
    configPath,
    configUpdateResult.updatedConfig
  );

  // Handle gitignore management
  let gitignoreUpdated = false;

  // Check if we should manage gitignore (respecting both project config and CLI override)
  const shouldManage = !skipGitignore && shouldManageGitignore(config);

  if (shouldManage) {
    // Get host-specific patterns and mcpadre server patterns
    const hostPatterns = getGitignorePatternsForHosts([host]);
    const mcpadrePatterns = getMcpadreGitignorePatterns();
    const allPatterns = [...hostPatterns, ...mcpadrePatterns];

    if (allPatterns.length > 0) {
      gitignoreUpdated = await addToGitignore(projectDir, allPatterns);
    }
  }

  return {
    configPath: `${projectDir}/${configPath}`,
    wasCreated,
    gitignoreUpdated,
    serverCount,
    containerImagesPulled,
    analysis: configUpdateResult.analysis,
    directoryAnalysis,
  };
}

/**
 * Gets list of enabled hosts from project configuration
 *
 * @param config Project configuration
 * @returns Array of enabled hosts
 */
function getEnabledHosts(config: SettingsBase): SupportedHostV1[] {
  if (!config.hosts) {
    return [];
  }

  const enabledHosts: SupportedHostV1[] = [];

  // Only include hosts that are explicitly set to true
  for (const [hostName, enabled] of Object.entries(config.hosts)) {
    if (enabled === true) {
      enabledHosts.push(hostName as SupportedHostV1);
    }
  }

  return enabledHosts;
}

/**
 * Installs mcpadre server configuration for all enabled hosts
 *
 * This orchestrates the complete bulk installation process:
 * 1. Determine which hosts are enabled (hosts[hostName]: true)
 * 2. Install configuration for each enabled host
 * 3. Aggregate results and provide comprehensive summary
 *
 * @param options Bulk installation options (including pre-loaded config and projectDir)
 * @returns Bulk installation result with aggregated information
 */
export async function installForAllEnabledHosts(
  options: BulkInstallOptions
): Promise<BulkInstallResult> {
  const { context, skipGitignore = false, logger, force = false } = options;

  const config = context.mergedConfig;
  const projectDir = context.workspaceDir;

  // Get enabled hosts from configuration
  const enabledHosts = getEnabledHosts(config);

  // Initialize result aggregation
  const results: Record<string, InstallResult> = {};
  let totalServers = 0;
  let filesCreated = 0;
  let filesUpdated = 0;

  // Install for each enabled host (skip gitignore in individual installs)
  for (const host of enabledHosts) {
    const installOptions: InstallOptions = {
      host,
      context,
      skipGitignore: true, // We'll handle gitignore once at the end
      force,
      ...(logger && { logger }),
    };

    const result = await installForHost(installOptions);

    results[host] = result;
    totalServers += result.serverCount;

    if (result.wasCreated) {
      filesCreated++;
    } else {
      filesUpdated++;
    }
  }

  // Handle gitignore management for all enabled hosts at once
  let anyGitignoreUpdated = false;
  if (!skipGitignore && shouldManageGitignore(config)) {
    const hostPatterns = getGitignorePatternsForHosts(enabledHosts);
    const mcpadrePatterns = getMcpadreGitignorePatterns();
    const allPatterns = [...hostPatterns, ...mcpadrePatterns];

    if (allPatterns.length > 0) {
      anyGitignoreUpdated = await addToGitignore(projectDir, allPatterns);
    }
  }

  // Update all results with the gitignore status
  for (const host of enabledHosts) {
    if (results[host]) {
      results[host].gitignoreUpdated = anyGitignoreUpdated;
    }
  }

  // After host configurations are complete, handle container image pulling
  let containerImagesPulled = 0;
  const containerServers = Object.entries(config.mcpServers).filter(
    (entry): entry is [string, ContainerMcpServerV1] => "container" in entry[1]
  );

  if (containerServers.length > 0) {
    const containerManager = new ContainerManager(logger ?? CLI_LOGGER);

    for (const [serverName, serverConfig] of containerServers) {
      try {
        const installResult = await containerManager.installContainer({
          serverName,
          container: serverConfig.container,
          context,
          logger: logger ?? CLI_LOGGER,
        });

        if (installResult.imagePulled) {
          containerImagesPulled++;
        }

        (logger ?? CLI_LOGGER).debug(
          { serverName, message: installResult.message },
          "Container installation result"
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        (logger ?? CLI_LOGGER).error(
          { serverName, error: message },
          "Failed to install container"
        );
        throw error;
      }
    }
  }

  // Update results with container image counts
  for (const host of enabledHosts) {
    if (results[host]) {
      results[host].containerImagesPulled = containerImagesPulled;
    }
  }

  return {
    results: results as Record<SupportedHostV1, InstallResult>,
    enabledHosts,
    totalServers,
    filesCreated,
    filesUpdated,
  };
}
