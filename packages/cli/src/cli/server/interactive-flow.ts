// pattern: Imperative Shell

import chalk from "chalk";
import { DEFAULT_THEME, highlight } from "cli-highlight";
import { stringify as yamlStringify } from "yaml";

import {
  promptForConfirmationWithEscapeHandling,
  promptForServerSelectionWithNavigation,
} from "../../cli-helpers/navigation-prompts.js";
import {
  CommandState,
  createServerAddStateMachine,
} from "../../cli-helpers/state-machine.js";
import { forceQuoteVersionStrings } from "../../utils/yaml-helpers.js";
import { CLI_LOGGER } from "../_deps.js";

import {
  selectServersToAdd,
  type ServerSelectionOptions,
} from "./server-logic.js";

import type { ServerSpec } from "../../config/types/index.js";

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
 * Format server configurations as YAML for preview
 */
function formatServerConfigsAsYaml(
  serverSpec: ServerSpec,
  selectedServerNames: string[]
): string {
  const selectedConfigs: Record<string, unknown> = {};

  for (const serverName of selectedServerNames) {
    const serverConfig = serverSpec.mcpServers[serverName];
    if (serverConfig) {
      selectedConfigs[serverName] = serverConfig;
    }
  }

  const configToShow =
    selectedServerNames.length > 1
      ? { mcpServers: selectedConfigs }
      : selectedConfigs;

  const configWithQuotedVersions = forceQuoteVersionStrings(configToShow);
  return yamlStringify(configWithQuotedVersions);
}

/**
 * Interactive server add flow using state machine
 */
export async function runInteractiveServerAddFlow(
  serverSpec: ServerSpec,
  availableServerNames: string[]
): Promise<{
  selectedServerNames: string[];
  cancelled: boolean;
}> {
  const stateMachine = createServerAddStateMachine();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const currentState = stateMachine.getCurrentState();

    try {
      switch (currentState) {
        case CommandState.SERVER_SELECTION: {
          const result =
            await promptForServerSelectionWithNavigation(availableServerNames);

          if (result.action === "exit") {
            await stateMachine.transition("escape");
            return { selectedServerNames: [], cancelled: true };
          }

          if (result.action === "continue" && result.value) {
            const transitionResult = await stateMachine.transition(
              "continue",
              result.value
            );

            if (transitionResult.shouldExit) {
              return { selectedServerNames: [], cancelled: true };
            }
          }
          break;
        }

        case CommandState.CONFIRMATION: {
          // Get selected servers from previous state
          const selectedServers = stateMachine.getStateData<string[]>(
            CommandState.SERVER_SELECTION
          );

          if (!selectedServers || selectedServers.length === 0) {
            CLI_LOGGER.error("No servers selected");
            return { selectedServerNames: [], cancelled: true };
          }

          // Show YAML preview
          const yamlConfig = formatServerConfigsAsYaml(
            serverSpec,
            selectedServers
          );
          const highlightedYaml = highlightYaml(yamlConfig);

          CLI_LOGGER.info("Server configuration to be added:");
          // eslint-disable-next-line no-console
          console.log(highlightedYaml);

          // Get confirmation with escape handling
          const canGoBack = stateMachine.canGoBack();
          const result = await promptForConfirmationWithEscapeHandling(
            `Add ${selectedServers.length} server${selectedServers.length > 1 ? "s" : ""} to configuration?`,
            canGoBack
          );

          if (result.action === "back") {
            await stateMachine.transition("escape");
            continue; // Go back to previous state
          }

          if (result.action === "exit") {
            await stateMachine.transition("cancel");
            return { selectedServerNames: [], cancelled: true };
          }

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (result.action === "continue") {
            if (result.value) {
              // User confirmed
              await stateMachine.transition("continue");
              return { selectedServerNames: selectedServers, cancelled: false };
            } else {
              // User declined
              CLI_LOGGER.info("Server addition cancelled");
              await stateMachine.transition("cancel");
              return { selectedServerNames: [], cancelled: true };
            }
          }
          break;
        }

        case CommandState.COMPLETED: {
          const selectedServers = stateMachine.getStateData<string[]>(
            CommandState.SERVER_SELECTION
          );
          return {
            selectedServerNames: selectedServers ?? [],
            cancelled: false,
          };
        }

        case CommandState.CANCELLED: {
          return { selectedServerNames: [], cancelled: true };
        }

        default: {
          CLI_LOGGER.error(`Unknown state: ${currentState}`);
          return { selectedServerNames: [], cancelled: true };
        }
      }
    } catch (error) {
      CLI_LOGGER.error("Error in interactive flow:");
      CLI_LOGGER.error(error);
      return { selectedServerNames: [], cancelled: true };
    }
  }
}

/**
 * Determine selected servers using non-interactive logic
 */
export function selectServersNonInteractive(
  availableServerNames: string[],
  options: {
    all?: boolean;
    serverName?: string;
  }
): {
  selectedServerNames: string[];
  success: boolean;
  errorMessage?: string;
} {
  const selectionOptions: ServerSelectionOptions = {
    selectAll: options.all ?? false,
    specificServerName: options.serverName,
    availableServerNames,
    isInteractive: false,
  };

  const selectionResult = selectServersToAdd(selectionOptions);

  if (
    !selectionResult.success ||
    selectionResult.selectedServerNames.length === 0
  ) {
    return {
      selectedServerNames: [],
      success: false,
      errorMessage: selectionResult.errorMessage ?? "No servers selected",
    };
  }

  return {
    selectedServerNames: selectionResult.selectedServerNames,
    success: true,
  };
}
