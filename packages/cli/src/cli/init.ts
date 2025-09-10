// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import { CLI_LOGGER } from "./_deps.js";

// TODO: Init command needs to be refactored to use WorkspaceContext architecture
// This is a temporary stub to get the build working

/**
 * Creates the mcpadre init command
 * TODO: This command needs to be completely rewritten to use the new WorkspaceContext architecture
 */
export function makeInitCommand(): Command {
  return new Command("init")
    .description(
      "Initialize a new mcpadre configuration file (TEMPORARILY DISABLED)"
    )
    .action(async () => {
      CLI_LOGGER.error(
        "The init command is temporarily disabled during refactoring."
      );
      CLI_LOGGER.error(
        "Please manually create a mcpadre.yaml file or use a different approach."
      );
      CLI_LOGGER.error("This will be fixed in a future update.");
      process.exit(1);
    });
}
