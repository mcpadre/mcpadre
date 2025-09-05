// pattern: Functional Core

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { createServerLogger } from "../../../logger/server-logger.js";
import { getServerDirectoryPath } from "../../server-directory/index.js";
import { createSessionWithInterceptors } from "../../session/startup.js";
import {
  createServerSessionConfig,
  resolveServerSandboxConfig,
  setupServerEnvironment,
  type WorkspaceServerOptions,
} from "../common/startup-utils.js";
import { createTarget } from "../common/target.js";

import { NodeMcpClient } from "./client.js";

import type { NodeMcpServerV1 } from "../../../config/types/v1/server/index.js";
import type { RunServerOptions } from "../../index.js";
import type { ResolvedPath } from "../../types/index.js";

/**
 * Configuration specific to Node.js server startup
 */
interface NodeStartupConfig extends Omit<RunServerOptions, "serverConfig"> {
  serverConfig: NodeMcpServerV1;
}

/**
 * Performs preflight checks to ensure Node.js and pnpm executables are available and working
 * Should be run from the server directory where .node-version exists
 */
async function performPreflightChecks(
  serverDir: string,
  logger: typeof import("../../../cli/_deps.js").CLI_LOGGER
): Promise<string[]> {
  const executablePaths: string[] = [];

  // Log the directory we're checking from
  logger.debug(
    `Performing Node.js preflight checks from directory: ${serverDir}`
  );

  // Find and verify node executable from the server directory
  let nodePath: string;
  try {
    // Run which from the server directory to respect .node-version
    nodePath = execSync("which node", {
      cwd: serverDir,
      encoding: "utf-8",
    }).trim();
    logger.debug(`Found node executable at: ${nodePath}`);
    executablePaths.push(nodePath);
  } catch {
    const errorMessage = `node executable not found in PATH from server directory ${serverDir}. Run 'mcpadre install' first.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  try {
    execSync("node --version", { stdio: "pipe", cwd: serverDir });
    logger.debug("node --version check passed");
  } catch {
    const errorMessage =
      "node --version failed. Node.js installation may be corrupted.";
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  // Find and verify npm executable from the server directory
  let npmPath: string;
  try {
    npmPath = execSync("which npm", {
      cwd: serverDir,
      encoding: "utf-8",
    }).trim();
    logger.debug(`Found npm executable at: ${npmPath}`);
    executablePaths.push(npmPath);
  } catch {
    const errorMessage = `npm executable not found in PATH from server directory ${serverDir}. Run 'mcpadre install' first.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  try {
    execSync("npm --version", { stdio: "pipe", cwd: serverDir });
    logger.debug("npm --version check passed");
  } catch {
    const errorMessage =
      "npm --version failed. npm installation may be corrupted.";
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  // Find and verify pnpm executable from the server directory
  let pnpmPath: string;
  try {
    // Run which from the server directory
    pnpmPath = execSync("which pnpm", {
      cwd: serverDir,
      encoding: "utf-8",
    }).trim();
    logger.debug(`Found pnpm executable at: ${pnpmPath}`);
    executablePaths.push(pnpmPath);
  } catch {
    const errorMessage = `pnpm executable not found in PATH from server directory ${serverDir}. Run 'mcpadre install' first.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  try {
    execSync("pnpm --version", { stdio: "pipe", cwd: serverDir });
    logger.debug("pnpm --version check passed");
  } catch {
    const errorMessage =
      "pnpm --version failed. pnpm installation may be corrupted.";
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  // Find and verify npx executable from the server directory (may be needed for fallback scenarios)
  try {
    const npxPath = execSync("which npx", {
      cwd: serverDir,
      encoding: "utf-8",
    }).trim();
    logger.debug(`Found npx executable at: ${npxPath}`);
    executablePaths.push(npxPath);
  } catch {
    // npx is often bundled with npm, so this isn't critical
    logger.debug("npx executable not found, but this may not be required");
  }

  return executablePaths;
}

/**
 * Resolves Node.js-specific paths for version managers and Homebrew that should be readable in sandbox
 */
function resolveNodeSpecificPaths(): string[] {
  const paths: string[] = [];

  // MISE data directory
  const miseDataDir = process.env["MISE_DATA_DIR"];
  if (miseDataDir) {
    if (existsSync(miseDataDir)) {
      paths.push(miseDataDir);
    }
  } else {
    // Default to XDG_DATA_HOME/mise or HOME/.local/share/mise
    const xdgDataHome = process.env["XDG_DATA_HOME"];
    const homeDir = process.env["HOME"];

    if (xdgDataHome && homeDir) {
      const misePath = join(xdgDataHome, "mise");
      if (existsSync(misePath)) {
        paths.push(misePath);
      }
    } else if (homeDir) {
      const misePath = join(homeDir, ".local", "share", "mise");
      if (existsSync(misePath)) {
        paths.push(misePath);
      } else {
        // Fallback to ~/.mise
        const fallbackMisePath = join(homeDir, ".mise");
        if (existsSync(fallbackMisePath)) {
          paths.push(fallbackMisePath);
        }
      }
    }
  }

  // Homebrew directory
  if (existsSync("/opt/homebrew")) {
    paths.push("/opt/homebrew");
  }

  // ASDF data directory
  const asdfDataDir = process.env["ASDF_DATA_DIR"];
  if (asdfDataDir) {
    if (existsSync(asdfDataDir)) {
      paths.push(asdfDataDir);
    }
  } else {
    const homeDir = process.env["HOME"];
    if (homeDir) {
      const asdfPath = join(homeDir, ".asdf");
      if (existsSync(asdfPath)) {
        paths.push(asdfPath);
      } else {
        // Check ASDF_DIR as alternative
        const asdfDir = process.env["ASDF_DIR"];
        if (asdfDir && existsSync(asdfDir)) {
          paths.push(asdfDir);
        }
      }
    }
  }

  return paths;
}

/**
 * Resolves Node.js-specific paths for npm/pnpm cache that should be writable in sandbox
 */
function resolveNodeCachePaths(): string[] {
  const paths: string[] = [];

  // npm cache directory
  const npmCacheDir = process.env["npm_config_cache"];
  if (npmCacheDir) {
    if (existsSync(npmCacheDir)) {
      paths.push(npmCacheDir);
    }
  } else {
    // Fallback to default npm cache location
    const homeDir = process.env["HOME"];
    if (homeDir) {
      const npmCachePath = join(homeDir, ".npm");
      if (existsSync(npmCachePath)) {
        paths.push(npmCachePath);
      }
    }
  }

  // pnpm cache directory
  const pnpmCacheDir = process.env["PNPM_CACHE_DIR"];
  if (pnpmCacheDir) {
    if (existsSync(pnpmCacheDir)) {
      paths.push(pnpmCacheDir);
    }
  } else {
    // Fallback to default pnpm cache location
    const homeDir = process.env["HOME"];
    if (homeDir) {
      const pnpmCachePath = join(homeDir, ".cache", "pnpm");
      if (existsSync(pnpmCachePath)) {
        paths.push(pnpmCachePath);
      }
      // Also check for pnpm store directory
      const pnpmStorePath = join(homeDir, ".local", "share", "pnpm");
      if (existsSync(pnpmStorePath)) {
        paths.push(pnpmStorePath);
      }
    }
  }

  return paths;
}

/**
 * Starts a Node.js MCP server with all necessary setup and configuration
 */
export async function startNodeServer(
  options: NodeStartupConfig
): Promise<void> {
  const { serverName, serverConfig, projectConfig, logger } = options;
  const nodeServer = serverConfig;

  // Guard against StdioMcpServerV1 variant without node property
  if (!("node" in nodeServer)) {
    throw new Error(
      `Server ${serverName} does not have required 'node' configuration`
    );
  }

  // Set up common server environment
  const { directoryResolver, envStringMap } = await setupServerEnvironment({
    envConfig: nodeServer.env ?? {},
    logger,
  });

  // Get the server directory path where .node-version should be
  // Use user directory if in user mode, otherwise use workspace directory
  const baseDir =
    options.isUserMode && options.userDir
      ? (options.userDir as ResolvedPath)
      : directoryResolver.workspace;

  const serverDir = getServerDirectoryPath(
    serverName,
    baseDir,
    options.isUserMode
  );

  logger.info(`Initializing Node.js server in directory: ${serverDir}`);

  // Perform preflight checks from the server directory
  // This ensures we respect .node-version and find the correct Node.js/pnpm
  const readPaths = await performPreflightChecks(serverDir, logger);

  // Add Node.js-specific paths for version managers and Homebrew
  const nodeSpecificPaths = resolveNodeSpecificPaths();
  const allReadPaths = [...readPaths, ...nodeSpecificPaths];

  // Add npm/pnpm cache paths that need write access
  const nodeCachePaths = resolveNodeCachePaths();

  logger.info(
    {
      nodePackage: nodeServer.node.package,
      nodeVersion: nodeServer.node.version,
      nodeRuntime: nodeServer.node.nodeVersion,
      serverDirectory: serverDir,
      readPaths,
      nodeSpecificPaths,
      nodeCachePaths,
    },
    "Node.js server configuration"
  );

  // Create dedicated server logger for debugging MCP server communication
  // Use user directory if in user mode, otherwise use workspace directory
  const loggerBaseDir =
    options.isUserMode && options.userDir
      ? (options.userDir as ResolvedPath)
      : (directoryResolver.workspace as ResolvedPath);

  const serverLogger = await createServerLogger(
    serverName,
    loggerBaseDir,
    "trace", // Use trace level to capture all our detailed debugging logs
    options.isUserMode
  );
  logger.debug(
    { serverName, logLevel: "trace" },
    "Created dedicated server logger for MCP communication debugging"
  );

  // Extract workspace options for sandbox configuration
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

  logger.info(
    {
      readPathsCount: readPaths.length,
      nodeSpecificPathsCount: nodeSpecificPaths.length,
      nodeCachePathsCount: nodeCachePaths.length,
      totalAllowedPathsCount: allReadPaths.length,
    },
    "Node.js server sandbox includes executable, version manager, and cache paths"
  );

  // Resolve sandbox configuration using shared utility with read and readwrite paths
  const sandboxConfig = resolveServerSandboxConfig({
    sandboxConfig: nodeServer.sandbox ?? {},
    directoryResolver,
    ...(workspaceOptions && { workspaceOptions }),
    readPaths: allReadPaths, // Node.js-specific: add executables + version managers + Homebrew paths
    readWritePaths: nodeCachePaths, // Node.js-specific: add npm/pnpm cache paths
    ...(options.isUserMode !== undefined && { isUserMode: options.isUserMode }),
    logger,
  });

  // Create Node.js client and pipeline target
  const nodeClient = new NodeMcpClient(
    nodeServer.node,
    envStringMap,
    directoryResolver,
    serverName,
    sandboxConfig,
    serverLogger // Use dedicated server logger for debugging
  );
  const target = createTarget(nodeClient);

  const connectionInfo = `Node.js server ${serverName} (${nodeServer.node.package}@${nodeServer.node.version})`;

  // Set up session using shared utility
  const sessionConfig = createServerSessionConfig({
    target,
    client: nodeClient,
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
  });

  logger.info(`Connected to ${connectionInfo}`);

  // Start the session and handle graceful shutdown
  await sessionManager.start();
}
