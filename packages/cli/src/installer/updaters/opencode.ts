// pattern: Functional Core

import {
  createHostConfigUpdater,
  createHostConfigUpdaterWithAnalysis,
} from "./generic-updater.js";

/**
 * Updates OpenCode's opencode.json configuration file to include mcpadre servers
 * All servers are configured to redirect through "mcpadre run <server-name>"
 *
 * IMPORTANT: This function preserves all existing OpenCode user settings beyond MCP configuration.
 * Only the mcp section is modified. Also preserves existing enabled states of mcpadre servers.
 *
 * @param existingContent Current opencode.json content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Updated opencode.json content as JSON string
 */
export const updateOpenCodeConfig = createHostConfigUpdater({
  serversKey: "mcp",
  serverFormat: "opencode",
  preserveOtherKeys: true,
});

/**
 * Updates OpenCode's opencode.json configuration file with server analysis
 * All servers are configured to redirect through "mcpadre run <server-name>"
 *
 * IMPORTANT: This function preserves all existing OpenCode user settings beyond MCP configuration.
 * Only the mcp section is modified. Also preserves existing enabled states of mcpadre servers.
 *
 * @param existingContent Current opencode.json content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Object with updated config and analysis of existing servers
 */
export const updateOpenCodeConfigWithAnalysis =
  createHostConfigUpdaterWithAnalysis({
    serversKey: "mcp",
    serverFormat: "opencode",
    preserveOtherKeys: true,
  });
