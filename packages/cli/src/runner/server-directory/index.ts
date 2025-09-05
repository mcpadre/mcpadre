// pattern: Imperative Shell

import { mkdir } from "fs/promises";
import { join } from "path";

import type { ResolvedPath } from "../types/index.js";

/**
 * Creates the server directory structure for a given server
 * Directory structure:
 * - Project mode: .mcpadre/servers/{server-name}/logs/
 * - User mode: {userDir}/servers/{server-name}/logs/
 *
 * @param serverName Name of the MCP server
 * @param baseDir Base directory path (workspace for project mode, user dir for user mode)
 * @param isUserMode Whether this is for user-level configuration
 * @returns Promise resolving to the logs directory path
 */
export async function createServerDirectory(
  serverName: string,
  baseDir: ResolvedPath,
  isUserMode = false
): Promise<string> {
  const serverDir = isUserMode
    ? join(baseDir, "servers", serverName)
    : join(baseDir, ".mcpadre", "servers", serverName);
  const logsDir = join(serverDir, "logs");

  // Create the directory structure recursively
  await mkdir(logsDir, { recursive: true });

  return logsDir;
}

/**
 * Creates a log file path for MCP traffic logging
 * Format: {server-name}__{ISO-UTC-timestamp}.jsonl
 *
 * @param serverName Name of the MCP server
 * @param logsDir Directory where logs should be stored
 * @returns Full path to the log file
 */
export function createLogFilePath(serverName: string, logsDir: string): string {
  const timestamp = new Date().toISOString();
  const filename = `${serverName}__${timestamp}.jsonl`;
  return join(logsDir, filename);
}

/**
 * Gets the server directory path (without creating it)
 *
 * @param serverName Name of the MCP server
 * @param baseDir Base directory path (workspace for project mode, user dir for user mode)
 * @param isUserMode Whether this is for user-level configuration
 * @returns Server directory path
 */
export function getServerDirectoryPath(
  serverName: string,
  baseDir: ResolvedPath,
  isUserMode = false
): string {
  return isUserMode
    ? join(baseDir, "servers", serverName)
    : join(baseDir, ".mcpadre", "servers", serverName);
}

/**
 * Gets the logs directory path (without creating it)
 *
 * @param serverName Name of the MCP server
 * @param baseDir Base directory path (workspace for project mode, user dir for user mode)
 * @param isUserMode Whether this is for user-level configuration
 * @returns Logs directory path
 */
export function getLogsDirectoryPath(
  serverName: string,
  baseDir: ResolvedPath,
  isUserMode = false
): string {
  const serverDir = isUserMode
    ? join(baseDir, "servers", serverName)
    : join(baseDir, ".mcpadre", "servers", serverName);
  return join(serverDir, "logs");
}
