// pattern: Functional Core

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  updateClaudeCodeGlobalConfig,
  updateClaudeCodeGlobalConfigWithAnalysis,
} from "../updaters/claude-code-global.js";

import type { McpServerV1 } from "../../config/types/v1/server/index.js";
import type { ConfigUpdateWithAnalysis } from "../updaters/generic-updater.js";

/**
 * Path to the global Claude Code configuration file
 * Located at $HOME/.claude.json
 */
export function getClaudeCodeGlobalConfigPath(): string {
  return path.join(os.homedir(), ".claude.json");
}

/**
 * Updates the Claude Code global configuration file with mcpadre servers
 * Creates the config file if it doesn't exist
 *
 * @param servers mcpadre server configurations to add/update
 * @returns The updated content of the config file
 */
export function updateClaudeCodeGlobalConfigFile(
  servers: Record<string, McpServerV1>
): string {
  const configPath = getClaudeCodeGlobalConfigPath();
  let existingContent = "";

  try {
    existingContent = fs.readFileSync(configPath, "utf-8");
  } catch (error) {
    // If file doesn't exist, we'll create it with empty content
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      // Continue with empty content
    } else {
      // For other errors, re-throw
      throw error;
    }
  }

  const updatedContent = updateClaudeCodeGlobalConfig(existingContent, servers);

  // No need to create parent directory for ~/.claude.json (it's in home directory)

  // Write updated content
  fs.writeFileSync(configPath, updatedContent, "utf-8");

  return updatedContent;
}

/**
 * Updates the Claude Code global configuration file with mcpadre servers and returns analysis
 * Creates the config file if it doesn't exist
 *
 * @param servers mcpadre server configurations to add/update
 * @returns Object with updated config and analysis of existing servers
 */
export function updateClaudeCodeGlobalConfigFileWithAnalysis(
  servers: Record<string, McpServerV1>
): ConfigUpdateWithAnalysis {
  const configPath = getClaudeCodeGlobalConfigPath();
  let existingContent = "";

  try {
    existingContent = fs.readFileSync(configPath, "utf-8");
  } catch (error) {
    // If file doesn't exist, we'll create it with empty content
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      // Continue with empty content
    } else {
      // For other errors, re-throw
      throw error;
    }
  }

  const result = updateClaudeCodeGlobalConfigWithAnalysis(
    existingContent,
    servers
  );

  // No need to create parent directory for ~/.claude.json (it's in home directory)

  // Write updated content
  fs.writeFileSync(configPath, result.updatedConfig, "utf-8");

  return result;
}
