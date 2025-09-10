// pattern: Imperative Shell

import chalk from "chalk";
import { DEFAULT_THEME, highlight } from "cli-highlight";
import { stringify as yamlStringify } from "yaml";

import { forceQuoteVersionStrings } from "../../utils/yaml-helpers.js";
import { CLI_LOGGER } from "../_deps.js";
import { RegistryAdapterFactory } from "../server/registry/factory.js";
import {
  generateDefaultServerName,
  generateServerConfigFromRegistry,
} from "../server/registry-server-generator.js";

import { promptForConfirmationWithEscapeHandling } from "./navigation-prompts.js";
import {
  promptForPackageNameWithNavigation,
  promptForRegistryTypeSelection,
  promptForVersionSelectionWithNavigation,
} from "./registry-prompts.js";
import {
  CommandState,
  createRegistryServerAddStateMachine,
} from "./state-machine.js";

import type { SettingsProject } from "../../config/types/index.js";
import type { PackageInfo, RegistryType } from "../server/registry/types.js";

/**
 * Data collected during the registry flow
 */
interface RegistryFlowData {
  registryType?: RegistryType;
  packageName?: string;
  packageInfo?: PackageInfo;
  selectedVersion?: string;
  serverName?: string;
}

/**
 * Result of the registry server add flow
 */
export interface RegistryFlowResult {
  serverName: string;
  serverConfig: Record<string, unknown>;
  cancelled: boolean;
}

/**
 * Highlights YAML content with custom colors for terminal display
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
 * Format server configuration as YAML for preview
 */
function formatServerConfigAsYaml(
  serverName: string,
  serverConfig: Record<string, unknown>
): string {
  const configToShow = { [serverName]: serverConfig };
  const configWithQuotedVersions = forceQuoteVersionStrings(configToShow);
  return yamlStringify(configWithQuotedVersions).trim();
}

/**
 * Interactive registry server add flow using state machine
 */
