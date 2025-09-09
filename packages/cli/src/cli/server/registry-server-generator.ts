// pattern: Functional Core

import type {
  ContainerMcpServer,
  NodeMcpServer,
  PythonMcpServer,
} from "../../config/types/index.js";
import type { RegistryType } from "./registry/types.js";

/**
 * Data needed to generate a server configuration from registry
 */
export interface RegistryServerData {
  /** Name to use for the server in the config */
  serverName: string;
  /** Type of registry */
  registryType: RegistryType;
  /** Package name from the registry */
  packageName: string;
  /** Selected version */
  version: string;
}

/**
 * Result of generating a server configuration
 */
export interface ServerGenerationResult {
  /** Server name */
  serverName: string;
  /** Generated server configuration */
  serverConfig: NodeMcpServer | PythonMcpServer | ContainerMcpServer;
}

/**
 * Generate a server configuration from registry data
 */
export function generateServerConfigFromRegistry(
  data: RegistryServerData
): ServerGenerationResult {
  switch (data.registryType) {
    case "node":
      return generateNodeServerConfig(data);

    case "python":
      return generatePythonServerConfig(data);

    case "container":
      return generateContainerServerConfig(data);

    default:
      throw new Error(`Unsupported registry type: ${data.registryType}`);
  }
}

/**
 * Generate Node.js MCP server configuration
 */
function generateNodeServerConfig(
  data: RegistryServerData
): ServerGenerationResult {
  const nodeConfig: NodeMcpServer = {
    node: {
      package: data.packageName,
      version: data.version,
    },
  };

  return {
    serverName: data.serverName,
    serverConfig: nodeConfig,
  };
}

/**
 * Generate Python MCP server configuration
 */
function generatePythonServerConfig(
  data: RegistryServerData
): ServerGenerationResult {
  const pythonConfig: PythonMcpServer = {
    python: {
      package: data.packageName,
      version: data.version,
    },
  };

  return {
    serverName: data.serverName,
    serverConfig: pythonConfig,
  };
}

/**
 * Generate Container MCP server configuration
 */
function generateContainerServerConfig(
  data: RegistryServerData
): ServerGenerationResult {
  const containerConfig: ContainerMcpServer = {
    container: {
      image: data.packageName,
      tag: data.version,
    },
  };

  return {
    serverName: data.serverName,
    serverConfig: containerConfig,
  };
}

/**
 * Generate a default server name from package name
 * Converts package names to valid server names by:
 * - Removing scopes (@org/package -> package)
 * - Converting to lowercase
 * - Replacing invalid characters with hyphens
 * - Ensuring uniqueness by appending numbers if needed
 */
export function generateDefaultServerName(
  packageName: string,
  existingServerNames: string[] = []
): string {
  // Remove scope if present
  let baseName = packageName.includes("/")
    ? (packageName.split("/").pop() ?? packageName)
    : packageName;

  // Convert to lowercase and replace invalid characters
  baseName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens

  // Ensure we have a valid name
  if (!baseName) {
    baseName = "mcp-server";
  }

  // Check for uniqueness
  let serverName = baseName;
  let counter = 1;

  while (existingServerNames.includes(serverName)) {
    counter++;
    serverName = `${baseName}-${counter}`;
  }

  return serverName;
}

/**
 * Validate that a server name is valid for mcpadre configuration
 */
export function validateServerName(name: string): boolean {
  // Must not be empty
  if (!name.trim()) {
    return false;
  }

  // Must contain only alphanumeric characters, hyphens, and underscores
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(name)) {
    return false;
  }

  // Must not start or end with hyphen or underscore
  if (
    name.startsWith("-") ||
    name.startsWith("_") ||
    name.endsWith("-") ||
    name.endsWith("_")
  ) {
    return false;
  }

  return true;
}
