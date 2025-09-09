// pattern: Functional Core

import { input } from "@inquirer/prompts";

import { RegistryAdapterFactory } from "../server/registry/factory.js";

import { selectWithNavigationResult } from "./navigation-prompts.js";

import type { RegistryType } from "../server/registry/types.js";
import type { NavigationResult } from "./navigation-prompts.js";

/**
 * Prompt for selecting registry type with escape navigation
 */
export async function promptForRegistryTypeSelection(): Promise<
  NavigationResult<RegistryType>
> {
  const availableRegistries = RegistryAdapterFactory.getAvailableRegistries();

  if (availableRegistries.length === 1) {
    // Auto-select if only one registry is available
    return {
      action: "continue",
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length check above ensures element exists
      value: availableRegistries[0]!.type,
    };
  }

  const choices = availableRegistries.map(registry => ({
    value: registry.type,
    name: registry.displayName,
  }));

  return await selectWithNavigationResult(
    "Select the type of MCP server to add:",
    choices
  );
}

/**
 * Prompt for package name input with escape navigation
 * Note: Uses standard input prompt - escape and Ctrl+C both treated as back
 */
export async function promptForPackageNameWithNavigation(
  registryType: RegistryType
): Promise<NavigationResult<string>> {
  try {
    const registryAdapter = RegistryAdapterFactory.createAdapter(registryType);
    const registryName = registryAdapter.config.displayName;

    const packageName = await input({
      message: `Enter ${registryName} package name:`,
      validate: (inputValue: string) => {
        if (!inputValue.trim()) {
          return "Package name cannot be empty";
        }

        if (!registryAdapter.validatePackageName(inputValue.trim())) {
          return `Invalid package name for ${registryName}`;
        }

        return true;
      },
    });

    return {
      action: "continue",
      value: packageName.trim(),
    };
  } catch (error) {
    // Handle Inquirer cancellation (Ctrl+C or Escape - both treated as back)
    if (
      error instanceof Error &&
      (error.message.includes("User force closed the prompt") ||
        error.message.includes("force closed"))
    ) {
      return { action: "back" };
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Prompt for version selection with escape navigation
 */
export async function promptForVersionSelectionWithNavigation(
  packageName: string,
  versions: { version: string; publishedAt: string; isSemver: boolean }[]
): Promise<NavigationResult<string>> {
  if (versions.length === 0) {
    throw new Error(`No versions found for package ${packageName}`);
  }

  // Create choices with formatting for better UX
  const choices = versions.map(version => {
    const publishDate = new Date(version.publishedAt).toLocaleDateString();
    const semverIndicator = version.isSemver ? "" : " (non-semver)";

    return {
      value: version.version,
      name: `${version.version}${semverIndicator} - ${publishDate}`,
    };
  });

  return await selectWithNavigationResult(
    `Select version for ${packageName}:`,
    choices,
    { pageSize: 10 } // Show max 10 versions at once
  );
}
