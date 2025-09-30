// pattern: Functional Core

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { getServerDirectoryPath } from "../../server-directory/index.js";
import { createSessionWithInterceptors } from "../../session/startup.js";
import {
  createServerSessionConfig,
  resolveServerSandboxConfig,
  setupServerEnvironment,
  type WorkspaceServerOptions,
} from "../common/startup-utils.js";
import { createTarget } from "../common/target.js";

import { PythonMcpClient } from "./client.js";

import type { PythonMcpServerV1 } from "../../../config/types/v1/server/index.js";
import type { RunServerOptions } from "../../index.js";

/**
 * Configuration specific to Python server startup
 */
interface PythonStartupConfig extends RunServerOptions {
  serverConfig: PythonMcpServerV1;
}

/**
 * Performs preflight checks to ensure Python and uv executables are available and working
 * Should be run from the server directory where .python-version exists
 */
async function performPreflightChecks(
  serverDir: string,
  logger: typeof import("../../../cli/_deps.js").CLI_LOGGER
): Promise<string[]> {
  const executablePaths: string[] = [];

  // Log the directory we're checking from
  logger.debug(
    `Performing Python preflight checks from directory: ${serverDir}`
  );

  // Find and verify python executable from the server directory
  let pythonPath: string;
  try {
    // Run which from the server directory to respect .python-version
    pythonPath = execSync("which python", {
      cwd: serverDir,
      encoding: "utf-8",
    }).trim();
    logger.debug(`Found python executable at: ${pythonPath}`);
    executablePaths.push(pythonPath);
  } catch {
    const errorMessage = `python executable not found in PATH from server directory ${serverDir}. Run 'mcpadre install' first.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  try {
    execSync("python --version", { stdio: "pipe", cwd: serverDir });
    logger.debug("python --version check passed");
  } catch {
    const errorMessage =
      "python --version failed. Python installation may be corrupted.";
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  // Find and verify uv executable from the server directory
  let uvPath: string;
  try {
    // Run which from the server directory
    uvPath = execSync("which uv", { cwd: serverDir, encoding: "utf-8" }).trim();
    logger.debug(`Found uv executable at: ${uvPath}`);
    executablePaths.push(uvPath);
  } catch {
    const errorMessage = `uv executable not found in PATH from server directory ${serverDir}. Run 'mcpadre install' first.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  try {
    execSync("uv --version", { stdio: "pipe", cwd: serverDir });
    logger.debug("uv --version check passed");
  } catch {
    const errorMessage =
      "uv --version failed. uv installation may be corrupted.";
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  return executablePaths;
}

/**
 * Resolves Python-specific paths for version managers and Homebrew that should be readable in sandbox
 */
function resolvePythonSpecificPaths(): string[] {
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
 * Resolves Python-specific paths for UV cache that should be writable in sandbox
 */
function resolvePythonUvCachePaths(): string[] {
  const paths: string[] = [];

  // UV cache directory
  const uvCacheDir = process.env["UV_CACHE_DIR"];
  if (uvCacheDir) {
    if (existsSync(uvCacheDir)) {
      paths.push(uvCacheDir);
    }
  } else {
    // Fallback to default UV cache location
    const homeDir = process.env["HOME"];
    if (homeDir) {
      const uvCachePath = join(homeDir, ".cache", "uv");
      if (existsSync(uvCachePath)) {
        paths.push(uvCachePath);
      }
    }
  }

  return paths;
}

/**
 * Starts a Python MCP server with all necessary setup and configuration
 */
export async function startPythonServer(
  options: PythonStartupConfig
): Promise<void> {
  const { serverName, serverConfig, context, logger } = options;
  const pythonServer = serverConfig;
  const projectConfig = context.mergedConfig;

  // Set up common server environment
  const { directoryResolver, envStringMap } = await setupServerEnvironment({
    context,
    envConfig: pythonServer.env ?? {},
    logger,
  });

  // Get the server directory path where .python-version should be
  const serverDir = getServerDirectoryPath(context, serverName);

  logger.info(`Initializing Python server in directory: ${serverDir}`);

  // Perform preflight checks from the server directory
  // This ensures we respect .python-version and find the correct Python/uv
  const readPaths = await performPreflightChecks(serverDir, logger);

  // Add Python-specific paths for version managers and Homebrew
  const pythonSpecificPaths = resolvePythonSpecificPaths();
  const allReadPaths = [...readPaths, ...pythonSpecificPaths];

  // Add UV cache paths that need write access
  const uvCachePaths = resolvePythonUvCachePaths();

  logger.info(
    {
      pythonPackage: pythonServer.python.package,
      pythonVersion: pythonServer.python.version,
      pythonRuntime: pythonServer.python.pythonVersion,
      command: pythonServer.python.command,
      serverDirectory: serverDir,
      readPaths,
      pythonSpecificPaths,
      uvCachePaths,
    },
    "Python server configuration"
  );

  // Create child logger for server-specific logging
  const serverLogger = logger.child({ serverName });

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
      pythonSpecificPathsCount: pythonSpecificPaths.length,
      uvCachePathsCount: uvCachePaths.length,
      totalAllowedPathsCount: allReadPaths.length,
    },
    "Python server sandbox includes executable, version manager, and cache paths"
  );

  // Resolve sandbox configuration using shared utility with read and readwrite paths
  const sandboxConfig = resolveServerSandboxConfig({
    sandboxConfig: pythonServer.sandbox ?? {},
    directoryResolver,
    ...(workspaceOptions && { workspaceOptions }),
    readPaths: allReadPaths, // Python-specific: add executables + version managers + Homebrew paths
    readWritePaths: uvCachePaths, // Python-specific: add UV cache paths
    context,
    logger,
  });

  // Create Python client and pipeline target
  const pythonClient = new PythonMcpClient(
    pythonServer.python,
    envStringMap,
    directoryResolver,
    serverName,
    sandboxConfig,
    serverLogger // Use child logger for debugging
  );
  const target = createTarget(pythonClient);

  const connectionInfo = `Python server ${serverName} (${pythonServer.python.package}==${pythonServer.python.version})`;

  // Set up session using shared utility
  const sessionConfig = createServerSessionConfig({
    target,
    client: pythonClient,
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
