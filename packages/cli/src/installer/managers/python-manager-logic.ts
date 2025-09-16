// pattern: Functional Core

import { parse as parseToml, stringify as stringifyToml } from "@iarna/toml";

import {
  PythonOptions,
  PythonVersionManager,
} from "../../config/types/index.js";

/**
 * The specific version managers we support for reshimming.
 * This is a subset of PythonVersionManager, excluding 'auto' and 'none'.
 */
export type PythonReshimManager = Exclude<PythonVersionManager, "auto">;

/**
 * Parsed pyproject.toml structure for version comparison
 */
export interface ParsedPyprojectToml {
  project?: {
    dependencies?: string[];
    "requires-python"?: string;
  };
}

/**
 * Result of determining Python upgrade action
 */
export interface VersionChangeResult {
  /** Whether any changes were detected */
  hasChanges: boolean;
  /** List of human-readable changes */
  changes: string[];
  /** Action to take based on changes and configuration */
  action: "CREATE" | "SYNC" | "UPGRADE" | "SKIP";
}

/**
 * Version files content for Python tooling integration
 */
export interface VersionFiles {
  /** Content for .python-version file */
  pythonVersion: string;
  /** Content for .tool-versions file */
  toolVersions: string;
}

/**
 * Options for determining upgrade action
 */
export interface UpgradeOptions {
  /** Force upgrade even when not normally allowed */
  force: boolean;
  /** Allow implicit upgrades when package versions change */
  implicitUpgrade: boolean;
}

/**
 * Determines what action to take for Python dependency management
 *
 * @param existingToml Parsed existing pyproject.toml (null if file doesn't exist)
 * @param newConfig New Python configuration from mcpadre config
 * @param options Upgrade behavior options
 * @returns Action decision with changes and reasoning
 */
export function determinePythonUpgrade(
  existingToml: ParsedPyprojectToml | null,
  newConfig: PythonOptions,
  options: UpgradeOptions
): VersionChangeResult {
  // No existing configuration - fresh install
  if (!existingToml) {
    return {
      hasChanges: true,
      changes: ["Creating new Python project"],
      action: "CREATE",
    };
  }

  // Detect version changes
  const versionChanges = detectVersionChanges(existingToml, newConfig);

  // No changes detected - just sync environment
  if (!versionChanges.hasChanges) {
    return {
      hasChanges: false,
      changes: [],
      action: "SYNC",
    };
  }

  // Changes detected - check if upgrade is allowed
  const shouldUpgrade = options.force || options.implicitUpgrade;

  if (!shouldUpgrade) {
    return {
      hasChanges: true,
      changes: versionChanges.changes,
      action: "SKIP",
    };
  }

  // Upgrade is allowed
  return {
    hasChanges: true,
    changes: versionChanges.changes,
    action: "UPGRADE",
  };
}

/**
 * Detect version changes between existing and new configuration
 *
 * @param existingToml Parsed existing pyproject.toml
 * @param newPython New Python configuration
 * @returns Change detection result
 */
export function detectVersionChanges(
  existingToml: ParsedPyprojectToml,
  newPython: PythonOptions
): { hasChanges: boolean; changes: string[] } {
  const changes: string[] = [];

  // Check Python version if specified in new config
  if (newPython.pythonVersion) {
    const existingPythonVersion = existingToml.project?.["requires-python"];
    const newPythonVersionSpec = `==${newPython.pythonVersion}`;
    if (existingPythonVersion !== newPythonVersionSpec) {
      changes.push(
        `Python version: ${existingPythonVersion ?? "unspecified"} → ${newPythonVersionSpec}`
      );
    }
  }

  // Check package version
  const existingDeps = existingToml.project?.dependencies ?? [];
  const newPackageSpec = `${newPython.package}==${newPython.version}`;

  const existingPackageDep = existingDeps.find(dep =>
    dep.startsWith(`${newPython.package}==`)
  );

  if (!existingPackageDep || existingPackageDep !== newPackageSpec) {
    changes.push(
      `Package version: ${existingPackageDep ?? "not found"} → ${newPackageSpec}`
    );
  }

  return {
    hasChanges: changes.length > 0,
    changes,
  };
}

