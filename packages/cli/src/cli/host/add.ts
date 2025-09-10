// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import { CLI_LOGGER } from "../_deps.js";
import { withConfigContextAndErrorHandling } from "../_utils/with-config-context-and-error-handling.js";

import {
  addHostToConfig,
  getSimilarHosts,
  isHostEnabled,
  isValidHost,
} from "./host-logic.js";

import type { WorkspaceContext } from "../../config/types/index.js";

/**
 * Creates the `host add` command for adding hosts to mcpadre configuration
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeHostAddCommand() {
  return new Command("add")
    .description("Add a host to the mcpadre configuration")
    .argument("<host-name>", "Name of the host to add")

    .addHelpText(
      "before",
      `
Adds a host to your mcpadre configuration file, enabling it for installation.

Project mode (default): Adds host to project mcpadre.yaml
User mode (--user): Adds host to user configuration in $MCPADRE_USER_DIR or $HOME/.mcpadre

Supported hosts:
  • claude-code: Claude Code (supports both project and user)
  • claude-desktop: Claude Desktop (user only)
  • cursor: Cursor (supports both project and user)
  • opencode: OpenCode (supports both project and user)
  • zed: Zed (project only)
  • vscode: VS Code (project only)

The host will be added to the 'hosts' section with a value of true.
      `
    )
    .addHelpText(
      "after",
      `
Examples:
  mcpadre host add cursor        Add Cursor to project configuration
  mcpadre host add zed           Add Zed to project configuration
  mcpadre host add claude-code   Add Claude Code to project configuration
  mcpadre host add claude-desktop --user  Add Claude Desktop to user configuration
  mcpadre host add cursor --user          Add Cursor to user configuration
      `
    )
    .action(
      withConfigContextAndErrorHandling(
        async (
          context: WorkspaceContext,
          config: WorkspaceContext["mergedConfig"],
          hostName: string
        ) => {
          // Validate host name
          if (!isValidHost(hostName)) {
            CLI_LOGGER.error(`Unsupported host: ${hostName}`);

            const similar = getSimilarHosts(hostName);
            if (similar.length > 0) {
              CLI_LOGGER.info(`Did you mean: ${similar.join(", ")}?`);
            } else {
              CLI_LOGGER.info(
                "Supported hosts: claude-code, cursor, zed, vscode, claude-desktop, opencode"
              );
            }

            process.exit(1);
          }

          // Validate that host is capable of the current mode
          const projectOnlyHosts = ["zed", "vscode"];
          const userOnlyHosts = ["claude-desktop"];

          if (
            context.workspaceType === "user" &&
            projectOnlyHosts.includes(hostName)
          ) {
            CLI_LOGGER.error(
              `Host '${hostName}' cannot be added to user configuration`
            );
            CLI_LOGGER.error(
              `Host '${hostName}' only supports project-level configuration`
            );
            process.exit(1);
          }

          if (
            context.workspaceType === "project" &&
            userOnlyHosts.includes(hostName)
          ) {
            CLI_LOGGER.error(
              `Host '${hostName}' cannot be added to project configuration`
            );
            CLI_LOGGER.error(
              `Host '${hostName}' only supports user-level configuration`
            );
            process.exit(1);
          }

          // Check if already enabled
          if (isHostEnabled(config, hostName)) {
            CLI_LOGGER.info(
              `Host '${hostName}' is already enabled in ${context.workspaceType} configuration`
            );
            return; // Exit code 0
          }

          // Add host to config
          const _updatedConfig = addHostToConfig(config, hostName);
          void _updatedConfig; // Placeholder for Phase 4 config writing

          // TODO: Config writing will be implemented in Phase 4
          // For now, we'll skip the actual file writing
          CLI_LOGGER.warn(
            "Config writing not yet implemented in Phase 3 - this is a placeholder"
          );

          CLI_LOGGER.info(
            `Would add host '${hostName}' to ${context.workspaceType} configuration`
          );
          const installCmd =
            context.workspaceType === "user"
              ? "mcpadre install --user"
              : "mcpadre install";
          CLI_LOGGER.info(
            `Run '${installCmd}' to generate MCP configuration files for enabled hosts`
          );
        }
      )
    );
}
