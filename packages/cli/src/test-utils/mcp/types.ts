// pattern: Functional Core
// MCP (Model Context Protocol) type definitions

/**
 * MCP protocol initialization state
 */
export enum McpState {
  WaitingForInitialize = "waiting_for_initialize",
  Initialized = "initialized",
}

/**
 * Client information provided during initialization
 */
export interface McpClientInfo {
  /** Client name identifier */
  name: string;
  /** Client version string */
  version: string;
}

/**
 * Server information returned during initialization
 */
export interface McpServerInfo {
  /** Server name identifier */
  name: string;
  /** Server version string */
  version: string;
}

/**
 * MCP capabilities structure for client or server
 */
export interface McpCapabilities {
  /** Tools capability configuration */
  tools?: Record<string, unknown>;
  /** Resources capability configuration */
  resources?: Record<string, unknown>;
}

/**
 * MCP initialize request parameters
 */
export interface McpInitializeParams {
  /** MCP protocol version */
  protocolVersion: string;
  /** Client capabilities */
  capabilities: McpCapabilities;
  /** Client information */
  clientInfo: McpClientInfo;
}

/**
 * MCP initialize response result
 */
export interface McpInitializeResult {
  /** MCP protocol version supported by server */
  protocol_version: string;
  /** Server capabilities */
  capabilities: McpCapabilities;
  /** Server information */
  server_info: McpServerInfo;
}

/**
 * MCP tools/list response result
 */
export interface McpToolsListResult {
  /** Array of available tools */
  tools: unknown[];
}

/**
 * MCP resources/list response result
 */
export interface McpResourcesListResult {
  /** Array of available resources */
  resources: unknown[];
}

/**
 * Echo response result for non-protocol methods
 */
export interface McpEchoResult {
  /** Echoed method name from the request */
  method: string;
}

/**
 * MCP protocol version constant
 */
export const MCP_PROTOCOL_VERSION = "2024-11-05";

/**
 * Standard MCP method names
 */
export const McpMethods = {
  INITIALIZE: "initialize",
  TOOLS_LIST: "tools/list",
  RESOURCES_LIST: "resources/list",
} as const;

/**
 * Type for MCP method names
 */
export type McpMethodName = (typeof McpMethods)[keyof typeof McpMethods];

/**
 * Create default server capabilities
 */
export function createDefaultCapabilities(): McpCapabilities {
  return {
    tools: {},
    resources: {},
  };
}

/**
 * Create server info object
 */
export function createServerInfo(name: string, version: string): McpServerInfo {
  return {
    name,
    version,
  };
}

/**
 * Create MCP initialize result
 */
export function createInitializeResult(
  serverName: string,
  serverVersion: string,
  capabilities?: McpCapabilities
): McpInitializeResult {
  return {
    protocol_version: MCP_PROTOCOL_VERSION,
    capabilities: capabilities ?? createDefaultCapabilities(),
    server_info: createServerInfo(serverName, serverVersion),
  };
}

/**
 * Create tools list result
 */
export function createToolsListResult(): McpToolsListResult {
  return {
    tools: [],
  };
}

/**
 * Create resources list result
 */
export function createResourcesListResult(): McpResourcesListResult {
  return {
    resources: [],
  };
}

/**
 * Create echo result for non-protocol methods
 */
export function createEchoResult(method: string): McpEchoResult {
  return {
    method,
  };
}
