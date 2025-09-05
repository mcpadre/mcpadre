// pattern: Functional Core

import { split } from "shlex";

import { createServerLogger } from "../../../logger/server-logger.js";
import { applyTemplate } from "../../../utils/string-templating/index.js";
import { createSessionWithInterceptors } from "../../session/startup.js";
import {
  createServerSessionConfig,
  resolveServerSandboxConfig,
  setupServerEnvironment,
  type WorkspaceServerOptions,
} from "../common/startup-utils.js";
import { createTarget } from "../common/target.js";

import { ShellMcpClient } from "./client.js";

import type { ShellMcpServerV1 } from "../../../config/types/v1/server/index.js";
import type { DirectoryResolver } from "../../directory-resolver/index.js";
import type { RunServerOptions } from "../../index.js";
import type { ResolvedPath } from "../../types/index.js";

/**
 * Configuration specific to shell server startup
 */
interface ShellStartupConfig extends RunServerOptions {
  serverConfig: ShellMcpServerV1;
}

/**
 * Parses and validates the shell command configuration
 */
async function parseShellCommand(
  shellServer: ShellMcpServerV1,
  directoryResolver: DirectoryResolver,
  serverName: string,
  logger: typeof import("../../../cli/_deps.js").CLI_LOGGER
): Promise<{ command: string; args: string[]; cwd: string }> {
  // Resolve command template
  const templateVars = {
    dirs: directoryResolver,
    parentEnv: process.env,
  };

  const resolvedCommand = applyTemplate(
    shellServer.shell.command,
    templateVars
  );
  logger.debug({ command: resolvedCommand }, "Resolved shell command");

  // Parse command into parts using shell lexing
  const commandParts = split(resolvedCommand as string);
  const command = commandParts[0];
  if (!command) {
    throw new Error(`Empty command for shell server '${serverName}'`);
  }
  const args = commandParts.slice(1);

  // Resolve working directory if specified
  const cwd = shellServer.shell.cwd
    ? applyTemplate(shellServer.shell.cwd, templateVars)
    : directoryResolver.workspace;

  return { command, args, cwd: cwd as string };
}

/**
 * Starts a shell MCP server with all necessary setup and configuration
 */
export async function startShellServer(
  options: ShellStartupConfig
): Promise<void> {
  const { serverName, serverConfig, projectConfig, logger } = options;
  const shellServer = serverConfig;

  // Set up common server environment
  const { directoryResolver, envStringMap } = await setupServerEnvironment({
    envConfig: shellServer.env ?? {},
    logger,
  });

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

  // Parse and validate shell command
  const { command, args, cwd } = await parseShellCommand(
    shellServer,
    directoryResolver,
    serverName,
    logger
  );

  logger.info(
    {
      command,
      args,
      cwd,
    },
    "Shell server command configuration"
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

  // Resolve sandbox configuration using shared utility
  const sandboxConfig = resolveServerSandboxConfig({
    sandboxConfig: shellServer.sandbox ?? {},
    directoryResolver,
    ...(workspaceOptions && { workspaceOptions }),
    ...(options.isUserMode !== undefined && { isUserMode: options.isUserMode }),
    logger,
  });

  // Create shell client and pipeline target
  const shellClient = new ShellMcpClient(
    { command, args },
    envStringMap,
    cwd as ResolvedPath,
    sandboxConfig,
    serverLogger, // Use dedicated server logger for debugging
    serverName
  );
  const target = createTarget(shellClient);

  const connectionInfo = `shell server ${serverName} (${command})`;

  // Set up session using shared utility
  const sessionConfig = createServerSessionConfig({
    target,
    client: shellClient,
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
