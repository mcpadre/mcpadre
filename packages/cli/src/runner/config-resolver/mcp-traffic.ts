// pattern: Functional Core

import {
  isContainerServer,
  isPythonServer,
  isShellServer,
} from "../../config/types/v1/server/index.js";

import type { SettingsProject } from "../../config/types/index.js";
import type { McpServerV1 } from "../../config/types/v1/server/index.js";

/**
 * Determines whether MCP traffic logging should be enabled for a specific server
 *
 * Resolution order:
 * 1. Server-level logMcpTraffic setting (if present) takes precedence
 * 2. Falls back to workspace-level logMcpTraffic setting
 * 3. Defaults to false if neither is specified
 *
 * @param serverConfig Configuration for the specific MCP server
 * @param workspaceConfig Workspace-level project configuration
 * @returns true if MCP traffic logging should be enabled, false otherwise
 */
export function shouldLogMcpTraffic(
  serverConfig: McpServerV1,
  workspaceConfig: SettingsProject
): boolean {
  // Server-level override takes precedence if explicitly set
  let logMcpTraffic: boolean | undefined;

  if (
    isPythonServer(serverConfig) ||
    isShellServer(serverConfig) ||
    isContainerServer(serverConfig)
  ) {
    logMcpTraffic = serverConfig.logMcpTraffic;
  }
  // Note: Node.js servers do not currently support logMcpTraffic option

  if (typeof logMcpTraffic === "boolean") {
    return logMcpTraffic;
  }

  // Fall back to workspace-level setting
  return workspaceConfig.options?.logMcpTraffic ?? false;
}

/**
 * Type guard to check if a server config supports logMcpTraffic option
 * Currently only shell servers support MCP traffic logging
 *
 * @param serverConfig Server configuration to check
 * @returns true if the server supports logMcpTraffic option
 */
export function supportsTrafficLogging(serverConfig: McpServerV1): boolean {
  // Only shell servers support traffic logging
  return "shell" in serverConfig;
}

/**
 * Gets the effective logging setting for a server, with additional metadata
 *
 * @param serverConfig Configuration for the specific MCP server
 * @param workspaceConfig Workspace-level project configuration
 * @returns Object with logging enabled flag and source of the setting
 */
export function getLoggingConfig(
  serverConfig: McpServerV1,
  workspaceConfig: SettingsProject
): {
  enabled: boolean;
  source: "server" | "workspace" | "default";
} {
  // Check server-level setting first
  let logMcpTraffic: boolean | undefined;

  if (
    isPythonServer(serverConfig) ||
    isShellServer(serverConfig) ||
    isContainerServer(serverConfig)
  ) {
    logMcpTraffic = serverConfig.logMcpTraffic;
  }

  if (typeof logMcpTraffic === "boolean") {
    return {
      enabled: logMcpTraffic,
      source: "server",
    };
  }

  // Check workspace-level setting
  if (typeof workspaceConfig.options?.logMcpTraffic === "boolean") {
    return {
      enabled: workspaceConfig.options.logMcpTraffic,
      source: "workspace",
    };
  }

  // Default to disabled
  return {
    enabled: false,
    source: "default",
  };
}
