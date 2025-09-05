// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import { withConfigContextAndErrorHandling } from "../../cli-helpers/with-config-context-and-error-handling.js";
import { HOST_CONFIGS } from "../../installer/config/host-configs.js";
import { CLI_LOGGER } from "../_deps.js";
import { CommonArguments, HelpTextPatterns } from "../utils/command-factory.js";

import {
  getSimilarHosts,
  isHostEnabled,
  isValidHost,
  removeHostFromConfig,
} from "./host-logic.js";

import type {
  SettingsProject,
  SettingsUser,
} from "../../config/types/index.js";
import type { ConfigContext } from "../contexts/index.js";

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

          // Validate that host is capable of the current mode for user configs
          if (!context.isHostCapable(hostName)) {
            CLI_LOGGER.error(
              `Host '${hostName}' cannot be removed from ${context.type} configuration`
            );
            CLI_LOGGER.error(
              `Host '${hostName}' only supports ${
                context.type === "user" ? "project" : "user"
              }-level configuration`
            );
            CLI_LOGGER.error(
              `${context.type}-capable hosts: ${context.getSupportedHosts().join(", ")}`
            );
            process.exit(1);
          }

          // Check if host is not present
          if (!isHostEnabled(config, hostName)) {
            CLI_LOGGER.info(
              `Host '${hostName}' is not enabled in ${context.type} configuration (or already removed)`
            );
            return; // Exit code 0
          }

          // Remove host from config
          const updatedConfig = removeHostFromConfig(config, hostName);

          // Write back to file using the context
          await context.writeConfig(updatedConfig);

          CLI_LOGGER.info(
            `Removed host '${hostName}' from ${context.type} configuration`
          );

          // Get the config file path for this host
          const hostConfig = HOST_CONFIGS[hostName];

          // Only reference config path for project mode or when it makes sense
          // Claude-desktop has no project config, and user configs are managed elsewhere
          if (context.type === "project") {
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
