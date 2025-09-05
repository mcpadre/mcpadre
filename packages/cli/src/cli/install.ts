// pattern: Imperative Shell

import { Command, Option } from "@commander-js/extra-typings";

import { withConfigContextAndErrorHandling } from "../cli-helpers/with-config-context-and-error-handling.js";
import { loadUserConfig } from "../config/loaders/settings-user-loader.js";
import { mergeUserProjectConfig } from "../config/mergers/user-project-merger.js";
import {
  installForAllEnabledHosts,
  installForAllEnabledUserHosts,
} from "../installer/installer.js";

import { CLI_LOGGER } from "./_deps.js";

import type { SettingsProject, SettingsUser } from "../config/types/index.js";
import type { BulkInstallResult } from "../installer/installer.js";
import type { ConfigContext } from "./contexts/index.js";

/**
 * Creates the install command for setting up host configurations
 */
export function makeInstallCommand(): Command {
  return new Command("install")
    .description("Install mcpadre configuration for MCP host applications")
    .addHelpText(
      "before",
      `
Generates host-specific MCP configuration files for all enabled hosts in your mcpadre config.

This command installs configuration files for MCP host applications where hosts[hostName]: true:
  • claude-code: Creates ~/.mcp.json for Claude Code
  • cursor: Creates ~/.cursor/mcp.json for Cursor
  • zed: Creates ~/.zed/settings.json (preserves existing user settings)
  • vscode: Creates ~/.vscode/mcp.json for VS Code

All configurations redirect MCP server connections to use 'mcpadre run <server-name>' 
instead of connecting directly to servers, enabling centralized management.

Specify which hosts to install for in your mcpadre config:
  hosts:
    cursor: true      # Install for Cursor
    zed: true         # Install for Zed
    claude-code: false # Explicitly disabled
    # vscode not listed = disabled by default

The command automatically adds most config files to .gitignore (except Zed settings).

Use the --user flag to install for user-level configuration instead of project configuration.
User-level installations update the global host config files with mcpadre servers from your
user mcpadre.yaml, allowing you to use the same servers across all projects.
    `
    )
    .addHelpText(
      "after",
      `
Examples:
  mcpadre install                       Install for all project-enabled hosts
  mcpadre install --user                Install for all user-enabled hosts
  mcpadre install --skip-gitignore      Skip .gitignore management
  mcpadre install --force               Force upgrades even with version changes

Note: Zed settings are never added to .gitignore as they contain user preferences.
    `
    )
    .addOption(
      new Option(
        "--skip-gitignore",
        "Skip adding host config files to .gitignore"
      ).default(false)
    )
    .addOption(
      new Option(
        "--force",
        "Force upgrades even when package versions change (overrides installImplicitlyUpgradesChangedPackages setting)"
      ).default(false)
    )
    .action(
      withConfigContextAndErrorHandling(
        async (
          context: ConfigContext,
          config: SettingsProject | SettingsUser,
          options: { skipGitignore?: boolean; force?: boolean },
          command: Command
        ) => {
          const parentOptions = command.parent?.opts() ?? {};
          const { skipGitignore, force = false } = options;

          CLI_LOGGER.info(
            `Installing configuration for enabled hosts in ${context.type} mode...`
          );

          if (context.type === "user") {
            // User-level installation
            const result = await installForAllEnabledUserHosts({
              config: config as SettingsUser,
              userDir: context.getTargetDir(),
              force,
              logger: CLI_LOGGER,
            });

            // Handle the installation result
            handleInstallResult(result, parentOptions);
          } else {
            // Project-level installation
            // Load user config and merge host settings to respect user overrides
            let mergedConfig = config as SettingsProject;
            try {
              const userConfigResult = await loadUserConfig();

              if (userConfigResult.configPath) {
                // Real user config found - merge with project config
                const merged = mergeUserProjectConfig(
                  userConfigResult.config,
                  config as SettingsProject
                );
                mergedConfig = merged;
                CLI_LOGGER.debug(
                  "Using merged user-project configuration for host priorities"
                );
              } else {
                CLI_LOGGER.debug(
                  "No user config found, using project-only configuration"
                );
              }
            } catch {
              // User config is optional for project installs, continue with project-only
              CLI_LOGGER.debug(
                "Failed to load user config, continuing with project-only configuration"
              );
            }

            const result = await installForAllEnabledHosts({
              config: mergedConfig,
              projectDir: context.getTargetDir(),
              skipGitignore: skipGitignore ?? false,
              force,
              logger: CLI_LOGGER,
            });

            // Handle the installation result
            handleInstallResult(result, parentOptions);
          }
        }
      )
    );
}

/**
 * Handle and display the installation result
 */
function handleInstallResult(
  result: BulkInstallResult,
  parentOptions: Record<string, unknown>
): void {
  // Handle case where no hosts are enabled - warning but not error
  if (result.enabledHosts.length === 0) {
    CLI_LOGGER.warn("No hosts are enabled for installation.");
    CLI_LOGGER.info("Add hosts to your mcpadre config to enable installation:");
    CLI_LOGGER.info("  hosts:");
    CLI_LOGGER.info("    cursor: true");
    CLI_LOGGER.info("    zed: true");
    CLI_LOGGER.info("    claude-code: true");
    CLI_LOGGER.info("    vscode: true");
    return;
  }

  CLI_LOGGER.info(
    `Installed for ${result.enabledHosts.length} host(s): ${result.enabledHosts.join(", ")}`
  );
  CLI_LOGGER.info(
    `Created ${result.filesCreated} file(s) and updated ${result.filesUpdated} file(s)`
  );
  CLI_LOGGER.info(
    `Configured ${result.totalServers} server(s) across all hosts`
  );

  // Show gitignore info only if any host actually updated gitignore
  const gitignoreUpdated = Object.values(result.results).some(
    r => r.gitignoreUpdated
  );
  if (gitignoreUpdated) {
    CLI_LOGGER.info("Updated .gitignore");
  }

  // Aggregate and report analysis results across all hosts
  const allExternalServers = new Set<string>();
  const allOrphanedServers = new Set<string>();
  const allOrphanedDirectories = new Set<string>();

  for (const installResult of Object.values(result.results)) {
    installResult.analysis.external.forEach(s => allExternalServers.add(s));
    installResult.analysis.mcpadreOrphaned.forEach(s =>
      allOrphanedServers.add(s)
    );
    installResult.directoryAnalysis.orphanedDirectories.forEach(d =>
      allOrphanedDirectories.add(d)
    );
  }

  // Summary reporting for external servers
  if (allExternalServers.size > 0) {
    CLI_LOGGER.info(
      `Found ${allExternalServers.size} external server(s) across all hosts that could be managed by mcpadre`
    );
  }

  // Summary reporting for orphaned servers
  if (allOrphanedServers.size > 0) {
    CLI_LOGGER.info(
      `Cleaned up ${allOrphanedServers.size} orphaned mcpadre server(s) from host configs`
    );
  }

  // Summary reporting for orphaned directories
  if (allOrphanedDirectories.size > 0) {
    CLI_LOGGER.info(
      `Found ${allOrphanedDirectories.size} orphaned server director(ies) that may need manual cleanup`
    );
  }

  // Special note about Zed if it was installed
  if (result.enabledHosts.includes("zed")) {
    CLI_LOGGER.info(
      "Note: Zed settings are not added to .gitignore (contains user preferences)"
    );
  }

  // Debug logging if enabled
  if ("logLevel" in parentOptions) {
    const logLevel = parentOptions["logLevel"] as string;
    if (logLevel === "debug") {
      CLI_LOGGER.debug({ result }, "Install result");
    }
  }
}
