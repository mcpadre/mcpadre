// pattern: Functional Core

import type { McpServerV1 } from "../../config/types/v1/server/index.js";

/**
 * Transforms mcpadre server configurations into standardized command format
 * All servers are redirected to use "mcpadre run <server-name>" regardless of their original type
 *
 * This is the core of mcpadre's centralization strategy - hosts don't communicate with
 * MCP servers directly, they communicate with mcpadre which handles the actual server connection.
 */
export interface TransformedServer {
  name: string;
  command: string;
  args: string[];
}

/**
 * Transforms a record of mcpadre servers into standardized command format
 * @param servers Record of server configurations from mcpadre project config
 * @returns Array of transformed server configurations for host consumption
 */
export function transformServersForHost(
  servers: Record<string, McpServerV1>
): TransformedServer[] {
  return Object.keys(servers).map(serverName => ({
    name: serverName,
    command: "mcpadre",
    args: ["run", serverName],
  }));
}

/**
 * Creates a record mapping server names to transformed configurations
 * Useful when host updaters need key-value access to server configs
 * @param servers Record of server configurations from mcpadre project config
 * @returns Record mapping server names to transformed server configs
 */
export function transformServersAsRecord(
  servers: Record<string, McpServerV1>
): Record<string, Omit<TransformedServer, "name">> {
  // Reuse array transformation logic then convert to record format
  return Object.fromEntries(
    transformServersForHost(servers).map(server => [
      server.name,
      { command: server.command, args: server.args },
    ])
  );
}
