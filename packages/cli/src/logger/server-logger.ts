// pattern: Imperative Shell
// Server logger factory creates file-based loggers for MCP server debugging

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import pino, { type Level } from "pino";

import { getServerLogsPath } from "../config/types/workspace.js";

import { mapLogLevelToPinoLevel } from "./config.js";

import type { WorkspaceContext } from "../config/types/index.js";
import type { ResolvedPath } from "../runner/types/index.js";

/**
 * Create a dedicated logger for an MCP server that writes to a file
 * in the workspace's logs directory with JSON format for debugging
 *
 * @param serverName Name of the MCP server
 * @param baseDir Base directory path (workspace directory)
 * @param logLevel Log level for the server logger (defaults to debug)
 * @param context Workspace context for determining directory structure
 * @returns Promise resolving to configured pino logger
 */
export async function createServerLogger(
  serverName: string,
  _baseDir: ResolvedPath,
  logLevel: Level = "debug",
  context: WorkspaceContext
): Promise<pino.Logger> {
  // Create logs directory using workspace context
  const logsDir = getServerLogsPath(context, serverName);
  await mkdir(logsDir, { recursive: true });

  // Generate timestamped log file name
  const timestamp = new Date().toISOString();
  const filename = `${serverName}__${timestamp}.jsonl`;
  const logFilePath = join(logsDir, filename);

  // Create pino logger with file destination and JSON format
  const fileStream = pino.destination({
    dest: logFilePath,
    sync: false, // Async writing for better performance
  });

  // Configure logger with server context
  const logger = pino(
    {
      name: "mcpadre-server",
      level: mapLogLevelToPinoLevel(logLevel),
      // Add server name to all log entries for easier filtering
      base: {
        serverName,
        pid: process.pid,
      },
    },
    fileStream
  );

  // Log initial server logger creation
  logger.info(
    {
      logFilePath,
      serverName,
      logLevel,
    },
    "Server logger initialized with file output"
  );

  return logger;
}

/**
 * Create simplified log file path for server logging
 * Format: {workspace}/.mcpadre/servers/{serverName}/logs/{serverName}__{ISO-timestamp}.jsonl
 *
 * @param serverName Name of the MCP server
 * @param baseDir Base directory path (workspace directory)
 * @param context Workspace context for determining directory structure
 * @returns Promise resolving to full log file path
 */
export async function createServerLogPath(
  serverName: string,
  _baseDir: ResolvedPath,
  context: WorkspaceContext
): Promise<string> {
  const logsDir = getServerLogsPath(context, serverName);
  await mkdir(logsDir, { recursive: true });

  const timestamp = new Date().toISOString();
  const filename = `${serverName}__${timestamp}.jsonl`;
  return join(logsDir, filename);
}
