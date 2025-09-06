// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import { CLI_LOGGER } from "../_deps.js";
import {
  CommonArguments,
  CommonOptions,
  HelpTextPatterns,
} from "../_utils/command-factory.js";
import { isInteractiveEnvironment } from "../_utils/interactive-prompts.js";
import { promptForConfirmationWithEscapeHandling } from "../_utils/navigation-prompts.js";
import { withConfigContextAndErrorHandling } from "../_utils/with-config-context-and-error-handling.js";

import {
  removeServerFromConfig,
  serverExistsInConfig,
} from "./server-logic.js";

import type {
  SettingsProject,
  SettingsUser,
} from "../../config/types/index.js";
import type { ConfigContext } from "../_utils/contexts/index.js";

/**
 * Creates the `server remove` command for removing servers from mcpadre configuration
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeServerRemoveCommand() {
  return new Command("remove")
    .description("Remove a server from the mcpadre configuration")
    .argument(CommonArguments.serverName, "Name of the server to remove")
    .option(...CommonOptions.yes)

    .addHelpText(
      "before",
      HelpTextPatterns.beforeHelp(
        "Removes a server from your mcpadre configuration file.",
        [
          "Project mode (default): Removes server from project mcpadre.yaml",
          "User mode (--user): Removes server from user configuration in $MCPADRE_USER_DIR or $HOME/.mcpadre",
          "",
          "The server must exist in the configuration file, or the command will fail.",
          "In interactive mode, you will be prompted for confirmation unless --yes is used.",
          "In non-interactive mode, --yes is required.",
        ]
      )
    )
    .addHelpText(
      "after",
      HelpTextPatterns.examples([
        "mcpadre server remove my-server        Remove server from project with confirmation",
        "mcpadre server remove my-server --yes  Remove server from project without confirmation",
        "mcpadre server remove my-server --user Remove server from user config with confirmation",
        "mcpadre server remove my-server --user --yes Remove server from user config without confirmation",
      ])
    )
    .action(
      withConfigContextAndErrorHandling(
        async (
          context: ConfigContext,
          config: SettingsProject | SettingsUser,
          serverName: string,
          options: {
            yes?: boolean;
          }
        ) => {
          const { yes = false } = options;

          // Check if server exists in config
          if (!serverExistsInConfig(config, serverName)) {
            CLI_LOGGER.error(
              `Server '${serverName}' not found in configuration`
            );
            process.exit(1);
          }

          // Handle confirmation logic
          const isInteractive = isInteractiveEnvironment();

          if (!yes && !isInteractive) {
            CLI_LOGGER.error(
              "Non-interactive mode requires --yes flag for confirmation"
            );
            CLI_LOGGER.error(`Use: mcpadre server remove ${serverName} --yes`);
            process.exit(1);
          }

          // Ask for confirmation in interactive mode if --yes not provided
          if (!yes && isInteractive) {
            const result = await promptForConfirmationWithEscapeHandling(
              `Are you sure you want to remove server '${serverName}'?`,
              false // Can't go back from single-step command
            );

            if (result.action === "exit" || result.action === "back") {
              // Both escape and Ctrl+C should exit for single-step command
              process.exit(1);
            }

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (result.action === "continue" && !result.value) {
              // User declined confirmation
              CLI_LOGGER.info("Server removal cancelled");
              process.exit(1);
            }
          }

          // Remove server from config
          const updatedConfig = removeServerFromConfig(config, serverName);

          // Write back to file using the context
          await context.writeConfig(updatedConfig);

          CLI_LOGGER.info(
            `Removed server '${serverName}' from ${context.type} configuration`
          );
          // eslint-disable-next-line no-console
          console.log(`Successfully removed server: ${serverName}`);
        }
      )
    );
}
