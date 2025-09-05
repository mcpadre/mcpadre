// pattern: Functional Core

import {
  createHostConfigUpdater,
  createHostConfigUpdaterWithAnalysis,
} from "./generic-updater.js";

/**
 * Updates VS Code's .vscode/mcp.json configuration file to include mcpadre servers
 * All servers are configured to redirect through "mcpadre run <server-name>"
 *
 * @param existingContent Current .vscode/mcp.json content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Updated .vscode/mcp.json content as JSON string
 */
export const updateVSCodeConfig = createHostConfigUpdater({
  serversKey: "servers",
  serverFormat: "stdio",
});

/**
 * Updates VS Code's .vscode/mcp.json configuration file with server analysis
 * All servers are configured to redirect through "mcpadre run <server-name>"
 *
 * @param existingContent Current .vscode/mcp.json content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Object with updated config and analysis of existing servers
 */
export const updateVSCodeConfigWithAnalysis =
  createHostConfigUpdaterWithAnalysis({
    serversKey: "servers",
    serverFormat: "stdio",
  });
