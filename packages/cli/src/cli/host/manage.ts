// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import {
  type ProjectWorkspaceContext,
  type UserWorkspaceContext,
} from "../../config/types/index.js";
import { writeSettingsProjectToFile } from "../../config/writers/settings-project-writer.js";
import { writeSettingsUserToFile } from "../../config/writers/settings-user-writer.js";
import { CLI_LOGGER } from "../_deps.js";
import {
  applyHostChanges,
  getEnabledHostsDisplay,
  promptMultiHostToggle,
} from "../_utils/multi-host-toggle.js";
import { withConfigContextAndErrorHandling } from "../_utils/with-config-context-and-error-handling.js";

import type {
  SettingsProject,
  SettingsUser,
  WorkspaceContext,
} from "../../config/types/index.js";

/**
 * Unified logic for host manage functionality using workspace context
 */
async function hostManageLogic(context: WorkspaceContext): Promise<void> {
  // Use original config from context, not merged config
  const config =
    context.workspaceType === "user"
      ? (context as UserWorkspaceContext).userConfig
      : (context as ProjectWorkspaceContext).projectConfig;
  try {
    CLI_LOGGER.info("Starting interactive host management...");

    const isUserConfig = context.workspaceType === "user";
    const currentlyEnabled = getEnabledHostsDisplay(config, isUserConfig);
    if (currentlyEnabled.length > 0) {
      CLI_LOGGER.info(`Currently enabled: ${currentlyEnabled.join(", ")}`);
    } else {
      CLI_LOGGER.info("No hosts currently enabled");
    }

    const configType = context.workspaceType;
    const result = await promptMultiHostToggle(config, {
      message: `Select which MCP hosts should be enabled in ${configType} configuration:`,
      helpText:
        "Use spacebar to toggle, arrow keys to navigate, Enter to confirm",
      // Pass the user mode flag to filter hosts appropriately
      isUserMode: isUserConfig,
    });

    if (result.cancelled) {
      CLI_LOGGER.info("Host management cancelled");
      process.exit(1);
    }

    // Check if any changes were made
    const { enabled, disabled } = result.changes;
    if (enabled.length === 0 && disabled.length === 0) {
      CLI_LOGGER.info("No changes made to host configuration");
      return;
    }

    // Apply changes to configuration
    const updatedConfig = applyHostChanges(config, result.changes);

    // Write back to file
    const configPath =
      context.workspaceType === "user"
        ? (context as UserWorkspaceContext).userConfigPath
        : (context as ProjectWorkspaceContext).projectConfigPath;

    if (isUserConfig) {
      await writeSettingsUserToFile(configPath, updatedConfig as SettingsUser);
    } else {
      await writeSettingsProjectToFile(
        configPath,
        updatedConfig as SettingsProject
      );
    }

    // Report changes
    if (enabled.length > 0) {
      CLI_LOGGER.info(`Enabled hosts: ${enabled.join(", ")}`);
    }
    if (disabled.length > 0) {
      CLI_LOGGER.info(`Disabled hosts: ${disabled.join(", ")}`);
    }

    const totalChanges = enabled.length + disabled.length;
    CLI_LOGGER.info(
      `Successfully updated ${totalChanges} host${totalChanges > 1 ? "s" : ""} in ${configType} configuration`
    );

    // Show final status
    const finalEnabled = getEnabledHostsDisplay(updatedConfig, isUserConfig);
    if (finalEnabled.length > 0) {
      CLI_LOGGER.info(`Active hosts: ${finalEnabled.join(", ")}`);
      CLI_LOGGER.info(
        "Run 'mcpadre install' to generate MCP configuration files for enabled hosts"
      );
    } else {
      CLI_LOGGER.info("No hosts are currently enabled");
      CLI_LOGGER.info(
        `Run 'mcpadre host add <host-name>${isUserConfig ? " --user" : ""}' to enable individual hosts`
      );
    }
  } catch (error) {
    // Handle user cancellation (Ctrl+C) gracefully
    if (
      error instanceof Error &&
      (error.message.includes("User force closed the prompt") ||
        error.message.includes("force closed"))
    ) {
      // Silent exit on user cancellation
      process.exit(1);
    }

    CLI_LOGGER.error("Failed to manage hosts:");
    if (error instanceof Error) {
      CLI_LOGGER.error(`    ${error.message}`);
    } else {
      CLI_LOGGER.error(error);
    }
    process.exit(1);
  }
}

/**
 * Creates the `host manage` command for managing multiple hosts at once
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeHostManageCommand() {
  return new Command("manage")
    .description("Manage multiple hosts with interactive toggles")

    .addHelpText(
      "before",
      `
Interactively enable or disable multiple MCP hosts at once using checkboxes.

Project mode (default): Manages hosts in project mcpadre.yaml
User mode (--user): Manages hosts in user configuration in $MCPADRE_USER_DIR or $HOME/.mcpadre

This provides a convenient way to manage which MCP clients will receive 
mcpadre-generated configurations when you run 'mcpadre install'.

The interface shows all supported hosts with their current enabled status,
allowing you to easily toggle multiple hosts on/off in a single operation.
      `
    )
    .addHelpText(
      "after",
      `
Examples:
  mcpadre host manage                    Interactive multi-host selection for project
  mcpadre host manage --user             Interactive multi-host selection for user config
  
Supported hosts for project:
  • Claude Code
  • Cursor  
  • opencode
  • Zed
  • Visual Studio Code

Supported hosts for user config:
  • Claude Code
  • Claude Desktop
  • Cursor  
  • opencode

Use spacebar to toggle hosts, arrow keys to navigate, and Enter to confirm.
Press Escape or Ctrl+C to cancel without making changes.
      `
    )
    .action(withConfigContextAndErrorHandling(hostManageLogic));
}
