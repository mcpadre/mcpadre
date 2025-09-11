// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";

import { writeSettingsProjectToFile } from "../config/writers/settings-project-writer.js";
import { writeSettingsUserToFile } from "../config/writers/settings-user-writer.js";

import { isInteractiveEnvironment } from "./_utils/interactive-prompts.js";
import { promptMultiHostToggle } from "./_utils/multi-host-toggle.js";
import { getSimilarHosts, isValidHost } from "./host/host-logic.js";
import { CLI_LOGGER } from "./_deps.js";
import { getUserDir, isUserMode } from "./_globals.js";

import type { SettingsProject, SettingsUser } from "../config/types/index.js";
import type { SupportedHostV1 } from "../config/types/v1/hosts.js";

/**
 * Get supported hosts for the current mode
 */
function getSupportedHosts(isUserMode: boolean): readonly SupportedHostV1[] {
  if (isUserMode) {
    // User mode supports user-capable hosts
    return ["claude-code", "cursor", "opencode", "claude-desktop"] as const;
  } else {
    // Project mode supports project-capable hosts
    return ["claude-code", "cursor", "opencode", "zed", "vscode"] as const;
  }
}

/**
 * Check if a host is capable in the current mode
 */
function isHostCapable(host: string, isUserMode: boolean): boolean {
  const supportedHosts = getSupportedHosts(isUserMode);
  return supportedHosts.includes(host as SupportedHostV1);
}

/**
 * Validates a list of host names, returning validation results
 */
function validateHosts(
  hostNames: string[],
  isUserMode: boolean
): {
  valid: SupportedHostV1[];
  invalid: { name: string; suggestions: string[] }[];
  invalidForMode: { name: string; reason: string }[];
} {
  const valid: SupportedHostV1[] = [];
  const invalid: { name: string; suggestions: string[] }[] = [];
  const invalidForMode: { name: string; reason: string }[] = [];

  for (const hostName of hostNames) {
    if (!isValidHost(hostName)) {
      invalid.push({
        name: hostName,
        suggestions: getSimilarHosts(hostName),
      });
    } else if (!isHostCapable(hostName, isUserMode)) {
      invalidForMode.push({
        name: hostName,
        reason: isUserMode
          ? "Host is not supported in user mode (project-only host)"
          : "Host is not supported in project mode",
      });
    } else {
      valid.push(hostName);
    }
  }

  return { valid, invalid, invalidForMode };
}

/**
 * Find existing configuration file (checking multiple formats)
 */