/**
 * Generate pyproject.toml content for a Python MCP server
 *
 * @param serverName Name of the server (used in project name)
 * @param python Python configuration
 * @param requiresPython Python version requirement (from config, PyPI, or system)
 * @returns Complete pyproject.toml content
 */
export function generatePyprojectToml(
  serverName: string,
  python: PythonOptions,
  requiresPython: string
): string {
  // Build the project structure as an object - using explicit types for TOML serialization
  const project: Record<string, string | string[]> = {
    name: `mcpadre-deps-${serverName}`,
    version: "0.0.0",
    dependencies: [`${python.package}==${python.version}`],
  };

  // Add requires-python - we always have a value now
  // It's either from explicit config (==X.Y.Z), PyPI (their format), or system (>=X.Y)
  project["requires-python"] = requiresPython;

  // Use TOML library to serialize properly
  const tomlData: Record<string, Record<string, string | string[]>> = {
    project,
  };
  return stringifyToml(tomlData);
}

/**
 * Parse pyproject.toml content for version comparison
 *
 * @param content Raw TOML content
 * @returns Parsed structure with relevant fields
 */
export function parsePyprojectToml(content: string): ParsedPyprojectToml {
  try {
    const parsed = parseToml(content) as Record<string, unknown>;

    // Extract project section and its relevant fields
    const projectSection = parsed["project"] as
      | Record<string, unknown>
      | undefined;
    if (!projectSection) {
      return { project: {} };
    }

    const projectResult: Record<string, unknown> = {};

    // Extract requires-python
    if (typeof projectSection["requires-python"] === "string") {
      projectResult["requires-python"] = projectSection["requires-python"];
    }

    // Extract dependencies
    if (Array.isArray(projectSection["dependencies"])) {
      projectResult["dependencies"] = projectSection["dependencies"].filter(
        (dep): dep is string => typeof dep === "string"
      );
    }

    const result: ParsedPyprojectToml = { project: projectResult };

    return result;
  } catch {
    // If TOML parsing fails, return minimal structure
    return { project: {} };
  }
}

/**
 * Generate content for Python version files
 *
 * @param pythonVersion Python version string (e.g., "3.11.0")
 * @returns Version file contents
 */
export function generateVersionFiles(pythonVersion: string): VersionFiles {
  return {
    pythonVersion: `${pythonVersion}\n`,
    toolVersions: `python ${pythonVersion}\n`,
  };
}

/**
 * Determines which reshim command to run based on configuration and environment.
 * This is a pure function, testable without side-effects.
 *
 * @param managerConfig The user's configured version manager setting.
 * @param whichPath The path returned by `which` for the relevant binary (e.g., python).
 * @returns A single manager to reshim, or "none" if none is needed.
 */
export function determineReshimAction(
  managerConfig: "auto" | "asdf" | "mise" | "none",
  whichPath: string | null
): PythonReshimManager {
  if (managerConfig === "none") {
    return "none";
  }

  if (managerConfig === "asdf") {
    return "asdf";
  }

  if (managerConfig === "mise") {
    return "mise";
  }

  // auto mode
  if (!whichPath) {
    throw new Error(
      "Cannot determine version manager in 'auto' mode because the base executable (e.g., python) was not found in the PATH."
    );
  }

  const hasAsdf = whichPath.includes("asdf");
  const hasMise = whichPath.includes("mise");

  if (hasAsdf && hasMise) {
    throw new Error(
      `Your PATH is configured to use both asdf and mise for the same tool, which is not supported. Path: ${whichPath}`
    );
  }

  if (hasAsdf) {
    return "asdf";
  }

  if (hasMise) {
    return "mise";
  }

  return "none";
}
