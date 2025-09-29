// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import { writeSettingsProjectToFile } from "../../config/writers/settings-project-writer.js";
import { writeSettingsUserToFile } from "../../config/writers/settings-user-writer.js";
import { HOST_CONFIGS } from "../../installer/config/host-configs.js";
import { CLI_LOGGER } from "../_deps.js";
import {
  CommonArguments,
  HelpTextPatterns,
} from "../_utils/command-factory.js";
import { withConfigContextAndErrorHandling } from "../_utils/with-config-context-and-error-handling.js";

import {
  getSimilarHosts,
  isHostEnabled,
  isValidHost,
  removeHostFromConfig,
} from "./host-logic.js";

import type {
  ProjectWorkspaceContext,
  UserWorkspaceContext,
  WorkspaceContext,
} from "../../config/types/index.js";

/**
 * Creates the `host remove` command for removing hosts from mcpadre configuration
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeHostRemoveCommand() {
  return new Command("remove")
    .description("Remove a host from the mcpadre configuration")
    .argument(CommonArguments.hostName, "Name of the host to remove")

    .addHelpText(
      "before",
      HelpTextPatterns.beforeHelp(
        "Removes a host from your mcpadre configuration file, disabling it for installation.",
        [
          "Project mode (default): Removes host from project mcpadre.yaml",
          "User mode (--user): Removes host from user configuration in $MCPADRE_USER_DIR or $HOME/.mcpadre",
          "",
          "The host will be removed from the 'hosts' section. If no hosts remain,",
          "the entire 'hosts' section will be removed from the configuration.",
        ]
      )
    )
    .addHelpText(
      "after",
      HelpTextPatterns.examples([
        "mcpadre host remove cursor        Remove Cursor from project configuration",
        "mcpadre host remove zed           Remove Zed from project configuration",
        "mcpadre host remove claude-code   Remove Claude Code from project configuration",
        "mcpadre host remove cursor --user Remove Cursor from user configuration",
        "mcpadre host remove claude-code --user Remove Claude Code from user configuration",
      ])
    )
    .action(
      withConfigContextAndErrorHandling(
        async (
          context: WorkspaceContext,
          _config: WorkspaceContext["mergedConfig"],
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

          // Import host capability functions for mode validation
          const { isUserCapableHost, isProjectCapableHost } = await import(
            "../../config/types/v1/hosts.js"
          );

          // Validate that host is capable of the current mode
          if (
            context.workspaceType === "user" &&
            !isUserCapableHost(hostName)
          ) {
            CLI_LOGGER.error(
              `Host '${hostName}' cannot be removed from user configuration`
            );
            CLI_LOGGER.error(
              `Host '${hostName}' only supports project-level configuration`
            );
            process.exit(1);
          }

          if (
            context.workspaceType === "project" &&
            !isProjectCapableHost(hostName)
          ) {
            CLI_LOGGER.error(
              `Host '${hostName}' cannot be removed from project configuration`
            );
            CLI_LOGGER.error(
              `Host '${hostName}' only supports user-level configuration`
            );
            process.exit(1);
          }

          // Get the target config to modify (not merged config)
          const targetConfig =
            context.workspaceType === "user"
              ? (context as UserWorkspaceContext).userConfig
              : (context as ProjectWorkspaceContext).projectConfig;

          // Check if host is not present (use target config for checking)
          if (!isHostEnabled(targetConfig, hostName)) {
            CLI_LOGGER.info(
              `Host '${hostName}' is not enabled in ${context.workspaceType} configuration (or already removed)`
            );
            return; // Exit code 0
          }

          // Remove host from the target config (not merged)
          const updatedConfig = removeHostFromConfig(targetConfig, hostName);

          // Write the updated configuration back to the file
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
            `Removed host '${hostName}' from ${context.workspaceType} configuration`
          );

          // Get the config file path for this host
          const hostConfig = HOST_CONFIGS[hostName];

          // Only reference config path for project mode or when it makes sense
          if (context.workspaceType === "project") {
            const hostConfigPath = hostConfig.projectConfigPath;
            if (hostConfigPath) {
              CLI_LOGGER.info(
                `mcpadre will no longer manage '${hostConfigPath}' for ${hostName}`
              );
            }
          }
        }
      )
    );
}
