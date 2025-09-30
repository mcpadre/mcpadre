// pattern: Imperative Shell

import ensureGitignore from "ensure-gitignore";
import { readFile, stat, writeFile } from "fs/promises";

import { HOST_CONFIGS } from "./config/host-configs.js";

import type { SupportedHostV1 } from "../config/types/v1/index.js";
import type { SettingsProjectV1 } from "../config/types/v1/index.js";

/**
 * Checks if gitignore management should be enabled based on project settings
 * @param projectConfig The project configuration
 * @returns true if gitignore should be managed, false otherwise
 */
export function shouldManageGitignore(
  projectConfig: SettingsProjectV1
): boolean {
  // If skipGitignoreOnInstall is explicitly set to true, don't manage gitignore
  return !(projectConfig.options?.skipGitignoreOnInstall === true);
}

/**
 * Gets the gitignore patterns for the specified hosts
 * Only returns patterns for hosts that should be gitignored
 * @param hosts List of hosts to get patterns for
 * @returns Array of gitignore patterns (deduplicated)
 */
export function getGitignorePatternsForHosts(
  hosts: SupportedHostV1[]
): string[] {
  const patterns = hosts
    .filter(host => HOST_CONFIGS[host].shouldGitignore)
    .map(host => HOST_CONFIGS[host].projectConfigPath);

  // Remove duplicates by converting to Set and back to Array
  return [...new Set(patterns)];
}

/**
 * Adds patterns to the project's .gitignore file
 * Uses ensure-gitignore library for idempotent operations
 * @param projectDir Absolute path to the project root directory
 * @param patterns Array of gitignore patterns to add
 * @returns true if the .gitignore file was modified, false otherwise
 */
export async function addToGitignore(
  projectDir: string,
  patterns: string[]
): Promise<boolean> {
  if (patterns.length === 0) {
    return false;
  }

  const gitignorePath = `${projectDir}/.gitignore`;

  // Get file modification time before the operation
  let beforeMtime: number | null = null;
  try {
    const beforeStat = await stat(gitignorePath);
    beforeMtime = beforeStat.mtime.getTime();
  } catch {
    // File doesn't exist, that's fine
    beforeMtime = null;
  }

  await ensureGitignore({
    filepath: gitignorePath,
    patterns,
    comment:
      "mcpadre configurations (machine-specific paths and server platform files)",
  });

  // Check if the file was actually modified by comparing mtime
  try {
    const afterStat = await stat(gitignorePath);
    const afterMtime = afterStat.mtime.getTime();

    // File was modified if it didn't exist before or if mtime changed
    return beforeMtime === null || beforeMtime !== afterMtime;
  } catch {
    // Shouldn't happen since ensure-gitignore should have created the file
    return true;
  }
}

/**
 * Removes patterns from the project's .gitignore file
 * @param projectDir Absolute path to the project root directory
 * @param patterns Array of gitignore patterns to remove
 */
export async function removeFromGitignore(
  projectDir: string,
  patterns: string[]
): Promise<void> {
  if (patterns.length === 0) {
    return;
  }

  const gitignorePath = `${projectDir}/.gitignore`;

  try {
    const existingContent = await readFile(gitignorePath, "utf8");
    const existingLines = existingContent.split("\n");

    // Remove specified patterns
    const filteredLines = existingLines.filter(
      (line: string) => !patterns.includes(line.trim())
    );

    // Only write if we actually removed something
    if (filteredLines.length !== existingLines.length) {
      await writeFile(gitignorePath, filteredLines.join("\n"), "utf8");
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      // File doesn't exist, nothing to remove
      return;
    }
    throw error;
  }
}

/**
 * Gets gitignore patterns for mcpadre server platform-specific files
 * These patterns exclude server-specific build artifacts and platform dependencies
 * @returns Array of gitignore patterns for mcpadre server files
 */
export function getMcpadreGitignorePatterns(): string[] {
  return [
    ".mcpadre/logs",
    ".mcpadre/traffic",
    ".mcpadre/servers/*/.venv",
    ".mcpadre/servers/*/node_modules",
  ];
}

/**
 * Adds patterns to a server-specific .gitignore file
 * Creates the file if it doesn't exist, adds patterns if they're not already present
 * @param serverDir Absolute path to the server directory (.mcpadre/servers/$serverName)
 * @param patterns Array of gitignore patterns to add
 * @returns true if the .gitignore file was modified, false otherwise
 */
export async function addToServerGitignore(
  serverDir: string,
  patterns: string[]
): Promise<boolean> {
  if (patterns.length === 0) {
    return false;
  }

  const gitignorePath = `${serverDir}/.gitignore`;

  try {
    // Read existing content if file exists
    let existingContent = "";
    try {
      existingContent = await readFile(gitignorePath, "utf8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        // File doesn't exist, that's fine
        existingContent = "";
      } else {
        throw error;
      }
    }

    const existingLines = existingContent.split("\n");
    const newPatterns: string[] = [];

    // Only add patterns that don't already exist
    for (const pattern of patterns) {
      if (!existingLines.includes(pattern)) {
        newPatterns.push(pattern);
      }
    }

    if (newPatterns.length === 0) {
      return false; // No new patterns to add
    }

    // Prepare new content
    let newContent = existingContent.trim();
    if (newContent.length > 0 && !newContent.endsWith("\n")) {
      newContent += "\n";
    }

    // Add header comment if this is a new file
    if (existingContent.trim() === "") {
      newContent = "# mcpadre server-specific files (per-user)\n";
    }

    // Add new patterns
    newContent += `${newPatterns.join("\n")}\n`;

    await writeFile(gitignorePath, newContent, "utf8");
    return true;
  } catch (error) {
    throw new Error(
      `Failed to update server .gitignore at ${gitignorePath}: ${error}`
    );
  }
}
