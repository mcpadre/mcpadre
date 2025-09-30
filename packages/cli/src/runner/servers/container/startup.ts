// pattern: Functional Core

import { promises as fs } from "node:fs";
import path from "node:path";

import Docker from "dockerode";
import { split } from "shlex";

import { ContainerLockManager } from "../../../installer/container-lock.js";
import { addToServerGitignore } from "../../../installer/gitignore-manager.js";
import { applyTemplate } from "../../../utils/string-templating/index.js";
import {
  createServerDirectory,
  getServerDirectoryPath,
} from "../../server-directory/index.js";
import { createSessionWithInterceptors } from "../../session/startup.js";
import {
  createServerSessionConfig,
  resolveServerSandboxConfig,
  setupServerEnvironment,
  type WorkspaceServerOptions,
} from "../common/startup-utils.js";
import { createTarget } from "../common/target.js";

import { ContainerMcpClient } from "./client.js";

import type { ContainerMcpServerV1 } from "../../../config/types/v1/server/index.js";
import type { DirectoryResolver } from "../../directory-resolver/index.js";
import type { RunServerOptions } from "../../index.js";
import type { ResolvedPath } from "../../types/index.js";

/**
 * Configuration specific to container server startup
 */
interface ContainerStartupConfig extends RunServerOptions {
  serverConfig: ContainerMcpServerV1;
}

/**
 * Resolves container volumes and creates necessary directories
 */
async function resolveContainerVolumes(
  containerServer: ContainerMcpServerV1,
  serverName: string,
  directoryResolver: DirectoryResolver,
  logger: typeof import("../../../cli/_deps.js").CLI_LOGGER,
  context: import("../../../config/types/index.js").WorkspaceContext
): Promise<{
  resolvedVolumes: Record<
    string,
    { hostPath: string; containerPath: string; readOnly?: boolean }
  >;
  volumePatternsToGitignore: string[];
  logsDir: string;
}> {
  const resolvedVolumes: Record<
    string,
    { hostPath: string; containerPath: string; readOnly?: boolean }
  > = {};
  const volumePatternsToGitignore: string[] = [];

  // Create server directory (for volumes and logs)
  const logsDir = await createServerDirectory(context, serverName);

  if (containerServer.container.volumes) {
    const templateVars = {
      dirs: directoryResolver,
      parentEnv: process.env,
    };

    for (const [volumeKey, volume] of Object.entries(
      containerServer.container.volumes
    )) {
      let hostPath: string;

      if (volume.hostMountPath) {
        // Use provided path with template resolution
        hostPath = applyTemplate(volume.hostMountPath, templateVars) as string;
        // Resolve relative paths against workspace
        if (!path.isAbsolute(hostPath)) {
          hostPath = path.resolve(directoryResolver.workspace, hostPath);
        }
      } else {
        // Default to vol-{volumeKey} in logs directory
        hostPath = path.join(logsDir, `vol-${volumeKey}`);
      }

      // Ensure host directory exists
      await fs.mkdir(hostPath, { recursive: true });
      logger.debug(
        {
          volumeKey,
          hostPath,
          containerPath: volume.containerMountPath,
        },
        "Created volume directory"
      );

      resolvedVolumes[volumeKey] = {
        hostPath,
        containerPath: volume.containerMountPath,
        ...(volume.readOnly !== undefined && {
          readOnly: volume.readOnly,
        }),
      };

      // Add to gitignore if needed (default volume paths only, unless skipGitignore is true)
      if (!volume.hostMountPath && !volume.skipGitignore) {
        volumePatternsToGitignore.push(`vol-${volumeKey}`);
      }
    }

    // Update server .gitignore for volume directories
    if (volumePatternsToGitignore.length > 0) {
      try {
        await addToServerGitignore(logsDir, volumePatternsToGitignore);
        logger.debug(
          { patterns: volumePatternsToGitignore },
          "Updated server .gitignore for volumes"
        );
      } catch (error) {
        logger.warn({ error }, "Failed to update server .gitignore");
      }
    }
  }

  return { resolvedVolumes, volumePatternsToGitignore, logsDir };
}

/**
 * Verifies that the container lock file exists and matches configuration
 */
async function verifyContainerLock(
  containerServer: ContainerMcpServerV1,
  serverName: string,
  serverDirPath: string,
  logger: typeof import("../../../cli/_deps.js").CLI_LOGGER
): Promise<void> {
  const lockManager = new ContainerLockManager(serverDirPath, new Docker());

  const existingLock = await lockManager.readLock();
  if (!existingLock) {
    logger.error(
      `No container lock file found for ${serverName}. Run 'mcpadre install' first to pull and lock the container image.`
    );
    process.exit(1);
  }

  // Verify lock matches current configuration
  if (existingLock.tag !== containerServer.container.tag) {
    logger.error(
      `Container tag mismatch for ${serverName}. Lock has ${existingLock.tag}, config specifies ${containerServer.container.tag}. Run 'mcpadre install' to update.`
    );
    process.exit(1);
  }
}

