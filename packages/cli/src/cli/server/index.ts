// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import { makeServerAddCommand } from "./add.js";
import { makeServerRemoveCommand } from "./remove.js";

/**
 * Creates the main `server` command with add/remove subcommands
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeServerCommand() {
  return new Command("server")
    .description("Manage MCP servers in the configuration")
    .addHelpText(
      "before",
      `
Manage MCP servers in your mcpadre configuration file.

Available subcommands:
  • add     Add servers from ServerSpec files or package registries
  • remove  Remove a server from the configuration
      `
    )
    .addHelpText(
      "after",
      `
Examples:
  mcpadre server add                      Interactive registry selection
  mcpadre server add servers.json         Add servers interactively from file
  mcpadre server add servers.yaml --all   Add all servers from file
  mcpadre server remove my-server         Remove server with confirmation
  mcpadre server remove my-server --yes   Remove server without confirmation

Global Flags:
  --no-parent   Only search for config in current directory
  -d, --dir     Override workspace directory
      `
    )
    .addCommand(makeServerAddCommand())
    .addCommand(makeServerRemoveCommand());
}
