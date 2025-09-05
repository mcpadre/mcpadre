// pattern: Functional Core

import {
  createHostConfigUpdater,
  createHostConfigUpdaterWithAnalysis,
} from "./generic-updater.js";

/**
 * Updates Cursor's .cursor/mcp.json configuration file to include mcpadre servers
 * All servers are configured to redirect through "mcpadre run <server-name>"
 *
 * @param existingContent Current .cursor/mcp.json content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Updated .cursor/mcp.json content as JSON string
 */
export const updateCursorConfig = createHostConfigUpdater({
  serversKey: "mcpServers",
  serverFormat: "simple",
});

/**
 * Updates Cursor's .cursor/mcp.json configuration file with server analysis
 * All servers are configured to redirect through "mcpadre run <server-name>"
 *
 * @param existingContent Current .cursor/mcp.json content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Object with updated config and analysis of existing servers
 */
export const updateCursorConfigWithAnalysis =
  createHostConfigUpdaterWithAnalysis({
    serversKey: "mcpServers",
    serverFormat: "simple",
  });
