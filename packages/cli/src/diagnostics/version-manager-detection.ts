// pattern: Functional Core
// Version manager detection from tool error outputs

import { existsSync } from "node:fs";
import * as path from "node:path";

import type { ToolStatus } from "./types.js";

// Pattern definitions for different version managers
const VERSION_MANAGER_PATTERNS = {
  asdf: [
    /No version set for .* in \.tool-versions/,
    /No preset version installed for command .*/,
    /asdf: No version set/,
    /Install .* with: asdf install/,
    /asdf: version .* is not installed/,
  ],
  mise: [
    /mise: .* not found/,
    /mise: No version set/,
    /Install .* with: mise install/,
    /mise: version .* is not installed/,
    /.* not found, try installing it with mise/,
  ],
} as const;

// Check for project-level version manager configuration
async function hasProjectVersion(toolName: string): Promise<boolean> {
  const cwd = process.cwd();

  // Check for .tool-versions in current directory and parent directories
  let currentDir = cwd;
  while (currentDir !== path.dirname(currentDir)) {
    const toolVersionsPath = path.join(currentDir, ".tool-versions");
    if (existsSync(toolVersionsPath)) {
      try {
        const fs = await import("node:fs");
        const content = fs.readFileSync(toolVersionsPath, "utf8");
        // Check if the tool is mentioned in .tool-versions
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (
            trimmedLine.startsWith(`${toolName} `) ||
            trimmedLine === toolName
          ) {
            return true;
          }
        }
      } catch {
        // If we can't read the file, assume no version is set
      }
    }
    currentDir = path.dirname(currentDir);
  }

  return false;
}

// Detect version manager type from error output
function detectVersionManagerType(
  errorOutput: string
): "asdf" | "mise" | "unknown" {
  // Check for asdf patterns
  for (const pattern of VERSION_MANAGER_PATTERNS.asdf) {
    if (pattern.test(errorOutput)) {
      return "asdf";
    }
  }

  // Check for mise patterns
  for (const pattern of VERSION_MANAGER_PATTERNS.mise) {
    if (pattern.test(errorOutput)) {
      return "mise";
    }
  }

  // Check for common version manager indicators
  if (
    errorOutput.includes("tool-versions") ||
    errorOutput.includes(".tool-versions")
  ) {
    // If .tool-versions is mentioned but no specific manager detected,
    // check which manager is likely being used
    if (errorOutput.includes("asdf")) {
      return "asdf";
    }
    if (errorOutput.includes("mise")) {
      return "mise";
    }
    // Default to asdf for .tool-versions without specific manager mention
    return "asdf";
  }

  return "unknown";
}

// Main function to detect version manager from error output
export async function detectVersionManager(
  errorOutput: string,
  toolName: string
): Promise<ToolStatus["versionManager"]> {
  // Early return if no error output suggests version manager issues
  if (!errorOutput) {
    return undefined;
  }

  const versionManagerType = detectVersionManagerType(errorOutput);

  // If no version manager detected, return undefined
  if (versionManagerType === "unknown") {
    // Check if there's a .tool-versions file anyway (version manager might be present)
    const hasProjectToolVersions = await hasProjectVersion(toolName);
    if (hasProjectToolVersions) {
      // There's a .tool-versions file but we couldn't detect the manager type
      return {
        type: "unknown",
        hasProjectVersion: true,
        error: errorOutput,
      };
    }
    return undefined;
  }

  // Check if project has version configured
  const hasProjectVersionSet = await hasProjectVersion(toolName);

  return {
    type: versionManagerType,
    hasProjectVersion: hasProjectVersionSet,
    error: errorOutput,
  };
}

// Utility function to check for common version manager files
export function detectVersionManagerFiles(): {
  asdf: boolean;
  mise: boolean;
  toolVersions: string[];
} {
  const cwd = process.cwd();
  const result = {
    asdf: false,
    mise: false,
    toolVersions: [] as string[],
  };

  // Check current directory and parents for version manager files
  let currentDir = cwd;
  while (currentDir !== path.dirname(currentDir)) {
    // Check for .tool-versions (used by both asdf and mise)
    const toolVersionsPath = path.join(currentDir, ".tool-versions");
    if (existsSync(toolVersionsPath)) {
      result.toolVersions.push(toolVersionsPath);
      result.asdf = true; // .tool-versions implies asdf compatibility
    }

    // Check for .mise.toml or mise.toml (mise-specific)
    const miseTomlPaths = [
      path.join(currentDir, ".mise.toml"),
      path.join(currentDir, "mise.toml"),
    ];
    for (const misePath of miseTomlPaths) {
      if (existsSync(misePath)) {
        result.mise = true;
      }
    }

    currentDir = path.dirname(currentDir);
  }

  return result;
}