export async function runRegistryServerAddFlow(
  existingConfig: SettingsProject
): Promise<RegistryFlowResult> {
  const stateMachine = createRegistryServerAddStateMachine();
  const flowData: RegistryFlowData = {};
  const existingServerNames = Object.keys(existingConfig.mcpServers);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const currentState = stateMachine.getCurrentState();

    try {
      switch (currentState) {
        case CommandState.REGISTRY_TYPE_SELECTION: {
          const result = await promptForRegistryTypeSelection();

          if (result.action === "exit") {
            await stateMachine.transition("escape");
            return { serverName: "", serverConfig: {}, cancelled: true };
          }

          if (result.action === "back") {
            // First prompt - escape should exit entirely
            await stateMachine.transition("escape");
            return { serverName: "", serverConfig: {}, cancelled: true };
          }

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- discriminated union check
          if (result.action === "continue") {
            if (!result.value) {
              CLI_LOGGER.error("Registry type selection returned no value");
              return { serverName: "", serverConfig: {}, cancelled: true };
            }
            flowData.registryType = result.value;
            const transitionResult = await stateMachine.transition(
              "continue",
              result.value
            );

            if (transitionResult.shouldExit) {
              return { serverName: "", serverConfig: {}, cancelled: true };
            }
          }
          break;
        }

        case CommandState.PACKAGE_INPUT: {
          if (!flowData.registryType) {
            CLI_LOGGER.error("Registry type not selected");
            return { serverName: "", serverConfig: {}, cancelled: true };
          }

          const result = await promptForPackageNameWithNavigation(
            flowData.registryType
          );

          if (result.action === "exit") {
            await stateMachine.transition("cancel");
            return { serverName: "", serverConfig: {}, cancelled: true };
          }

          if (result.action === "back") {
            await stateMachine.transition("escape");
            continue; // Go back to previous state
          }

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- discriminated union check
          if (result.action === "continue" && result.value) {
            flowData.packageName = result.value;

            // Fetch package information from registry
            CLI_LOGGER.info(
              `Fetching package information for ${result.value}...`
            );

            const registryAdapter = RegistryAdapterFactory.createAdapter(
              flowData.registryType
            );
            const packageResult = await registryAdapter.fetchPackage(
              result.value,
              { versionLimit: 20 } // Limit to 20 most recent versions
            );

            if (!packageResult.success) {
              CLI_LOGGER.error(
                `Failed to fetch package: ${packageResult.error}`
              );
              continue; // Stay in same state to allow retry
            }

            flowData.packageInfo = packageResult.package;

            const transitionResult = await stateMachine.transition(
              "continue",
              packageResult.package
            );

            if (transitionResult.shouldExit) {
              return { serverName: "", serverConfig: {}, cancelled: true };
            }
          }
          break;
        }

        case CommandState.VERSION_SELECTION: {
          if (!flowData.packageInfo || !flowData.packageName) {
            CLI_LOGGER.error("Package information not available");
            return { serverName: "", serverConfig: {}, cancelled: true };
          }

          const result = await promptForVersionSelectionWithNavigation(
            flowData.packageName,
            flowData.packageInfo.versions
          );

          if (result.action === "exit") {
            await stateMachine.transition("cancel");
            return { serverName: "", serverConfig: {}, cancelled: true };
          }

          if (result.action === "back") {
            await stateMachine.transition("escape");
            continue; // Go back to previous state
          }

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- discriminated union check
          if (result.action === "continue" && result.value) {
            flowData.selectedVersion = result.value;

            // Generate default server name
            flowData.serverName = generateDefaultServerName(
              flowData.packageName,
              existingServerNames
            );

            const transitionResult = await stateMachine.transition(
              "continue",
              result.value
            );

            if (transitionResult.shouldExit) {
              return { serverName: "", serverConfig: {}, cancelled: true };
            }
          }
          break;
        }

        case CommandState.CONFIRMATION: {
          if (
            !flowData.registryType ||
            !flowData.packageName ||
            !flowData.selectedVersion ||
            !flowData.serverName
          ) {
            CLI_LOGGER.error("Missing required flow data for confirmation");
            return { serverName: "", serverConfig: {}, cancelled: true };
          }

          // Generate server configuration
          const serverGenResult = generateServerConfigFromRegistry({
            serverName: flowData.serverName,
            registryType: flowData.registryType,
            packageName: flowData.packageName,
            version: flowData.selectedVersion,
          });

          // Show YAML preview
          const yamlConfig = formatServerConfigAsYaml(
            serverGenResult.serverName,
            serverGenResult.serverConfig as Record<string, unknown>
          );
          const highlightedYaml = highlightYaml(yamlConfig);

          CLI_LOGGER.info("Server configuration to be added:");
          // eslint-disable-next-line no-console
          console.log(highlightedYaml);

          // Get confirmation with escape handling
          const canGoBack = stateMachine.canGoBack();
          const result = await promptForConfirmationWithEscapeHandling(
            `Add server '${serverGenResult.serverName}' to configuration?`,
            canGoBack
          );

          if (result.action === "back") {
            await stateMachine.transition("escape");
            continue; // Go back to previous state
          }

          if (result.action === "exit") {
            await stateMachine.transition("cancel");
            return { serverName: "", serverConfig: {}, cancelled: true };
          }

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- discriminated union check
          if (result.action === "continue") {
            if (result.value) {
              // User confirmed
              await stateMachine.transition("continue");
              return {
                serverName: serverGenResult.serverName,
                serverConfig: serverGenResult.serverConfig as Record<
                  string,
                  unknown
                >,
                cancelled: false,
              };
            } else {
              // User declined
              CLI_LOGGER.info("Server addition cancelled");
              await stateMachine.transition("cancel");
              return { serverName: "", serverConfig: {}, cancelled: true };
            }
          }
          break;
        }

        case CommandState.COMPLETED: {
          // Should not reach here in normal flow
          return { serverName: "", serverConfig: {}, cancelled: false };
        }

        case CommandState.CANCELLED: {
          return { serverName: "", serverConfig: {}, cancelled: true };
        }

        default: {
          CLI_LOGGER.error(`Unknown state: ${currentState}`);
          return { serverName: "", serverConfig: {}, cancelled: true };
        }
      }
    } catch (error) {
      CLI_LOGGER.error("Error in registry flow:");
      CLI_LOGGER.error(error);
      return { serverName: "", serverConfig: {}, cancelled: true };
    }
  }
}
