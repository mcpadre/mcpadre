// pattern: Functional Core
// PyPI package outdated detection logic

import { execa } from "execa";

import { PythonPackageError } from "../../utils/errors.js";

import type { AuditResult, PypiVersionResponse } from "./types.js";
import type { Logger } from "pino";

/**
 * Check if a PyPI package has a newer version available
 */
export async function checkPypiOutdated(
  packageName: string,
  currentVersion: string,
  logger: Logger
): Promise<{
  latestVersion: string | null;
  isOutdated: boolean;
  upgradeType?: "major" | "minor" | "patch";
  error?: string;
}> {
  try {
    logger.debug(`Checking PyPI registry for ${packageName}@${currentVersion}`);

    const response = await fetch(`https://pypi.org/pypi/${packageName}/json`);
    if (!response.ok) {
      if (response.status === 404) {
        return {
          latestVersion: null,
          isOutdated: false,
          error: `Package ${packageName} not found in PyPI registry`,
        };
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as PypiVersionResponse;
    const latestVersion = data.info.version;

    if (!latestVersion) {
      return {
        latestVersion: null,
        isOutdated: false,
        error: `No latest version found for ${packageName}`,
      };
    }

    // For Python versions, we'll do a simple string comparison first
    // and try to parse version numbers for semantic comparison
    const isOutdated = compareVersions(currentVersion, latestVersion);
    let upgradeType: "major" | "minor" | "patch" | undefined;

    if (isOutdated) {
      upgradeType = determineUpgradeType(currentVersion, latestVersion);
    }

    return {
      latestVersion,
      isOutdated,
      ...(upgradeType && { upgradeType }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug(
      `Failed to check PyPI outdated for ${packageName}: ${message}`
    );
    return {
      latestVersion: null,
      isOutdated: false,
      error: `Failed to check PyPI registry: ${message}`,
    };
  }
}

/**
 * Run security audit for Python package dependencies
 */
export async function auditPythonPackage(
  serverDir: string,
  logger: Logger
): Promise<AuditResult> {
  try {
    logger.debug(`Running pip-audit in ${serverDir}`);

    // Try uvx pip-audit first, fallback to direct pip-audit
    // Both commands may return exit code 1 when vulnerabilities are found
    let auditOutput: string;
    try {
      logger.debug(`Running uvx pip-audit in ${serverDir}`);
      const uvxResult = await execa(
        "uvx",
        ["pip-audit", ".", "--format", "json"],
        {
          cwd: serverDir,
          reject: false, // Don't throw on exit code 1
        }
      );

      if (uvxResult.stdout) {
        auditOutput = uvxResult.stdout;
        logger.debug(
          `uvx pip-audit completed with exit code ${uvxResult.exitCode}`
        );
      } else {
        throw new PythonPackageError("uvx pip-audit failed");
      }
    } catch {
      logger.debug("uvx pip-audit failed, trying direct pip-audit...");
      try {
        const pipResult = await execa("pip-audit", [".", "--format", "json"], {
          cwd: serverDir,
          reject: false, // Don't throw on exit code 1
        });

        if (pipResult.stdout) {
          auditOutput = pipResult.stdout;
          logger.debug(
            `pip-audit completed with exit code ${pipResult.exitCode}`
          );
        } else {
          throw new PythonPackageError("pip-audit failed");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new PythonPackageError(`Audit check failed: ${message}`);
      }
    }

    // Parse pip-audit JSON output
    const auditData = JSON.parse(auditOutput);

    // pip-audit format: array of vulnerability objects
    if (Array.isArray(auditData)) {
      if (auditData.length === 0) {
        return {
          hasVulnerabilities: false,
          vulnerabilityCount: 0,
          severity: "none",
          message: "No vulnerabilities found",
        };
      }

      // Extract severities from vulnerabilities
      const severities = auditData.map((vuln: unknown) => {
        if (
          typeof vuln === "object" &&
          vuln !== null &&
          "aliases" in vuln &&
          Array.isArray((vuln as { aliases?: unknown[] }).aliases)
        ) {
          const aliases = (vuln as { aliases: unknown[] }).aliases;
          const firstAlias = aliases[0];
          if (
            typeof firstAlias === "object" &&
            firstAlias !== null &&
            "severity" in firstAlias
          ) {
            return (firstAlias as { severity: string }).severity;
          }
        }
        return "moderate";
      });
      const highestSeverity = getHighestSeverity(severities);

      return {
        hasVulnerabilities: true,
        vulnerabilityCount: auditData.length,
        severity: highestSeverity,
        message: `${auditData.length} vulnerabilities found (highest: ${highestSeverity})`,
      };
    }

    // Fallback for unexpected format
    return {
      hasVulnerabilities: false,
      vulnerabilityCount: 0,
      severity: "none",
      message: "Unable to parse audit results",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug(`Python audit failed: ${message}`);

    // Check if it's a "no vulnerabilities" result
    if (message.includes("No known vulnerabilities found")) {
      return {
        hasVulnerabilities: false,
        vulnerabilityCount: 0,
        severity: "none",
        message: "No vulnerabilities found",
      };
    }

    return {
      hasVulnerabilities: false,
      vulnerabilityCount: 0,
      severity: "none",
      message: `Audit check failed: ${message}`,
    };
  }
}

/**
 * Compare two Python version strings using PEP 440 rules (simplified)
 * Returns true if version2 is newer than version1
 */
function compareVersions(version1: string, version2: string): boolean {
  if (version1 === version2) {
    return false;
  }

  // Parse version parts (major.minor.patch)
  const v1Parts = parseVersionParts(version1);
  const v2Parts = parseVersionParts(version2);

  // Compare each part
  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] ?? 0;
    const v2Part = v2Parts[i] ?? 0;

    if (v2Part > v1Part) {
      return true;
    } else if (v2Part < v1Part) {
      return false;
    }
  }

  return false;
}

/**
 * Determine upgrade type between two Python versions
 */
function determineUpgradeType(
  currentVersion: string,
  latestVersion: string
): "major" | "minor" | "patch" {
  const current = parseVersionParts(currentVersion);
  const latest = parseVersionParts(latestVersion);

  // Check major version
  if ((latest[0] ?? 0) > (current[0] ?? 0)) {
    return "major";
  }

  // Check minor version
  if ((latest[1] ?? 0) > (current[1] ?? 0)) {
    return "minor";
  }

  // Assume patch otherwise
  return "patch";
}

/**
 * Parse version string into numeric parts
 */
function parseVersionParts(version: string): number[] {
  // Remove common prefixes and suffixes
  const cleaned = version
    .replace(/^v/, "")
    .replace(/[+-].*$/, "")
    .split(/[.\-_]/);

  return cleaned.map(part => {
    const num = parseInt(part, 10);
    return isNaN(num) ? 0 : num;
  });
}

/**
 * Determine the highest severity from a list of severities
 */
function getHighestSeverity(
  severities: string[]
): "low" | "moderate" | "high" | "critical" | "none" {
  const severityOrder = ["none", "low", "moderate", "high", "critical"];
  const highest = severities.reduce((max, current) => {
    const maxIndex = severityOrder.indexOf(max);
    const currentIndex = severityOrder.indexOf(current);
    return currentIndex > maxIndex ? current : max;
  }, "none");

  return highest as "low" | "moderate" | "high" | "critical" | "none";
}
