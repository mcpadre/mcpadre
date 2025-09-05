// pattern: Functional Core

import {
  createHostConfigUpdater,
  createHostConfigUpdaterWithAnalysis,
  type HostConfigSpec,
} from "./generic-updater.js";

/**
 * Generates a custom server entry specifically for global Claude Code config
 * Ensures the "run" command includes the --user flag for global server execution
 *
 * @param serverName Name of the server
 * @returns Formatted server entry object
 */
export function formatGlobalServerEntry(
  serverName: string
): Record<string, unknown> {
  return {
    command: "mcpadre",
    args: ["run", "--user", serverName],
  };
}

/**
 * Custom config spec for Claude Code global config that uses formatGlobalServerEntry
 */
const claudeCodeGlobalSpec: HostConfigSpec & {
  formatServerEntry?: (serverName: string) => Record<string, unknown>;
} = {
  serversKey: "mcpServers",
  serverFormat: "simple",
  formatServerEntry: formatGlobalServerEntry,
};

/**
 * Updates Claude Code's global config.json configuration file to include mcpadre servers
 * All servers are configured to redirect through "mcpadre run --user <server-name>"
 *
 * @param existingContent Current config.json content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Updated config.json content as JSON string
 */
export const updateClaudeCodeGlobalConfig =
  createHostConfigUpdater(claudeCodeGlobalSpec);

/**
 * Updates Claude Code's global config.json with server analysis
 * All servers are configured to redirect through "mcpadre run --user <server-name>"
 *
 * @param existingContent Current config.json content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Object with updated config and analysis of existing servers
 */
export const updateClaudeCodeGlobalConfigWithAnalysis =
  createHostConfigUpdaterWithAnalysis(claudeCodeGlobalSpec);
