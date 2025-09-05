// pattern: Functional Core

import {
  createHostConfigUpdater,
  createHostConfigUpdaterWithAnalysis,
} from "./generic-updater.js";

/**
 * Updates Zed's .zed/settings.json configuration file to include mcpadre context servers
 * All servers are configured to redirect through "mcpadre run <server-name>"
 *
 * IMPORTANT: This function preserves all existing Zed user settings beyond MCP configuration.
 * Only the context_servers section is modified.
 *
 * @param existingContent Current .zed/settings.json content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Updated .zed/settings.json content as JSON string
 */
export const updateZedConfig = createHostConfigUpdater({
  serversKey: "context_servers",
  serverFormat: "zed",
  preserveOtherKeys: true,
});

/**
 * Updates Zed's .zed/settings.json configuration file with server analysis
 * All servers are configured to redirect through "mcpadre run <server-name>"
 *
 * IMPORTANT: This function preserves all existing Zed user settings beyond MCP configuration.
 * Only the context_servers section is modified.
 *
 * @param existingContent Current .zed/settings.json content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Object with updated config and analysis of existing servers
 */
export const updateZedConfigWithAnalysis = createHostConfigUpdaterWithAnalysis({
  serversKey: "context_servers",
  serverFormat: "zed",
  preserveOtherKeys: true,
});
