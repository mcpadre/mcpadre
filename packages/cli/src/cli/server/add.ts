// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import { DEFAULT_THEME, highlight } from "cli-highlight";
import { stringify as yamlStringify } from "yaml";

import {
  formatServerList,
  isInteractiveEnvironment,
  promptForConfirmation,
} from "../../cli-helpers/interactive-prompts.js";
import { runRegistryServerAddFlow } from "../../cli-helpers/registry-flow.js";
import { withConfigContextAndErrorHandling } from "../../cli-helpers/with-config-context-and-error-handling.js";
import {
  isRemoteSource,
  loadAndValidateRemoteServerSpec,
  RemoteServerSpecError,
} from "../../config/loaders/remote/index.js";
import { loadAndValidateServerSpec } from "../../config/loaders/serverspec-loader.js";
import { forceQuoteVersionStrings } from "../../utils/yaml-helpers.js";
import { CLI_LOGGER } from "../_deps.js";

import {
  runInteractiveServerAddFlow,
  selectServersNonInteractive,
} from "./interactive-flow.js";
import { addServersToConfig, getServerNamesFromSpec } from "./server-logic.js";

import type {
  ServerSpec,
  SettingsProject,
  SettingsUser,
} from "../../config/types/index.js";
import type { ConfigContext } from "../contexts/index.js";

/**
 * Highlights YAML content with custom colors for terminal display
 * @param yamlContent Raw YAML string to highlight
 * @returns Highlighted YAML string with custom colors
 */
function highlightYaml(yamlContent: string): string {
  const customTheme = {
    ...DEFAULT_THEME,
    keyword: chalk.cyan, // YAML keys (key:)
    number: chalk.yellow, // Numbers (42, 1.5)
    string: (text: string) => text, // Strings should be regular (no color)
    literal: chalk.yellow, // Literals (true, false, null, {}, [])
    "meta-string": (text: string) => text, // String content should be regular
  };

  return highlight(yamlContent, {
    language: "yaml",
    theme: customTheme,
  });
}

/**
 * Formats selected server configurations as YAML for display
 * @param serverSpec The ServerSpec containing server configurations
 * @param selectedServerNames Array of server names to include in output
 * @returns Formatted YAML string showing server configurations
 */
function formatServerConfigsAsYaml(
  serverSpec: ServerSpec,
  selectedServerNames: string[]
): string {
  const selectedConfigs: Record<string, unknown> = {};

  for (const serverName of selectedServerNames) {
    if (serverSpec.mcpServers[serverName]) {
      selectedConfigs[serverName] = serverSpec.mcpServers[serverName];
    }
  }

  // If multiple servers or user requested all, show full mcpServers block
  if (selectedServerNames.length > 1) {
    const configWithQuotedVersions = forceQuoteVersionStrings({
      mcpServers: selectedConfigs,
    });
    return yamlStringify(configWithQuotedVersions).trim();
  }

  // For single server, just show the server config with its key
  const serverName = selectedServerNames[0];
  if (!serverName || !selectedConfigs[serverName]) {
    return "# No server configuration found";
  }
  const singleServerConfig = { [serverName]: selectedConfigs[serverName] };
  const configWithQuotedVersions = forceQuoteVersionStrings(singleServerConfig);
  return yamlStringify(configWithQuotedVersions).trim();
}

