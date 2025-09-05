// pattern: Functional Core

import {
  createHostConfigUpdater,
  createHostConfigUpdaterWithAnalysis,
} from "./generic-updater.js";

/**
 * Updates Claude Code's .mcp.json configuration file to include mcpadre servers
 * All servers are configured to redirect through "mcpadre run <server-name>"
 *
 * @param existingContent Current .mcp.json content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Updated .mcp.json content as JSON string
 */
export const updateClaudeCodeConfig = createHostConfigUpdater({
  serversKey: "mcpServers",
  serverFormat: "simple",
});

/**
 * Updates Claude Code's .mcp.json configuration file with server analysis
 * All servers are configured to redirect through "mcpadre run <server-name>"
 *
 * @param existingContent Current .mcp.json content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Object with updated config and analysis of existing servers
 */
export const updateClaudeCodeConfigWithAnalysis =
  createHostConfigUpdaterWithAnalysis({
    serversKey: "mcpServers",
    serverFormat: "simple",
  });
