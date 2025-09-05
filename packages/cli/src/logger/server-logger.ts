// pattern: Imperative Shell
// Server logger factory creates file-based loggers for MCP server debugging

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import pino, { type Level } from "pino";

import { mapLogLevelToPinoLevel } from "./config.js";

import type { ResolvedPath } from "../runner/types/index.js";

/**
 * Create a dedicated logger for an MCP server that writes to a file
 * in .mcpadre/logs/ directory (project mode) or logs/ directory (user mode)
 * with JSON format for debugging
 *
 * @param serverName Name of the MCP server
 * @param baseDir Base directory path (workspace for project mode, user dir for user mode)
 * @param logLevel Log level for the server logger (defaults to debug)
 * @param isUserMode Whether this is for user-level configuration (defaults to false)
 * @returns Promise resolving to configured pino logger
 */
export async function createServerLogger(
  serverName: string,
  baseDir: ResolvedPath,
  logLevel: Level = "debug",
  isUserMode = false
): Promise<pino.Logger> {
  // Create logs directory structure - different for user vs project mode
  const logsDir = isUserMode
    ? join(baseDir, "logs")
    : join(baseDir, ".mcpadre", "logs");
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
 * Format: .mcpadre/logs/{serverName}__{ISO-timestamp}.jsonl (project mode)
 *         logs/{serverName}__{ISO-timestamp}.jsonl (user mode)
 *
 * @param serverName Name of the MCP server
 * @param baseDir Base directory path (workspace for project mode, user dir for user mode)
 * @param isUserMode Whether this is for user-level configuration (defaults to false)
 * @returns Promise resolving to full log file path
 */
export async function createServerLogPath(
  serverName: string,
  baseDir: ResolvedPath,
  isUserMode = false
): Promise<string> {
  const logsDir = isUserMode
    ? join(baseDir, "logs")
    : join(baseDir, ".mcpadre", "logs");
  await mkdir(logsDir, { recursive: true });

  const timestamp = new Date().toISOString();
  const filename = `${serverName}__${timestamp}.jsonl`;
  return join(logsDir, filename);
}
