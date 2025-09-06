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

import type {
  SettingsProject,
  SettingsUser,
} from "../../config/types/index.js";
import type { ConfigContext } from "../_utils/contexts/index.js";

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
          context: ConfigContext,
          config: SettingsProject | SettingsUser,
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
                `Supported hosts: ${context.getSupportedHosts().join(", ")}`
              );
            }

            process.exit(1);
          }

          // Validate that host is capable of the current mode
          if (!context.isHostCapable(hostName)) {
            CLI_LOGGER.error(
              `Host '${hostName}' cannot be added to ${context.type} configuration`
            );
            CLI_LOGGER.error(
              `Host '${hostName}' only supports ${context.type === "user" ? "project" : "user"}-level configuration`
            );
            CLI_LOGGER.error(
              `${context.type}-capable hosts: ${context.getSupportedHosts().join(", ")}`
            );
            process.exit(1);
          }

          // Check if already enabled
          if (isHostEnabled(config, hostName)) {
            CLI_LOGGER.info(
              `Host '${hostName}' is already enabled in ${context.type} configuration`
            );
            return; // Exit code 0
          }

          // Add host to config
          const updatedConfig = addHostToConfig(config, hostName);

          // Write back to file using the context
          await context.writeConfig(updatedConfig);

          CLI_LOGGER.info(
            `Added host '${hostName}' to ${context.type} configuration`
          );
          CLI_LOGGER.info(
            `Run '${context.getInstallCommand()}' to generate MCP configuration files for enabled hosts`
          );
        }
      )
    );
}
