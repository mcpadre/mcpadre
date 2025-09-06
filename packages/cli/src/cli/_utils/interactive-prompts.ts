// pattern: Functional Core

import { checkbox, confirm } from "@inquirer/prompts";

/**
 * TTY detection utility
 * @returns True if we're in an interactive terminal environment
 */
export function isInteractiveEnvironment(): boolean {
  return (
    process.stdout.isTTY &&
    process.stdin.isTTY &&
    process.env["MCPADRE_NON_INTERACTIVE"] !== "1"
  );
}

/**
 * Prompts user to select multiple servers from a list using checkboxes
 * @param serverNames Available server names to choose from
 * @returns Array of selected server names
 */
export async function promptForServerSelection(
  serverNames: string[]
): Promise<string[]> {
  if (!isInteractiveEnvironment()) {
    throw new Error("Cannot prompt for input in non-interactive environment");
  }

  const selectedServers = await checkbox({
    message: "Which servers would you like to add?",
    choices: serverNames.map(name => ({
      value: name,
      name,
    })),
    validate: (selections: readonly { value: string }[]) => {
      if (selections.length === 0) {
        return "Please select at least one server";
      }
      return true;
    },
  });

  return selectedServers;
}

/**
 * Prompts user for confirmation with a yes/no question
 * @param message The confirmation message to display
 * @returns True if user confirmed, false otherwise
 */
export async function promptForConfirmation(message: string): Promise<boolean> {
  if (!isInteractiveEnvironment()) {
    throw new Error("Cannot prompt for input in non-interactive environment");
  }

  return await confirm({
    message,
    default: false,
  });
}

/**
 * Creates a formatted list of servers for display in confirmation prompts
 * @param serverNames Array of server names
 * @returns Formatted string for display
 */
export function formatServerList(serverNames: string[]): string {
  if (serverNames.length === 0) {
    return "(none)";
  }

  if (serverNames.length === 1) {
    return serverNames[0] as string;
  }

  return serverNames.map(name => `  • ${name}`).join("\n");
}
