// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import { writeSettingsProjectToFile } from "../../config/writers/settings-project-writer.js";
import { writeSettingsUserToFile } from "../../config/writers/settings-user-writer.js";
import { CLI_LOGGER } from "../_deps.js";
import { withConfigContextAndErrorHandling } from "../_utils/with-config-context-and-error-handling.js";

import {
  addHostToConfig,
  getSimilarHosts,
  isHostEnabled,
  isValidHost,
} from "./host-logic.js";

import type {
  ProjectWorkspaceContext,
  UserWorkspaceContext,
  WorkspaceContext,
} from "../../config/types/index.js";

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
              // Import here to avoid circular dependency
              const { isUserCapableHost, SUPPORTED_HOSTS_V1 } = await import(
                "../../config/types/v1/hosts.js"
              );

              // Filter hosts based on current mode
              const availableHosts =
                context.workspaceType === "user"
                  ? SUPPORTED_HOSTS_V1.filter(isUserCapableHost)
                  : SUPPORTED_HOSTS_V1;

              CLI_LOGGER.info(`Supported hosts: ${availableHosts.join(", ")}`);
            }

            process.exit(1);
          }

          // Import host capability functions
          const {
            isUserCapableHost,
            isProjectCapableHost,
            SUPPORTED_HOSTS_V1,
          } = await import("../../config/types/v1/hosts.js");

          // Validate that host is capable of the current mode
          if (
            context.workspaceType === "user" &&
            !isUserCapableHost(hostName)
          ) {
            CLI_LOGGER.error(
              `Host '${hostName}' cannot be added to user configuration`
            );
            CLI_LOGGER.error(
              `Host '${hostName}' only supports project-level configuration`
            );

            const userCapableHosts =
              SUPPORTED_HOSTS_V1.filter(isUserCapableHost);
            CLI_LOGGER.error(
              `User-capable hosts: ${userCapableHosts.join(", ")}`
            );
            process.exit(1);
          }

          if (
            context.workspaceType === "project" &&
            !isProjectCapableHost(hostName)
          ) {
            CLI_LOGGER.error(
              `Host '${hostName}' cannot be added to project configuration`
            );
            CLI_LOGGER.error(
              `Host '${hostName}' only supports user-level configuration`
            );

            const projectCapableHosts =
              SUPPORTED_HOSTS_V1.filter(isProjectCapableHost);
            CLI_LOGGER.error(
              `Project-capable hosts: ${projectCapableHosts.join(", ")}`
            );
            process.exit(1);
          }

          // Get the target config to modify (not merged config)
          const targetConfig =
            context.workspaceType === "user"
              ? (context as UserWorkspaceContext).userConfig
              : (context as ProjectWorkspaceContext).projectConfig;

          // Check if already enabled (use merged config for checking)
          if (isHostEnabled(config, hostName)) {
            CLI_LOGGER.info(
              `Host '${hostName}' is already enabled in ${context.workspaceType} configuration`
            );
            return; // Exit code 0
          }

          // Add host to the target config (not merged)
          const updatedConfig = addHostToConfig(targetConfig, hostName);

          // Write updated config back to file
          const configPath =
            context.workspaceType === "user"
              ? (context as UserWorkspaceContext).userConfigPath
              : (context as ProjectWorkspaceContext).projectConfigPath;

          if (context.workspaceType === "user") {
            await writeSettingsUserToFile(configPath, updatedConfig);
          } else {
            await writeSettingsProjectToFile(configPath, updatedConfig);
          }

          CLI_LOGGER.info(
            `Added host '${hostName}' to ${context.workspaceType} configuration`
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
