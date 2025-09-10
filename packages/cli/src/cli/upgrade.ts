// pattern: Imperative Shell
// CLI command for upgrading MCP servers

import { Command } from "@commander-js/extra-typings";

import { upgradeServers } from "../installer/upgrader/index.js";

import {
  isInteractiveEnvironment,
  promptForConfirmation,
} from "./_utils/interactive-prompts.js";
import { withConfigContextAndErrorHandling } from "./_utils/with-config-context-and-error-handling.js";
import { CLI_LOGGER } from "./_deps.js";

import type {
  SettingsProject,
  SettingsUser,
  WorkspaceContext,
} from "../config/types/index.js";
import type { UpgradeOptions } from "../installer/upgrader/types.js";

interface UpgradeCommandOptions {
  all: boolean;
  yes: boolean;
  skipAudit: boolean;
}

/**
 * Create the 'mcpadre upgrade' command
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeUpgradeCommand() {
  return new Command("upgrade")
    .description("Upgrade MCP servers to their latest versions")
    .addHelpText(
      "before",
      `
Upgrades MCP servers to their latest available versions and updates configuration files.

By default, upgrades servers in the current project. Use --user to upgrade user-level servers instead.
After upgrading server packages, also updates global host configurations if applicable.
      `
    )
    .addHelpText(
      "after",
      `
Examples:
  mcpadre upgrade --all                    Upgrade all project servers
  mcpadre upgrade --user --all             Upgrade all user servers
  mcpadre upgrade server1 server2          Upgrade specific project servers
  mcpadre upgrade --user server1           Upgrade specific user server
  mcpadre upgrade --all --yes              Skip confirmation prompts
      `
    )
    .argument("[server-names...]", "Specific server names to upgrade")
    .option("--all", "Upgrade all outdated servers", false)
    .option("--yes", "Skip confirmation prompts", false)
    .option("--skip-audit", "Skip post-upgrade security audits", false)
    .action(withConfigContextAndErrorHandling(handleUpgrade));
}

/**
 * Handle upgrade for both user and project modes
 */
async function handleUpgrade(
  context: WorkspaceContext,
  config: SettingsProject | SettingsUser,
  serverNames: string[],
  options: UpgradeCommandOptions
): Promise<void> {
  const mode = context.workspaceType === "user" ? "user" : "project";
  CLI_LOGGER.info(`Upgrading ${mode} servers...`);

  await runUpgradeLogic(
    config,
    context.workspaceDir,
    serverNames,
    options,
    mode
  );
}

/**
 * Execute the upgrade command logic
 */
async function runUpgradeLogic(
  config: SettingsProject | SettingsUser,
  workingDir: string,
  serverNames: string[],
  options: UpgradeCommandOptions,
  mode: "project" | "user"
): Promise<void> {
  CLI_LOGGER.debug(`Starting upgrade in ${workingDir} (${mode} mode)`);

  // Validate command line arguments
  if (!options.all && serverNames.length === 0 && isInteractiveEnvironment()) {
    // Interactive mode - will show table and prompt for selections
    CLI_LOGGER.debug("Running in interactive mode");
    // TODO: implement interactive mode
    CLI_LOGGER.error("Interactive mode not yet implemented");
    process.exit(1);
  }

  // Non-interactive mode validation
  if (!options.all && serverNames.length === 0) {
    CLI_LOGGER.error(
      "No servers specified. Use --all or specify server names."
    );
    process.exit(1);
  }

  // Non-TTY environments require --yes flag
  if (!isInteractiveEnvironment() && !options.yes) {
    CLI_LOGGER.error(
      "Non-interactive environment detected. Use --yes to confirm upgrades."
    );
    process.exit(1);
  }

  // Build upgrade options
  const upgradeOptions: UpgradeOptions = {
    upgradeAll: options.all,
    serverNames,
    skipConfirmation: options.yes,
    skipAudit: options.skipAudit,
  };

  // For TTY without --yes, show confirmation prompt
  if (isInteractiveEnvironment() && !options.yes) {
    const serverList = options.all
      ? "all outdated servers"
      : serverNames.join(", ");
    const confirmed = await promptForConfirmation(`Upgrade ${serverList}?`);

    if (!confirmed) {
      CLI_LOGGER.info("Upgrade cancelled");
      process.exit(0);
    }
  }

  try {
    // Execute the upgrade
    const result = await upgradeServers(
      config,
      workingDir,
      upgradeOptions,
      CLI_LOGGER,
      mode
    );

    // Display results
    if (result.successful.length > 0) {
      CLI_LOGGER.info(
        `✅ Successfully upgraded ${result.successful.length} servers:`
      );
      for (const server of result.successful) {
        CLI_LOGGER.info(
          `   ${server.serverName}: ${server.oldVersion} → ${server.newVersion}`
        );
      }
    }

    if (result.failed.length > 0) {
      CLI_LOGGER.error(`❌ Failed to upgrade ${result.failed.length} servers:`);
      for (const failure of result.failed) {
        CLI_LOGGER.error(`   ${failure.serverName}: ${failure.error}`);
      }
    }

    if (result.warnings.length > 0) {
      CLI_LOGGER.warn(`⚠️  Warnings during upgrade:`);
      for (const warning of result.warnings) {
        CLI_LOGGER.warn(`   ${warning.serverName}: ${warning.message}`);
      }
    }

    // Exit with error code if any failures occurred
    if (result.failed.length > 0) {
      process.exit(1);
    }

    CLI_LOGGER.info("Upgrade completed successfully");
  } catch (error) {
    CLI_LOGGER.error("Upgrade failed:");
    CLI_LOGGER.error(error);
    process.exit(1);
  }
}
