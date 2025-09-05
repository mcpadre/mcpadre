// pattern: Functional Core

import type {
  McpServer,
  ServerSpec,
  SettingsProject,
  SettingsUser,
} from "../../config/types/index.js";

/**
 * Validates that a server name exists in the configuration
 * @param config The current project or user configuration
 * @param serverName The server name to check
 * @returns True if the server exists in the config
 */
export function serverExistsInConfig(
  config: SettingsProject | SettingsUser,
  serverName: string
): boolean {
  return serverName in config.mcpServers;
}

/**
 * Gets all server names from a ServerSpec
 * @param serverSpec The ServerSpec to extract server names from
 * @returns Array of server names
 */
export function getServerNamesFromSpec(serverSpec: ServerSpec): string[] {
  return Object.keys(serverSpec.mcpServers);
}

/**
 * Gets a specific server configuration from a ServerSpec
 * @param serverSpec The ServerSpec to get server from
 * @param serverName The name of the server to get
 * @returns The server configuration or undefined if not found
 */
export function getServerFromSpec(
  serverSpec: ServerSpec,
  serverName: string
): McpServer | undefined {
  return serverSpec.mcpServers[serverName];
}

/**
 * Adds servers from a ServerSpec to the project or user configuration
 * @param config The current project or user configuration
 * @param serverSpec The ServerSpec containing servers to add
 * @param serverNames Array of server names to add (from the ServerSpec)
 * @returns Updated configuration with the new servers
 */
export function addServersToConfig(
  config: SettingsProject,
  serverSpec: ServerSpec,
  serverNames: string[]
): SettingsProject;
export function addServersToConfig(
  config: SettingsUser,
  serverSpec: ServerSpec,
  serverNames: string[]
): SettingsUser;
export function addServersToConfig(
  config: SettingsProject | SettingsUser,
  serverSpec: ServerSpec,
  serverNames: string[]
): SettingsProject | SettingsUser {
  const currentServers = config.mcpServers;
  const newServers = { ...currentServers };

  for (const serverName of serverNames) {
    const serverConfig = getServerFromSpec(serverSpec, serverName);
    if (serverConfig) {
      newServers[serverName] = serverConfig;
    }
  }

  return {
    ...config,
    mcpServers: newServers,
  };
}

/**
 * Removes a server from the project or user configuration
 * @param config The current project or user configuration
 * @param serverName The name of the server to remove
 * @returns Updated configuration without the specified server
 */
export function removeServerFromConfig(
  config: SettingsProject,
  serverName: string
): SettingsProject;
export function removeServerFromConfig(
  config: SettingsUser,
  serverName: string
): SettingsUser;
export function removeServerFromConfig(
  config: SettingsProject | SettingsUser,
  serverName: string
): SettingsProject | SettingsUser {
  if (!serverExistsInConfig(config, serverName)) {
    // Server not present, return unchanged
    return config;
  }

  const { [serverName]: _, ...remainingServers } = config.mcpServers;

  return {
    ...config,
    mcpServers: remainingServers,
  };
}

/**
 * Server selection logic for the add command
 * Determines which servers to select based on flags and interactive choices
 */
export interface ServerSelectionOptions {
  /** If true, select all available servers */
  selectAll: boolean;
  /** Specific server name to select (from --server-name flag) */
  specificServerName?: string | undefined;
  /** Available server names from the ServerSpec file */
  availableServerNames: string[];
  /** Whether we're in interactive mode */
  isInteractive: boolean;
  /** User's interactive selections (only used in interactive mode) */
  interactiveSelections?: string[];
}

export interface ServerSelectionResult {
  /** The server names that were selected */
  selectedServerNames: string[];
  /** Whether the selection was successful */
  success: boolean;
  /** Error message if selection failed */
  errorMessage?: string;
}

/**
 * Determines which servers to select based on the given options
 */
export function selectServersToAdd(
  options: ServerSelectionOptions
): ServerSelectionResult {
  const {
    availableServerNames,
    selectAll,
    specificServerName,
    isInteractive,
    interactiveSelections,
  } = options;

  // Validate that we have servers available
  if (availableServerNames.length === 0) {
    return {
      selectedServerNames: [],
      success: false,
      errorMessage: "No servers found in the ServerSpec file",
    };
  }

  // Case 1: --all flag - select all servers
  if (selectAll) {
    return {
      selectedServerNames: availableServerNames,
      success: true,
    };
  }

  // Case 2: --server-name flag - select specific server
  if (specificServerName) {
    if (!availableServerNames.includes(specificServerName)) {
      return {
        selectedServerNames: [],
        success: false,
        errorMessage: `Server '${specificServerName}' not found in ServerSpec. Available servers: ${availableServerNames.join(", ")}`,
      };
    }
    return {
      selectedServerNames: [specificServerName],
      success: true,
    };
  }

  // Case 3: Single server - auto-select
  if (availableServerNames.length === 1) {
    return {
      selectedServerNames: availableServerNames,
      success: true,
    };
  }

  // Case 4: Interactive mode - use user selections
  if (isInteractive && interactiveSelections) {
    if (interactiveSelections.length === 0) {
      return {
        selectedServerNames: [],
        success: false,
        errorMessage: "No servers selected",
      };
    }
    return {
      selectedServerNames: interactiveSelections,
      success: true,
    };
  }

  // Case 5: Non-interactive mode with multiple servers - error
  if (!isInteractive) {
    return {
      selectedServerNames: [],
      success: false,
      errorMessage: `Multiple servers available but no selection method specified. Use --all to select all servers, --server-name to select a specific server, or run in interactive mode. Available servers: ${availableServerNames.join(", ")}`,
    };
  }

  // Should not reach here, but fallback error
  return {
    selectedServerNames: [],
    success: false,
    errorMessage: "Unable to determine server selection",
  };
}
