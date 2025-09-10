// pattern: Imperative Shell

import { mkdir } from "fs/promises";
import { join } from "path";

import {
  getServerLogsPath,
  getServerPath,
} from "../../config/types/workspace.js";

import type { WorkspaceContext } from "../../config/types/index.js";

/**
 * Creates the server directory structure for a given server
 * Directory structure:
 * - Both modes: {workspace}/.mcpadre/servers/{server-name}/logs/
 *
 * @param context Workspace context containing the workspace directory
 * @param serverName Name of the MCP server
 * @returns Promise resolving to the logs directory path
 */
export async function createServerDirectory(
  context: WorkspaceContext,
  serverName: string
): Promise<string> {
  const logsDir = getServerLogsPath(context, serverName);

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
 * @param context Workspace context containing the workspace directory
 * @param serverName Name of the MCP server
 * @returns Server directory path
 */
export function getServerDirectoryPath(
  context: WorkspaceContext,
  serverName: string
): string {
  return getServerPath(context, serverName);
}

/**
 * Gets the logs directory path (without creating it)
 *
 * @param context Workspace context containing the workspace directory
 * @param serverName Name of the MCP server
 * @returns Logs directory path
 */
export function getLogsDirectoryPath(
  context: WorkspaceContext,
  serverName: string
): string {
  return getServerLogsPath(context, serverName);
}
