// pattern: Functional Core

import type { NodeOptionsV1 } from "../../config/types/v1/server/index.js";

/**
 * Parsed package.json structure for version comparison
 */
export interface ParsedPackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  engines?: {
    node?: string;
  };
}

/**
 * Result of determining Node upgrade action
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
 * Version files content for Node.js tooling integration
 */
export interface VersionFiles {
  /** Content for .node-version file */
  nodeVersion: string;
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
 * Determines what action to take for Node.js dependency management
 *
 * @param existingPackageJson Parsed existing package.json (null if file doesn't exist)
 * @param newConfig New Node.js configuration from mcpadre config
 * @param options Upgrade behavior options
 * @returns Action decision with changes and reasoning
 */
export function determineNodeUpgrade(
  existingPackageJson: ParsedPackageJson | null,
  newConfig: NodeOptionsV1,
  options: UpgradeOptions
): VersionChangeResult {
  // No existing configuration - fresh install
  if (!existingPackageJson) {
    return {
      hasChanges: true,
      changes: ["Creating new Node.js project"],
      action: "CREATE",
    };
  }

  // Detect version changes
  const versionChanges = detectVersionChanges(existingPackageJson, newConfig);

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
 * @param existingPackageJson Parsed existing package.json
 * @param newNode New Node.js configuration
 * @returns Change detection result
 */
export function detectVersionChanges(
  existingPackageJson: ParsedPackageJson,
  newNode: NodeOptionsV1
): { hasChanges: boolean; changes: string[] } {
  const changes: string[] = [];

  // Check Node.js version if specified in new config
  if (newNode.nodeVersion) {
    const existingNodeVersion = existingPackageJson.engines?.node;
    const newNodeVersionSpec = `>=${newNode.nodeVersion}`;
    if (existingNodeVersion !== newNodeVersionSpec) {
      changes.push(
        `Node.js version: ${existingNodeVersion ?? "unspecified"} → ${newNodeVersionSpec}`
      );
    }
  }

  // Check package version
  const existingDeps = existingPackageJson.dependencies ?? {};
  const newPackageSpec = newNode.version;

  const existingPackageVersion = existingDeps[newNode.package];

  if (!existingPackageVersion || existingPackageVersion !== newPackageSpec) {
    changes.push(
      `Package version: ${existingPackageVersion ?? "not found"} → ${newPackageSpec}`
    );
  }

  return {
    hasChanges: changes.length > 0,
    changes,
  };
}

/**
 * Generate package.json content for a Node.js MCP server
 *
 * @param serverName Name of the server (used in project name)
 * @param node Node.js configuration
 * @returns Complete package.json content as string
 */
export function generatePackageJson(
  serverName: string,
  node: NodeOptionsV1
): string {
  const packageJsonObj = {
    name: `mcpadre-deps-${serverName}`,
    version: "0.0.0",
    private: true,
    ...(node.nodeVersion && {
      engines: {
        node: `>=${node.nodeVersion}`,
      },
    }),
    dependencies: {
      [node.package]: node.version,
    },
  };

  return `${JSON.stringify(packageJsonObj, null, 2)}\n`;
}

/**
 * Parse package.json content for version comparison
 *
 * @param content Raw JSON content
 * @returns Parsed structure with relevant fields
 */
export function parsePackageJson(content: string): ParsedPackageJson {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;

    const result: ParsedPackageJson = {};

    // Extract name
    if (typeof parsed["name"] === "string") {
      result.name = parsed["name"];
    }

    // Extract dependencies
    if (parsed["dependencies"] && typeof parsed["dependencies"] === "object") {
      const deps = parsed["dependencies"] as Record<string, unknown>;
      const cleanDeps: Record<string, string> = {};

      for (const [key, value] of Object.entries(deps)) {
        if (typeof value === "string") {
          cleanDeps[key] = value;
        }
      }

      result.dependencies = cleanDeps;
    }

    // Extract engines
    if (parsed["engines"] && typeof parsed["engines"] === "object") {
      const engines = parsed["engines"] as Record<string, unknown>;
      const cleanEngines: { node?: string } = {};

      if (typeof engines["node"] === "string") {
        cleanEngines.node = engines["node"];
      }

      if (Object.keys(cleanEngines).length > 0) {
        result.engines = cleanEngines;
      }
    }

    return result;
  } catch {
    // If JSON parsing fails, return minimal structure
    return {};
  }
}

/**
 * Generate content for Node.js version files
 *
 * @param nodeVersion Node.js version string (e.g., "18.19.0")
 * @returns Version file contents
 */
export function generateVersionFiles(nodeVersion: string): VersionFiles {
  return {
    nodeVersion: `${nodeVersion}\n`,
    toolVersions: `nodejs ${nodeVersion}\n`,
  };
}
