// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";
import { mkdir } from "fs/promises";

import { createConfigContext } from "./_utils/contexts/index.js";
import { isInteractiveEnvironment } from "./_utils/interactive-prompts.js";
import { promptMultiHostToggle } from "./_utils/multi-host-toggle.js";
import { getSimilarHosts, isValidHost } from "./host/host-logic.js";
import { CLI_LOGGER } from "./_deps.js";

import type { SettingsProject, SettingsUser } from "../config/types/index.js";
import type { SupportedHostV1 } from "../config/types/v1/hosts.js";

/**
 * Validates a list of host names, returning validation results
 */
function validateHosts(
  hostNames: string[],
  context: ReturnType<typeof createConfigContext>
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
    } else if (!context.isHostCapable(hostName)) {
      invalidForMode.push({
        name: hostName,
        reason:
          context.type === "user"
            ? "Host is not supported in user mode (project-only host)"
            : `Host is not supported in ${context.type} mode`,
      });
    } else {
      valid.push(hostName);
    }
  }

  return { valid, invalid, invalidForMode };
}

/**
 * Creates the mcpadre init command
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeInitCommand() {
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

          // Create the appropriate config context based on mode (user or project)
          const context = createConfigContext({ target });

          // Create target directory if it doesn't exist
          await mkdir(context.getTargetDir(), { recursive: true });

          // Check for existing configuration
          const existingConfigPath = await context.findExistingConfig();
          if (existingConfigPath && !force) {
            CLI_LOGGER.error(
              `Configuration file already exists: ${existingConfigPath}`
            );
            CLI_LOGGER.error(
              "Use --force to overwrite the existing configuration"
            );
            process.exit(1);
          }

          // If we're overwriting, use the existing file's format
          if (existingConfigPath && force) {
            // Update the config path to use the existing file's path/format
            await context.initConfigPath();
          }

          // Determine if we're in interactive mode
          const isInteractive = isInteractiveEnvironment();

          let selectedHosts: SupportedHostV1[] = [];

          if (!isInteractive) {
            // Non-interactive mode: require --host flags
            if (host.length === 0) {
              const supportedHosts = context.getSupportedHosts();

              CLI_LOGGER.error(
                "Non-interactive mode requires at least one --host flag"
              );

              const exampleCommand =
                context.type === "user"
                  ? "mcpadre init --user --host claude-code --host cursor"
                  : "mcpadre init --host cursor --host zed";

              CLI_LOGGER.error(`Example: ${exampleCommand}`);
              CLI_LOGGER.error(`Supported hosts: ${supportedHosts.join(", ")}`);
              process.exit(1);
            }

            const validation = validateHosts(host, context);

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
              CLI_LOGGER.error(`Hosts not supported in ${context.type} mode:`);
              for (const { name, reason } of validation.invalidForMode) {
                CLI_LOGGER.error(`  • ${name}: ${reason}`);
              }
              CLI_LOGGER.error(
                `${context.type}-capable hosts: ${context.getSupportedHosts().join(", ")}`
              );
            }

            if (
              validation.invalid.length > 0 ||
              validation.invalidForMode.length > 0
            ) {
              const supportedHosts = context.getSupportedHosts();
              CLI_LOGGER.error(`Supported hosts: ${supportedHosts.join(", ")}`);
              process.exit(1);
            }

            selectedHosts = validation.valid;
          } else {
            // Interactive mode: use multi-host toggle
            CLI_LOGGER.info(
              `Starting interactive host selection for ${context.getConfigTypeName()} configuration...`
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
                message:
                  context.type === "user"
                    ? "Select which MCP hosts to enable in your user configuration:"
                    : "Select which MCP hosts to enable for this project:",
                helpText:
                  context.type === "user"
                    ? "Use spacebar to toggle, arrow keys to navigate, Enter to confirm. Only user-capable hosts are shown."
                    : "Use spacebar to toggle, arrow keys to navigate, Enter to confirm. Only project-capable hosts are shown.",
                requireAtLeastOne: true,
                isUserMode: context.type === "user",
                validate: (selectedHosts: SupportedHostV1[]) => {
                  const invalidHosts = selectedHosts.filter(
                    host => !context.isHostCapable(host)
                  );
                  if (invalidHosts.length > 0) {
                    return `These hosts are not supported in ${context.type} mode: ${invalidHosts.join(", ")}`;
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
              // This matches the pattern used in host/manage.ts for consistent UX
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

          // Create the appropriate configuration object based on context type
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

          // Write configuration using the context
          await context.writeConfig(config);

          // Report success
          if (existingConfigPath) {
            CLI_LOGGER.info(
              `Overwrote existing configuration: ${existingConfigPath}`
            );
          }

          CLI_LOGGER.info(
            `Created mcpadre ${context.getConfigTypeName()} configuration: ${context.getConfigPath()}`
          );
          CLI_LOGGER.info(`Enabled hosts: ${selectedHosts.join(", ")}`);

          // Get next steps from the context
          const nextSteps = context.getNextStepsMessage(selectedHosts);
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
