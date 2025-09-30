// pattern: Imperative Shell

import { mkdir } from "fs/promises";
import { join } from "path";

import {
  getMcpTrafficRecordingPath,
  getServerPath,
} from "../../config/types/workspace.js";

import type { WorkspaceContext } from "../../config/types/index.js";

/**
 * Creates the server directory structure for a given server
 * Directory structure:
 * - Both modes: {workspace}/.mcpadre/traffic/{server-name}/
 *
 * @param context Workspace context containing the workspace directory
 * @param serverName Name of the MCP server
 * @returns Promise resolving to the traffic recording directory path
 */
export async function createServerDirectory(
  context: WorkspaceContext,
  serverName: string
): Promise<string> {
  const recordingDir = getMcpTrafficRecordingPath(context, serverName);

  // Create the directory structure recursively
  await mkdir(recordingDir, { recursive: true });

  return recordingDir;
}

/**
 * Creates a recording file path for MCP traffic recording
 * Format: {server-name}__{ISO-UTC-timestamp}.jsonl
 *
 * @param serverName Name of the MCP server
 * @param recordingDir Directory where recordings should be stored
 * @returns Full path to the recording file
 */
export function createRecordingFilePath(
  serverName: string,
  recordingDir: string
): string {
  const timestamp = new Date().toISOString();
  const filename = `${serverName}__${timestamp}.jsonl`;
  return join(recordingDir, filename);
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
 * Gets the traffic recording directory path (without creating it)
 *
 * @param context Workspace context containing the workspace directory
 * @param serverName Name of the MCP server
 * @returns Traffic recording directory path
 */
export function getTrafficRecordingDirectoryPath(
  context: WorkspaceContext,
  serverName: string
): string {
  return getMcpTrafficRecordingPath(context, serverName);
}
