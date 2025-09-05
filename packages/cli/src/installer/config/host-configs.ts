// pattern: Functional Core

import {
  updateClaudeCodeConfig,
  updateClaudeCodeConfigWithAnalysis,
} from "../updaters/claude-code.js";
import {
  updateClaudeCodeGlobalConfig,
  updateClaudeCodeGlobalConfigWithAnalysis,
} from "../updaters/claude-code-global.js";
import {
  updateClaudeDesktopConfig,
  updateClaudeDesktopConfigWithAnalysis,
} from "../updaters/claude-desktop.js";
import {
  updateCursorConfig,
  updateCursorConfigWithAnalysis,
} from "../updaters/cursor.js";
import {
  updateOpenCodeConfig,
  updateOpenCodeConfigWithAnalysis,
} from "../updaters/opencode.js";
import {
  updateVSCodeConfig,
  updateVSCodeConfigWithAnalysis,
} from "../updaters/vscode.js";
import {
  updateZedConfig,
  updateZedConfigWithAnalysis,
} from "../updaters/zed.js";

import { getClaudeCodeGlobalConfigPath } from "./claude-code-global.js";

import type { SupportedHostV1 } from "../../config/types/v1/hosts.js";
import type { McpServerV1 } from "../../config/types/v1/server/index.js";
import type { ConfigUpdateWithAnalysis } from "../updaters/generic-updater.js";

/**
 * Configuration for a specific host's project-level MCP configuration
 */
export interface HostConfiguration {
  /**
   * Relative path from project root to the host's MCP configuration file
   * e.g., ".mcp.json", ".cursor/mcp.json", ".zed/settings.json"
   */
  projectConfigPath: string;

  /**
   * Absolute path or function returning path to the host's user-level configuration file
   * e.g., "$HOME/.claude/config.json", "$HOME/.opencode/config.json"
   * Only set for hosts that support user-level configuration
   */
  userConfigPath?: string | (() => string);

  /**
   * Whether this host's config file should be added to .gitignore by default
   * false for zed (contains user settings), true for others (machine-specific)
   */
  shouldGitignore: boolean;

  /**
   * Function to update the host's configuration file content
   * @param existingContent Current file content (empty string if file doesn't exist)
   * @param servers mcpadre server configurations to merge in
   * @returns Updated configuration file content as string
   */
  projectMcpConfigUpdater: (
    existingContent: string,
    servers: Record<string, McpServerV1>
  ) => string;

  /**
   * Function to update the host's configuration file content with server analysis
   * @param existingContent Current file content (empty string if file doesn't exist)
   * @param servers mcpadre server configurations to merge in
   * @returns Object with updated config and analysis of existing servers
   */
  projectMcpConfigUpdaterWithAnalysis: (
    existingContent: string,
    servers: Record<string, McpServerV1>
  ) => ConfigUpdateWithAnalysis;

  /**
   * Function to update the host's user-level configuration file content
   * Only set for hosts that support user-level configuration
   * @param existingContent Current file content (empty string if file doesn't exist)
   * @param servers mcpadre server configurations to merge in
   * @returns Updated configuration file content as string
   */
  userMcpConfigUpdater?: (
    existingContent: string,
    servers: Record<string, McpServerV1>
  ) => string;

  /**
   * Function to update the host's user-level configuration file content with server analysis
   * Only set for hosts that support user-level configuration
   * @param existingContent Current file content (empty string if file doesn't exist)
   * @param servers mcpadre server configurations to merge in
   * @returns Object with updated config and analysis of existing servers
   */
  userMcpConfigUpdaterWithAnalysis?: (
    existingContent: string,
    servers: Record<string, McpServerV1>
  ) => ConfigUpdateWithAnalysis;
}

/**
 * Registry of all supported MCP hosts and their project-level configuration details
 */
export const HOST_CONFIGS: Record<SupportedHostV1, HostConfiguration> = {
  "claude-code": {
    projectConfigPath: ".mcp.json",
    userConfigPath: getClaudeCodeGlobalConfigPath,
    shouldGitignore: true,
    projectMcpConfigUpdater: updateClaudeCodeConfig,
    projectMcpConfigUpdaterWithAnalysis: updateClaudeCodeConfigWithAnalysis,
    userMcpConfigUpdater: updateClaudeCodeGlobalConfig,
    userMcpConfigUpdaterWithAnalysis: updateClaudeCodeGlobalConfigWithAnalysis,
  },

  "claude-desktop": {
    projectConfigPath: "", // Not applicable for user-only host
    shouldGitignore: false, // Not applicable for user-only host
    projectMcpConfigUpdater: updateClaudeDesktopConfig,
    projectMcpConfigUpdaterWithAnalysis: updateClaudeDesktopConfigWithAnalysis,
  },

  cursor: {
    projectConfigPath: ".cursor/mcp.json",
    shouldGitignore: true,
    projectMcpConfigUpdater: updateCursorConfig,
    projectMcpConfigUpdaterWithAnalysis: updateCursorConfigWithAnalysis,
  },

  opencode: {
    projectConfigPath: "opencode.json",
    shouldGitignore: false, // Contains user settings beyond MCP
    projectMcpConfigUpdater: updateOpenCodeConfig,
    projectMcpConfigUpdaterWithAnalysis: updateOpenCodeConfigWithAnalysis,
  },

  zed: {
    projectConfigPath: ".zed/settings.json",
    shouldGitignore: false, // Contains user settings beyond MCP
    projectMcpConfigUpdater: updateZedConfig,
    projectMcpConfigUpdaterWithAnalysis: updateZedConfigWithAnalysis,
  },

  vscode: {
    projectConfigPath: ".vscode/mcp.json",
    shouldGitignore: true,
    projectMcpConfigUpdater: updateVSCodeConfig,
    projectMcpConfigUpdaterWithAnalysis: updateVSCodeConfigWithAnalysis,
  },
};
