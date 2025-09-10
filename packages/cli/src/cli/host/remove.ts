// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

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

import type { WorkspaceContext } from "../../config/types/index.js";

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

          // Skip validation for remove - we'll just check if it's present

          // Check if host is not present
          if (!isHostEnabled(config, hostName)) {
            CLI_LOGGER.info(
              `Host '${hostName}' is not enabled in ${context.workspaceType} configuration (or already removed)`
            );
            return; // Exit code 0
          }

          // Remove host from config
          const _updatedConfig = removeHostFromConfig(config, hostName);
          void _updatedConfig; // Placeholder for Phase 4 config writing

          // TODO: Config writing will be implemented in Phase 4
          CLI_LOGGER.warn("Config writing not yet implemented - placeholder");

          CLI_LOGGER.info(
            `Would remove host '${hostName}' from ${context.workspaceType} configuration`
          );

          // Get the config file path for this host
          const hostConfig = HOST_CONFIGS[hostName];

          // Only reference config path for project mode or when it makes sense
          // Claude-desktop has no project config, and user configs are managed elsewhere
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
