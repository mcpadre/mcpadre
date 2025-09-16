// pattern: Functional Core
// Utilities for determining and formatting Python version requirements

import { createCommand } from "../command/index.js";

import type { Logger } from "pino";

/**
 * PyPI package metadata response structure
 */
export interface PyPIPackageInfo {
  info: {
    requires_python?: string;
  };
}

/**
 * Fetch Python version requirements from PyPI package metadata
 *
 * @param packageName The Python package name (e.g., "mcp-sleep")
 * @param packageVersion The package version (e.g., "0.1.1")
 * @returns The requires_python field from PyPI, or null if not found or on error
 */
export async function fetchPackageRequiresPython(
  packageName: string,
  packageVersion: string
): Promise<string | null> {
  try {
    const url = `https://pypi.org/pypi/${packageName}/${packageVersion}/json`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as PyPIPackageInfo;
    return data.info.requires_python ?? null;
  } catch {
    // Return null on any error (network, parsing, etc.)
    return null;
  }
}

/**
 * Generate a Python version specification string
 *
 * @param pythonVersion The Python version string (e.g., "3.11.0" or "3.13")
 * @returns A version specification like ">=3.11" or "==3.11.0"
 */
export function getPythonVersionSpec(
  pythonVersion: string,
  exact = false
): string {
  if (exact) {
    return `==${pythonVersion}`;
  }

  // Parse version to extract major.minor
  const versionMatch = pythonVersion.match(/^(\d+)\.(\d+)/);
  if (!versionMatch) {
    throw new Error(`Invalid Python version format: ${pythonVersion}`);
  }

  const major = versionMatch[1];
  const minor = versionMatch[2];
  return `>=${major}.${minor}`;
}

/**
 * Parse Python version from `python --version` output
 *
 * @param versionOutput Output from `python --version` command (e.g., "Python 3.11.0")
 * @returns The version string (e.g., "3.11.0") or null if parsing fails
 */
export function parsePythonVersionOutput(versionOutput: string): string | null {
  // Expected format: "Python 3.11.0" or "Python 3.13.1"
  const match = versionOutput.trim().match(/^Python\s+(\d+\.\d+\.\d+)/);
  return match?.[1] ?? null;
}

/**
 * Determine Python version requirement for pyproject.toml
 * Priority: explicit config > PyPI package requirement > system Python version
 *
 * @param pythonVersion - Explicit Python version from config (optional)
 * @param packageName - Python package name
 * @param packageVersion - Python package version
 * @param serverDir - Directory to run python --version in
 * @param logger - Logger instance
 * @returns Python version requirement string (e.g., "==3.11.0", ">=3.13")
 * @throws Error if no Python version can be determined
 */
export async function determinePythonRequirement(
  pythonVersion: string | undefined,
  packageName: string,
  packageVersion: string,
  serverDir: string,
  logger: Logger
): Promise<string> {
  // If pythonVersion is explicitly set, use exact version
  if (pythonVersion) {
    return `==${pythonVersion}`;
  }

  // Try to get package requirements from PyPI
  logger.debug(
    { package: packageName, version: packageVersion },
    "Fetching package requirements from PyPI"
  );
  try {
    const pypiRequirement = await fetchPackageRequiresPython(
      packageName,
      packageVersion
    );
    if (pypiRequirement) {
      logger.debug(
        { requirement: pypiRequirement },
        "Found PyPI package requirement"
      );
      return pypiRequirement;
    }
  } catch (error) {
    logger.debug({ error }, "Failed to fetch PyPI package requirements");
  }

  // Fallback to system Python version
  try {
    const pythonCmd = createCommand("python", logger)
      .addArgs(["--version"])
      .currentDir(serverDir);

    const pythonResult = await pythonCmd.output();
    const systemPythonVersion = parsePythonVersionOutput(pythonResult);

    if (systemPythonVersion) {
      const requirement = getPythonVersionSpec(systemPythonVersion, false);
      logger.debug(
        { systemVersion: systemPythonVersion, requirement },
        "Using system Python version requirement"
      );
      return requirement;
    }
  } catch (error) {
    logger.debug({ error }, "Failed to detect system Python version");
  }

  // This should never happen if Python is properly installed
  throw new Error(
    "Could not determine Python version requirement. " +
      "Please ensure Python is installed and accessible, " +
      "or specify pythonVersion in your configuration."
  );
}
