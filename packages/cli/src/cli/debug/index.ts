// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import { makeConnectHttpMcpCommand } from "./connect-http-mcp.js";

/**
 * Create the debug subcommand with nested debug utilities
 */
export function makeDebugCommand(): Command {
  return new Command("debug")
    .description("Debug tools for MCP development")
    .addCommand(makeConnectHttpMcpCommand());
}
