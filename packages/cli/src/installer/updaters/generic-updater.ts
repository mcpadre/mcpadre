// pattern: Functional Core

import {
  classifyServers,
  type ServerClassification,
} from "../discovery/server-detector.js";

import type { McpServerV1 } from "../../config/types/v1/server/index.js";

/**
 * Configuration specification for a host's MCP config format
 */
export interface HostConfigSpec {
  /** The key in the JSON where MCP servers are stored (e.g., 'mcpServers', 'servers', 'context_servers') */
  serversKey: string;
  /** The format for individual server entries */
  serverFormat: "simple" | "stdio" | "zed" | "opencode";
  /** Whether to preserve all other keys in the config (for hosts like Zed with user settings) */
  preserveOtherKeys?: boolean;
  /** Custom formatter function to override default server entry formatting */
  formatServerEntry?: (
    serverName: string,
    existingEntry?: Record<string, unknown>
  ) => Record<string, unknown>;
}

/**
 * Creates a host-specific config updater function based on the provided specification
 *
 * @param spec Configuration specification defining how this host stores MCP servers
 * @returns Function that updates host config files with mcpadre server entries
 */
export function createHostConfigUpdater(spec: HostConfigSpec) {
  return function updateConfig(
    existingContent: string,
    servers: Record<string, McpServerV1>
  ): string {
    // Parse existing configuration, defaulting to empty config if file doesn't exist or is invalid
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let config: Record<string, any> = {};

    if (existingContent.trim()) {
      try {
        config = JSON.parse(existingContent);
      } catch {
        // If JSON is invalid, start with empty config
        config = {};
      }
    }

    // Ensure the host's servers section exists
    config[spec.serversKey] ??= {};

    // Add/update each mcpadre server to redirect through "mcpadre run"
    for (const [serverName, _serverConfig] of Object.entries(servers)) {
      const existingEntry = config[spec.serversKey][serverName];

      // Use custom formatter if provided, otherwise use default
      config[spec.serversKey][serverName] = spec.formatServerEntry
        ? spec.formatServerEntry(
            serverName,
            existingEntry as Record<string, unknown>
          )
        : formatServerEntry(serverName, spec.serverFormat, existingEntry);
    }

    // Return formatted JSON with 2-space indentation
    return `${JSON.stringify(config, null, 2)}\n`;
  };
}

/**
 * Result from updating host configuration with analysis
 */
export interface ConfigUpdateWithAnalysis {
  /** Updated configuration file content as string */
  updatedConfig: string;
  /** Analysis of server classification before update */
  analysis: ServerClassification;
}

/**
 * Creates a host-specific config updater function that includes server analysis
 *
 * @param spec Configuration specification defining how this host stores MCP servers
 * @returns Function that updates host config files and returns analysis
 */
export function createHostConfigUpdaterWithAnalysis(spec: HostConfigSpec) {
  return function updateConfigWithAnalysis(
    existingContent: string,
    servers: Record<string, McpServerV1>
  ): ConfigUpdateWithAnalysis {
    // Parse existing configuration, defaulting to empty config if file doesn't exist or is invalid
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let config: Record<string, any> = {};

    if (existingContent.trim()) {
      try {
        config = JSON.parse(existingContent);
      } catch {
        // If JSON is invalid, start with empty config
        config = {};
      }
    }

    // Analyze existing servers before making changes
    const mcpadreServerNames = new Set(Object.keys(servers));
    const analysis = classifyServers(config, spec, mcpadreServerNames);

    // Ensure the host's servers section exists
    config[spec.serversKey] ??= {};

    // Remove orphaned mcpadre servers from config
    for (const orphanedServer of analysis.mcpadreOrphaned) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete config[spec.serversKey][orphanedServer];
    }

    // Add/update each current mcpadre server to redirect through "mcpadre run"
    for (const [serverName, _serverConfig] of Object.entries(servers)) {
      const existingEntry = config[spec.serversKey][serverName];

      // Use custom formatter if provided, otherwise use default
      config[spec.serversKey][serverName] = spec.formatServerEntry
        ? spec.formatServerEntry(
            serverName,
            existingEntry as Record<string, unknown>
          )
        : formatServerEntry(serverName, spec.serverFormat, existingEntry);
    }

    const updatedConfig = `${JSON.stringify(config, null, 2)}\n`;

    return {
      updatedConfig,
      analysis,
    };
  };
}

/**
 * Formats a server entry according to the host's expected structure
 */
function formatServerEntry(
  serverName: string,
  format: "simple" | "stdio" | "zed" | "opencode",
  existingEntry?: Record<string, unknown>
): Record<string, unknown> {
  const baseEntry = {
    command: "mcpadre",
    args: ["run", serverName],
  };

  switch (format) {
    case "stdio":
      // VS Code format: includes type field
      return {
        type: "stdio",
        ...baseEntry,
      };

    case "zed":
      // Zed format: nested command structure
      return {
        command: {
          path: baseEntry.command,
          args: baseEntry.args,
        },
      };

    case "opencode": {
      // OpenCode format: preserve existing enabled state
      const rawEnabled = existingEntry?.["enabled"];
      const existingEnabled =
        typeof rawEnabled === "boolean" ? rawEnabled : true;
      return {
        type: "local",
        command: [baseEntry.command, ...baseEntry.args], // OpenCode uses full command array
        enabled: existingEnabled,
      };
    }

    case "simple":
    default:
      // Simple format: Claude Code and Cursor
      return baseEntry;
  }
}
