// pattern: Functional Core
// NPM package outdated detection logic

import { execa } from "execa";
import { access } from "fs/promises";
import {
  diff as semverDiff,
  gt as semverGt,
  valid as isValidSemver,
} from "semver";

import { NodePackageError } from "../../utils/errors.js";

import type { AuditResult, NpmVersionResponse } from "./types.js";
import type { Logger } from "pino";

/**
 * Check if an NPM package has a newer version available
 */
export async function checkNpmOutdated(
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
    logger.debug(`Checking NPM registry for ${packageName}@${currentVersion}`);

    const response = await fetch(`https://registry.npmjs.org/${packageName}`);
    if (!response.ok) {
      if (response.status === 404) {
        return {
          latestVersion: null,
          isOutdated: false,
          error: `Package ${packageName} not found in NPM registry`,
        };
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as NpmVersionResponse;
    const latestVersion = data["dist-tags"].latest;

    if (!latestVersion) {
      return {
        latestVersion: null,
        isOutdated: false,
        error: `No latest version found for ${packageName}`,
      };
    }

    // Validate both versions are semver-compatible
    if (!isValidSemver(currentVersion) || !isValidSemver(latestVersion)) {
      logger.debug(
        `Non-semver versions detected: current=${currentVersion}, latest=${latestVersion}`
      );
      // For non-semver versions, simple string comparison
      const isOutdated = currentVersion !== latestVersion;
      return {
        latestVersion,
        isOutdated,
        ...(isOutdated && { upgradeType: "major" as const }),
      };
    }

    // Check if update is available
    const isOutdated = semverGt(latestVersion, currentVersion);

    if (!isOutdated) {
      return {
        latestVersion,
        isOutdated,
      };
    }

    // Determine upgrade type
    const diffType = semverDiff(currentVersion, latestVersion);
    let upgradeType: "major" | "minor" | "patch";

    switch (diffType) {
      case "major":
      case "premajor":
        upgradeType = "major";
        break;
      case "minor":
      case "preminor":
        upgradeType = "minor";
        break;
      case "patch":
      case "prepatch":
      case "prerelease":
      default:
        upgradeType = "patch";
        break;
    }

    return {
      latestVersion,
      isOutdated,
      upgradeType,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug(`Failed to check NPM outdated for ${packageName}: ${message}`);
    return {
      latestVersion: null,
      isOutdated: false,
      error: `Failed to check NPM registry: ${message}`,
    };
  }
}

/**
 * Run security audit for NPM package dependencies
 */
export async function auditNpmPackage(
  serverDir: string,
  logger: Logger
): Promise<AuditResult> {
  try {
    logger.debug(`Running pnpm audit in ${serverDir}`);

    // Check if server directory exists (server must be installed first)
    try {
      await access(serverDir);
    } catch {
      return {
        hasVulnerabilities: false,
        vulnerabilityCount: 0,
        severity: "none",
        message: "Server not installed yet",
      };
    }

    // Try pnpm audit first, fallback to npm audit
    // Both commands return exit code 1 when vulnerabilities are found, so use reject: false
    let auditOutput: string;
    try {
      logger.debug(`Running pnpm audit in ${serverDir}`);
      const pnpmResult = await execa(
        "pnpm",
        ["audit", "--audit-level", "info", "--json"],
        {
          cwd: serverDir,
          reject: false, // Don't throw on exit code 1
        }
      );

      if (pnpmResult.stdout) {
        auditOutput = pnpmResult.stdout;
        logger.debug(
          `pnpm audit completed with exit code ${pnpmResult.exitCode}`
        );
      } else {
        throw new NodePackageError("pnpm audit failed");
      }
    } catch {
      logger.debug("pnpm audit failed, trying npm audit...");
      try {
        const npmResult = await execa(
          "npm",
          ["audit", "--audit-level", "info", "--json"],
          {
            cwd: serverDir,
            reject: false, // Don't throw on exit code 1
          }
        );

        if (npmResult.stdout) {
          auditOutput = npmResult.stdout;
          logger.debug(
            `npm audit completed with exit code ${npmResult.exitCode}`
          );
        } else {
          throw new NodePackageError("npm audit failed");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new NodePackageError(`Audit check failed: ${message}`);
      }
    }

    // Parse audit results
    const auditData = JSON.parse(auditOutput);

    // Handle pnpm audit format
    if (auditData.advisories) {
      const advisories = Object.values(auditData.advisories) as {
        severity: string;
      }[];

      if (advisories.length === 0) {
        return {
          hasVulnerabilities: false,
          vulnerabilityCount: 0,
          severity: "none",
          message: "No vulnerabilities found",
        };
      }

      const severities = advisories.map(a => a.severity);
      const highestSeverity = getHighestSeverity(severities);

      return {
        hasVulnerabilities: true,
        vulnerabilityCount: advisories.length,
        severity: highestSeverity,
        message: `${advisories.length} vulnerabilities found (highest: ${highestSeverity})`,
      };
    }

    // Handle npm audit format (npm v7+)
    if (auditData.vulnerabilities) {
      const vulns = auditData.vulnerabilities;
      const total = Object.keys(vulns).length;

      if (total === 0) {
        return {
          hasVulnerabilities: false,
          vulnerabilityCount: 0,
          severity: "none",
          message: "No vulnerabilities found",
        };
      }

      // Extract severities from vulnerability objects
      const severities = Object.values(vulns).flatMap((vuln: unknown) => {
        if (typeof vuln === "object" && vuln !== null && "via" in vuln) {
          const viaArray = (vuln as { via?: unknown[] }).via;
          return (
            viaArray
              ?.map((v: unknown) => {
                if (typeof v === "object" && v !== null && "severity" in v) {
                  return (v as { severity: string }).severity;
                }
                return null;
              })
              .filter((s): s is string => Boolean(s)) ?? []
          );
        }
        return [];
      });

      const highestSeverity = getHighestSeverity(severities);

      return {
        hasVulnerabilities: true,
        vulnerabilityCount: total,
        severity: highestSeverity,
        message: `${total} vulnerabilities found (highest: ${highestSeverity})`,
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
    logger.debug(`NPM audit failed: ${message}`);

    // Check if it's a "no vulnerabilities" result (common for audit commands)
    if (message.includes("found 0 vulnerabilities")) {
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