/**
 * Starts a container MCP server with all necessary setup and configuration
 */
export async function startContainerServer(
  options: ContainerStartupConfig
): Promise<void> {
  const { serverName, serverConfig, context, logger } = options;
  const containerServer = serverConfig;
  const projectConfig = context.mergedConfig;

  // Set up common server environment
  const { directoryResolver, envStringMap } = await setupServerEnvironment({
    context,
    envConfig: containerServer.env ?? {},
    logger,
  });

  // Create child logger for server-specific logging
  const serverLogger = logger.child({ serverName });

  // Parse command if provided
  let commandParts: string[] | undefined = undefined;
  if (containerServer.container.command) {
    // Resolve command template
    const templateVars = {
      dirs: directoryResolver,
      parentEnv: process.env,
    };

    const resolvedCommand = applyTemplate(
      containerServer.container.command,
      templateVars
    );
    logger.debug({ command: resolvedCommand }, "Resolved container command");

    // Parse command into parts using shell lexing
    commandParts = split(resolvedCommand as string);
  }

  logger.info(
    {
      image: containerServer.container.image,
      tag: containerServer.container.tag,
      command: commandParts,
      pullWhenDigestChanges: containerServer.container.pullWhenDigestChanges,
    },
    "Container server configuration"
  );

  // Extract workspace options for sandbox configuration (currently unused for containers but kept for consistency)
  const workspaceOptions: WorkspaceServerOptions | undefined =
    projectConfig.options
      ? {
          ...(projectConfig.options.disableAllSandboxes !== undefined && {
            disableAllSandboxes: projectConfig.options.disableAllSandboxes,
          }),
          ...(projectConfig.options.extraAllowRead !== undefined && {
            extraAllowRead: projectConfig.options.extraAllowRead,
          }),
          ...(projectConfig.options.extraAllowWrite !== undefined && {
            extraAllowWrite: projectConfig.options.extraAllowWrite,
          }),
        }
      : undefined;

  // Resolve sandbox configuration using shared utility
  const sandboxConfig = resolveServerSandboxConfig({
    sandboxConfig: containerServer.sandbox ?? {},
    directoryResolver,
    ...(workspaceOptions && { workspaceOptions }),
    context,
    logger,
  });

  // Log full sandbox paths at debug level for detailed troubleshooting
  logger.debug(
    {
      allowRead: sandboxConfig.allowRead,
      allowReadWrite: sandboxConfig.allowReadWrite,
    },
    "Complete sandbox paths for container server (not directly used by containers)"
  );

  // Resolve container volumes and setup directories
  const { resolvedVolumes } = await resolveContainerVolumes(
    containerServer,
    serverName,
    directoryResolver,
    logger,
    context
  );

  // Get server directory path for lock file verification
  const serverDirPath = getServerDirectoryPath(context, serverName);

  // Verify container lock file before starting
  await verifyContainerLock(containerServer, serverName, serverDirPath, logger);

  // Create container client and pipeline target
  const containerClient = new ContainerMcpClient({
    image: containerServer.container.image,
    tag: containerServer.container.tag,
    ...(commandParts && { command: commandParts }),
    env: envStringMap,
    ...(Object.keys(resolvedVolumes).length > 0 && {
      volumes: resolvedVolumes,
    }),
    cwd: directoryResolver.workspace as ResolvedPath,
    sandboxConfig,
    logger: serverLogger, // Use dedicated server logger for debugging
    serverName,
  });
  const target = createTarget(containerClient);

  const connectionInfo = `container server ${serverName} (${containerServer.container.image}:${containerServer.container.tag})`;

  logger.debug(
    {
      volumeCount: Object.keys(resolvedVolumes).length,
      volumes: resolvedVolumes,
    },
    "Container volumes configured"
  );

  // Set up session using shared utility
  const sessionConfig = createServerSessionConfig({
    target,
    client: containerClient,
    logger: serverLogger,
  });

  // Create and start session with interceptors
  const sessionManager = await createSessionWithInterceptors({
    sessionConfig,
    serverConfig,
    projectConfig,
    serverName,
    directoryResolver,
    logger,
    context,
  });

  logger.info(`Connected to ${connectionInfo}`);

  // Start the session and handle graceful shutdown
  await sessionManager.start();
}