function findExistingConfig(targetDir: string): string | null {
  const CONFIG_FILE_NAMES = [
    "mcpadre.json",
    "mcpadre.yaml",
    "mcpadre.yml",
    "mcpadre.toml",
  ];

  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = join(targetDir, fileName);
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Get next steps message for configured hosts
 */
function getNextStepsMessage(
  _selectedHosts: readonly string[],
  isUserMode: boolean
): string[] {
  const steps = [
    "",
    "Next steps:",
    "1. Add your MCP servers to the 'mcpServers' section of the configuration",
    "2. Install the configuration for your enabled hosts:",
  ];

  if (isUserMode) {
    steps.push("   mcpadre install");
  } else {
    steps.push("   mcpadre install");
  }

  return steps;
}

/**
 * Creates the mcpadre init command
 */
export function makeInitCommand(): Command {
  return new Command("init")
    .description("Initialize a new mcpadre configuration file")
    .option(
      "--target <path>",
      "Directory to initialize (default: current directory)",
      "."
    )
    .option(
      "--host <host>",
      "Host to enable (can be repeated, required in non-interactive mode)",
      (value: string, previous: string[] = []) => [...previous, value],
      []
    )
    .option("-f, --force", "Overwrite existing configuration file")
    .option("-y, --yes", "Skip confirmation prompts")

    .addHelpText(
      "before",
      `
Initialize a new mcpadre project or user configuration file.

Project mode (default): Creates 'mcpadre.yaml' in the target directory.
User mode (--user): Creates 'mcpadre.yaml' in the user directory ($MCPADRE_USER_DIR or $HOME/.mcpadre).

The configuration will include empty 'env' and 'mcpServers' sections ready for use.

In interactive mode, shows a checkbox interface for selecting hosts.
In non-interactive mode, requires at least one --host flag.

Note: Project mode only supports hosts that can handle project configurations. User mode supports hosts that can handle global configurations.
      `
    )
    .addHelpText(
      "after",
      `
Examples:
  mcpadre init                                   Interactive host selection in current directory
  mcpadre init --target /path/to/project         Interactive host selection in specific directory
  mcpadre init --host cursor --host zed          Initialize with Cursor and Zed hosts
  mcpadre init --user                            Initialize user configuration globally
  mcpadre init --user --host claude-desktop      Initialize user config with Claude Desktop
  mcpadre init --force                           Overwrite existing config file
  
Supported hosts:
  Project + User capable:
  • claude-code: Claude Code
  • cursor: Cursor
  • opencode: opencode
  
  Project-only:
  • zed: Zed
  • vscode: Visual Studio Code
  
  User-only:
  • claude-desktop: Claude Desktop
      `
    )
    .action(
      async (options: {
        target: string;
        host: string[];
        force?: boolean;
        yes?: boolean;
      }) => {
        try {
          const { target, host, force = false } = options;
          // eslint-disable-next-line no-restricted-syntax -- Init command needs to check mode before config exists
          const userModeEnabled = isUserMode();

          // Determine target directory
          const targetDir = userModeEnabled ? getUserDir() : target;

          // Create target directory if it doesn't exist
          await mkdir(targetDir, { recursive: true });

          // Check for existing configuration
          const existingConfigPath = findExistingConfig(targetDir);
          if (existingConfigPath && !force) {
            CLI_LOGGER.error(
              `Configuration file already exists: ${existingConfigPath}`
            );
            CLI_LOGGER.error(
              "Use --force to overwrite the existing configuration"
            );
            process.exit(1);
          }

          // Determine if we're in interactive mode
          const isInteractive = isInteractiveEnvironment();

          let selectedHosts: SupportedHostV1[] = [];

          if (!isInteractive) {
            // Non-interactive mode: require --host flags
            if (host.length === 0) {
              const supportedHosts = getSupportedHosts(userModeEnabled);

              CLI_LOGGER.error(
                "Non-interactive mode requires at least one --host flag"
              );

              const exampleCommand = userModeEnabled
                ? "mcpadre init --user --host claude-code --host cursor"
                : "mcpadre init --host cursor --host zed";

              CLI_LOGGER.error(`Example: ${exampleCommand}`);
              CLI_LOGGER.error(`Supported hosts: ${supportedHosts.join(", ")}`);
              process.exit(1);
            }

            const validation = validateHosts(host, userModeEnabled);

            // Handle invalid host names
            if (validation.invalid.length > 0) {
              CLI_LOGGER.error("Invalid host names:");
              for (const { name, suggestions } of validation.invalid) {
                CLI_LOGGER.error(`  • ${name}`);
                if (suggestions.length > 0) {
                  CLI_LOGGER.error(
                    `    Did you mean: ${suggestions.join(", ")}?`
                  );
                }
              }
            }

            // Handle hosts that are invalid for the current mode
            if (validation.invalidForMode.length > 0) {
              const modeType = userModeEnabled ? "user" : "project";
              CLI_LOGGER.error(`Hosts not supported in ${modeType} mode:`);
              for (const { name, reason } of validation.invalidForMode) {
                CLI_LOGGER.error(`  • ${name}: ${reason}`);
              }
              const supportedHosts = getSupportedHosts(userModeEnabled);
              CLI_LOGGER.error(
                `${modeType}-capable hosts: ${supportedHosts.join(", ")}`
              );
            }

            if (
              validation.invalid.length > 0 ||
              validation.invalidForMode.length > 0
            ) {
              const supportedHosts = getSupportedHosts(userModeEnabled);
              CLI_LOGGER.error(`Supported hosts: ${supportedHosts.join(", ")}`);
              process.exit(1);
            }

            selectedHosts = validation.valid;
          } else {
            // Interactive mode: use multi-host toggle
            const modeType = userModeEnabled ? "user" : "project";
            CLI_LOGGER.info(
              `Starting interactive host selection for ${modeType} configuration...`
            );

            // Create a default config with no hosts enabled (for init mode)
            const defaultConfig: SettingsProject = {
              version: 1,
              env: {},
              mcpServers: {},
              hosts: {},
            };

            try {
              const result = await promptMultiHostToggle(defaultConfig, {
                message: userModeEnabled
                  ? "Select which MCP hosts to enable in your user configuration:"
                  : "Select which MCP hosts to enable for this project:",
                helpText: userModeEnabled
                  ? "Use spacebar to toggle, arrow keys to navigate, Enter to confirm. Only user-capable hosts are shown."
                  : "Use spacebar to toggle, arrow keys to navigate, Enter to confirm. Only project-capable hosts are shown.",
                requireAtLeastOne: true,
                isUserMode: userModeEnabled,
                validate: (selectedHosts: SupportedHostV1[]) => {
                  const invalidHosts = selectedHosts.filter(
                    host => !isHostCapable(host, userModeEnabled)
                  );
                  if (invalidHosts.length > 0) {
                    const modeType = userModeEnabled ? "user" : "project";
                    return `These hosts are not supported in ${modeType} mode: ${invalidHosts.join(", ")}`;
                  }
                  return true;
                },
              });

              if (result.cancelled) {
                CLI_LOGGER.info("Initialization cancelled");
                process.exit(1);
              }

              selectedHosts = result.selectedHosts;
            } catch (promptError) {
              // Handle user cancellation (Ctrl+C/Escape) gracefully
              if (
                promptError instanceof Error &&
                (promptError.message.includes("User force closed the prompt") ||
                  promptError.message.includes("force closed"))
              ) {
                // Silent exit on user cancellation
                process.exit(1);
              }

              // Re-throw other errors to be handled by outer catch
              throw promptError;
            }
          }

          // Create the appropriate configuration object
          const config: SettingsProject | SettingsUser = {
            version: 1,
            env: {},
            mcpServers: {},
            hosts: selectedHosts.reduce(
              (acc, hostName) => {
                acc[hostName] = true;
                return acc;
              },
              {} as Record<string, boolean>
            ),
          };

          // Write configuration using the appropriate writer
          const configPath = join(targetDir, "mcpadre.yaml");
          if (userModeEnabled) {
            await writeSettingsUserToFile(configPath, config as SettingsUser);
          } else {
            await writeSettingsProjectToFile(
              configPath,
              config as SettingsProject
            );
          }

          // Report success
          if (existingConfigPath) {
            CLI_LOGGER.info(
              `Overwrote existing configuration: ${existingConfigPath}`
            );
          }

          const modeType = userModeEnabled ? "user" : "project";
          CLI_LOGGER.info(
            `Created mcpadre ${modeType} configuration: ${configPath}`
          );
          CLI_LOGGER.info(`Enabled hosts: ${selectedHosts.join(", ")}`);

          // Get next steps
          const nextSteps = getNextStepsMessage(selectedHosts, userModeEnabled);
          for (const step of nextSteps) {
            CLI_LOGGER.info(step);
          }
        } catch (error) {
          CLI_LOGGER.error("Failed to initialize mcpadre configuration:");
          if (error instanceof Error) {
            CLI_LOGGER.error(`  ${error.message}`);
          } else {
            CLI_LOGGER.error(error);
          }
          process.exit(1);
        }
      }
    );
}