/**
 * Creates the `server add` command for adding servers from a ServerSpec file
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeServerAddCommand() {
  return new Command("add")
    .description(
      "Add servers from a ServerSpec file to the mcpadre configuration"
    )
    .argument(
      "[file-path-or-url]",
      "Path to ServerSpec file or URL (JSON, YAML, or TOML). Supports local files, direct URLs, GitHub repos, and GitLab repos. If omitted, interactive registry selection is used."
    )
    .option("-a, --all", "Select all servers from the ServerSpec file")
    .option("-n, --server-name <n>", "Select a specific server by name")
    .option("-y, --yes", "Skip confirmation prompt")

    .addHelpText(
      "before",
      `
Adds servers to your mcpadre configuration from a ServerSpec file, URL, or package registries.

Project mode (default): Adds servers to project mcpadre.yaml
User mode (--user): Adds servers to user configuration in $MCPADRE_USER_DIR or $HOME/.mcpadre

FILE-BASED ADDITION:
Provide a local ServerSpec file path containing 'mcpServers' object.
Supported formats: JSON (.json), YAML (.yaml/.yml), TOML (.toml)

REMOTE URL ADDITION:
• Direct URLs: Link directly to a ServerSpec file (any supported format)
• GitHub repos: https://github.com/owner/repo - searches for ADD_THIS_MCP.* files
• GitLab repos: https://gitlab.com/owner/repo - searches for ADD_THIS_MCP.* files

REGISTRY-BASED ADDITION:  
Omit the file path to interactively add servers from package registries (NPM, PyPI, etc.)
NOTE: Registry-based addition requires an interactive terminal (TTY)

Server Selection:
  • If only one server exists: automatically selected
  • If --all is specified: all servers are selected
  • If --server-name is specified: only that server is selected
  • In interactive mode: checkbox prompt for selection
  • In non-interactive mode: requires --all or --server-name
      `
    )
    .addHelpText(
      "after",
      `
Examples:
  mcpadre server add                                               Interactive registry selection (TTY required)
  mcpadre server add servers.json                                 Interactive server selection from file
  mcpadre server add servers.yaml --all                           Add all servers from file
  mcpadre server add servers.toml -n my-server                    Add specific server from file
  mcpadre server add https://example.com/serverspec.yml           Add from direct URL
  mcpadre server add https://github.com/owner/repo --all          Add all from GitHub repo
  mcpadre server add https://gitlab.com/owner/repo -n my-server   Add specific server from GitLab repo
  mcpadre server add servers.json --all --yes                     Add all from file without confirmation
  mcpadre server add --user                                       Add server to user config via registry
  mcpadre server add servers.json --user --all                    Add all servers to user configuration
      `
    )
    .action(
      withConfigContextAndErrorHandling(
        async (
          context: ConfigContext,
          config: SettingsProject | SettingsUser,
          filePathOrUrl: string | undefined,
          options: {
            all?: boolean;
            serverName?: string;
            yes?: boolean;
          }
        ) => {
          const { all = false, serverName, yes = false } = options;

          // If no file path/URL provided, use registry flow
          if (!filePathOrUrl) {
            // Check if we're in a non-interactive environment
            if (!isInteractiveEnvironment()) {
              CLI_LOGGER.error(
                "Non-interactive mode requires a file path or URL for server addition"
              );
              CLI_LOGGER.error(
                "Usage: mcpadre server add <file-path-or-url> [options]"
              );
              CLI_LOGGER.error(
                "Or run in an interactive terminal to use registry selection"
              );
              process.exit(1);
            }

            try {
              CLI_LOGGER.info(
                "Starting interactive registry server addition..."
              );

              const flowResult = await runRegistryServerAddFlow(config);

              if (flowResult.cancelled) {
                CLI_LOGGER.info("Registry server addition cancelled");
                process.exit(1);
              }

              // Add the server to the configuration
              const updatedConfig = {
                ...config,
                mcpServers: {
                  ...config.mcpServers,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  [flowResult.serverName]: flowResult.serverConfig as any,
                },
              };

              // Write back to file using the context
              await context.writeConfig(updatedConfig);

              CLI_LOGGER.info("Successfully added server from registry:");
              CLI_LOGGER.info(formatServerList([flowResult.serverName]));

              // eslint-disable-next-line no-console
              console.log(
                `\nServer '${flowResult.serverName}' has been added to your configuration.`
              );

              // eslint-disable-next-line no-console
              console.log(
                `Run '${context.getInstallCommand()}' to install the new server dependencies.`
              );
              return;
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

              CLI_LOGGER.error("Failed to add server from registry:");
              if (error instanceof Error) {
                CLI_LOGGER.error(`    ${error.message}`);
              } else {
                CLI_LOGGER.error(error);
              }
              process.exit(1);
            }
          }

          try {
            // Load and validate ServerSpec from file or URL
            let serverSpec: ServerSpec;

            if (isRemoteSource(filePathOrUrl)) {
              CLI_LOGGER.debug(
                `Loading ServerSpec from remote URL: ${filePathOrUrl}`
              );
              const remoteResult =
                await loadAndValidateRemoteServerSpec(filePathOrUrl);
              serverSpec = remoteResult.serverSpec;
              CLI_LOGGER.debug(
                `Loaded ServerSpec from: ${remoteResult.sourceUrl}`
              );
            } else {
              CLI_LOGGER.debug(
                `Loading ServerSpec from local file: ${filePathOrUrl}`
              );
              serverSpec = await loadAndValidateServerSpec(filePathOrUrl);
            }
            const availableServerNames = getServerNamesFromSpec(serverSpec);

            CLI_LOGGER.debug(
              `Found ${availableServerNames.length} servers in ServerSpec`
            );

            let selectedServerNames: string[];

            // Determine server selection approach
            const isInteractive = isInteractiveEnvironment();

            if (
              !yes &&
              isInteractive &&
              !all &&
              !serverName &&
              availableServerNames.length > 1
            ) {
              // Use interactive state machine flow for multi-step process
              const flowResult = await runInteractiveServerAddFlow(
                serverSpec,
                availableServerNames
              );

              if (flowResult.cancelled) {
                process.exit(1);
              }

              selectedServerNames = flowResult.selectedServerNames;
            } else {
              // Use non-interactive logic for simple cases
              const selectionOptions: { all?: boolean; serverName?: string } = {
                all,
              };
              if (serverName !== undefined) {
                selectionOptions.serverName = serverName;
              }

              const selectionResult = selectServersNonInteractive(
                availableServerNames,
                selectionOptions
              );

              if (!selectionResult.success) {
                CLI_LOGGER.error(
                  selectionResult.errorMessage ?? "No servers selected"
                );
                process.exit(1);
              }

              selectedServerNames = selectionResult.selectedServerNames;

              // Show auto-selection message if single server was auto-selected
              if (
                !all &&
                !serverName &&
                availableServerNames.length === 1 &&
                selectedServerNames.length === 1
              ) {
                // eslint-disable-next-line no-console
                console.log(`Auto-selected server: ${selectedServerNames[0]}`);
              }

              // Handle confirmation for non-interactive or simple cases
              if (!yes && isInteractiveEnvironment()) {
                const yamlConfig = formatServerConfigsAsYaml(
                  serverSpec,
                  selectedServerNames
                );
                const highlightedYaml = highlightYaml(yamlConfig);

                CLI_LOGGER.info("Server configuration to be added:");
                // eslint-disable-next-line no-console
                console.log(highlightedYaml);

                const confirmed = await promptForConfirmation(
                  `Add ${selectedServerNames.length} server${selectedServerNames.length > 1 ? "s" : ""} to configuration?`
                );

                if (!confirmed) {
                  CLI_LOGGER.info("Server addition cancelled");
                  process.exit(1);
                }
              } else if (!yes && !isInteractiveEnvironment()) {
                CLI_LOGGER.error(
                  "Non-interactive mode requires --yes flag for confirmation"
                );
                CLI_LOGGER.error(
                  `Use: mcpadre server add ${filePathOrUrl} --yes`
                );
                process.exit(1);
              }
            }

            CLI_LOGGER.debug(
              `Selected servers: ${selectedServerNames.join(", ")}`
            );

            // Add servers to config
            const updatedConfig = addServersToConfig(
              config,
              serverSpec,
              selectedServerNames
            );

            // Write back to file using the context
            await context.writeConfig(updatedConfig);

            CLI_LOGGER.info(
              `Added ${selectedServerNames.length} server${selectedServerNames.length > 1 ? "s" : ""} to configuration:`
            );
            CLI_LOGGER.info(formatServerList(selectedServerNames));
            // eslint-disable-next-line no-console
            console.log(
              `Successfully added ${selectedServerNames.length} server(s)`
            );
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

            // Handle remote ServerSpec errors
            if (error instanceof RemoteServerSpecError) {
              CLI_LOGGER.error("Failed to load ServerSpec from remote source:");
              CLI_LOGGER.error(`    ${error.message}`);
              if (error.sourceUrl) {
                CLI_LOGGER.error(`    Source: ${error.sourceUrl}`);
              }
              process.exit(1);
            }

            // Handle file not found errors with a clearer message
            if (
              error instanceof Error &&
              error.message.includes("ServerSpec file not found:")
            ) {
              CLI_LOGGER.error(error.message);
              CLI_LOGGER.error(
                "Please check that the file path is correct and the file exists."
              );
              process.exit(1);
            }

            CLI_LOGGER.error("Failed to load ServerSpec:");
            if (error instanceof Error) {
              CLI_LOGGER.error(`    ${error.message}`);
              if (error.stack) {
                const stackLines = error.stack.split("\n").slice(1, 9); // Skip message, limit to 8 lines
                for (const line of stackLines) {
                  const trimmedLine = line.trim();
                  if (trimmedLine) {
                    CLI_LOGGER.info(`        ${trimmedLine}`);
                  }
                }
              }
            } else {
              CLI_LOGGER.error(error);
            }
            process.exit(1);
          }
        }
      )
    );
}
