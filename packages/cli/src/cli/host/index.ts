// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import { makeHostAddCommand } from "./add.js";
import { makeHostManageCommand } from "./manage.js";
import { makeHostRemoveCommand } from "./remove.js";

/**
 * Creates the host command for managing hosts in mcpadre configuration
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeHostCommand() {
  return new Command("host")
    .description("Manage hosts in mcpadre configuration")
    .addHelpText(
      "before",
      `
Manage which MCP host applications are enabled for mcpadre installation.

Hosts control which MCP clients (Cursor, Zed, Claude Code, etc.) will receive 
mcpadre-generated configurations when you run 'mcpadre install'.

Available subcommands:
  add     Add a host to the configuration
  manage  Manage multiple hosts with interactive toggles
  remove  Remove a host from the configuration
      `
    )
    .addHelpText(
      "after",
      `
Examples:
  mcpadre host add cursor           Enable Cursor for mcpadre install
  mcpadre host manage               Interactive multi-host management
  mcpadre host remove zed           Disable Zed from mcpadre install
  mcpadre host add claude-code      Enable Claude Code for mcpadre install

Supported hosts:
  • claude-code: Claude Code
  • cursor: Cursor  
  • opencode: OpenCode
  • zed: Zed
  • vscode: VS Code
      `
    )
    .addCommand(makeHostAddCommand())
    .addCommand(makeHostManageCommand())
    .addCommand(makeHostRemoveCommand());
}
