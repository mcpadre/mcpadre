// pattern: Functional Core
// System information collection for diagnostics

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { SystemInfo } from "./types.js";

// Function to get mcpadre version from package.json
function getMcpadreVersion(): string {
  try {
    // Go up from src/diagnostics to find the package.json
    const packageJsonPath = path.resolve(__dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    return packageJson.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

// Function to detect Linux distribution
async function getLinuxDistribution(): Promise<string | undefined> {
  if (os.type() !== "Linux") {
    return undefined;
  }

  try {
    const osRelease = await readFile("/etc/os-release", "utf8");
    const nameMatch = osRelease.match(/^PRETTY_NAME="?(.+?)"?$/m);
    if (nameMatch) {
      return nameMatch[1];
    }

    const idMatch = osRelease.match(/^ID="?(.+?)"?$/m);
    const versionMatch = osRelease.match(/^VERSION="?(.+?)"?$/m);
    if (idMatch) {
      const idValue = idMatch[1];
      const versionValue = versionMatch?.[1];
      return versionValue ? `${idValue} ${versionValue}` : idValue;
    }
  } catch {
    // Fallback attempts
    try {
      const lsbRelease = await readFile("/etc/lsb-release", "utf8");
      const distroMatch = lsbRelease.match(/^DISTRIB_DESCRIPTION="?(.+?)"?$/m);
      if (distroMatch) {
        return distroMatch[1];
      }
    } catch {
      // Final fallback
      try {
        const issue = await readFile("/etc/issue", "utf8");
        const firstLine = issue.split("\n")[0];
        return firstLine ? firstLine.trim() || undefined : undefined;
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

// Function to detect package manager versions
async function getPackageManagerVersions(): Promise<
  SystemInfo["packageManager"]
> {
  const result: SystemInfo["packageManager"] = {};

  // Check for pnpm version (primary package manager)
  try {
    const { execa } = await import("execa");
    const { stdout } = await execa("pnpm", ["--version"], { timeout: 5000 });
    result.pnpm = stdout.trim();
  } catch {
    // pnpm not available
  }

  // Check for npm version (fallback)
  try {
    const { execa } = await import("execa");
    const { stdout } = await execa("npm", ["--version"], { timeout: 5000 });
    result.npm = stdout.trim();
  } catch {
    // npm not available
  }

  return result;
}

// Function to check working directory context
async function getWorkingDirectoryContext(): Promise<
  SystemInfo["workingDirectory"]
> {
  const cwd = process.cwd();

  // Check for project config (mcpadre.yaml)
  let hasProjectConfig = false;
  try {
    const { access } = await import("node:fs/promises");
    await access(path.join(cwd, "mcpadre.yaml"));
    hasProjectConfig = true;
  } catch {
    // No project config found
  }

  // Check if we're in a git repository
  let isGitRepository = false;
  try {
    const { access } = await import("node:fs/promises");
    await access(path.join(cwd, ".git"));
    isGitRepository = true;
  } catch {
    // Not a git repository or .git not accessible
  }

  return {
    hasProjectConfig,
    isGitRepository,
  };
}

// Main function to collect all system information
export async function collectSystemInfo(): Promise<SystemInfo> {
  const [distribution, packageManager, workingDirectory] = await Promise.all([
    getLinuxDistribution(),
    getPackageManagerVersions(),
    getWorkingDirectoryContext(),
  ]);

  return {
    mcpadre: {
      version: getMcpadreVersion(),
    },
    nodejs: {
      version: process.version,
    },
    os: {
      type: os.type(),
      platform: os.platform(),
      arch: os.arch(),
      version: os.release(),
      ...(distribution && { distribution }),
    },
    packageManager,
    workingDirectory,
  };
}
