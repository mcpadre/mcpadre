// pattern: Functional Core

import { rcompare as semverRcompare, valid as isValidSemver } from "semver";

import type { PackageVersion } from "./types.js";

/**
 * Sort package versions by semantic versioning rules where possible,
 * falling back to string comparison for non-semver versions
 */
export function sortVersionsByRecency(
  versions: PackageVersion[]
): PackageVersion[] {
  return versions.sort((a, b) => {
    // Both versions are valid semver - use semver comparison
    if (a.isSemver && b.isSemver) {
      return semverRcompare(a.version, b.version);
    }

    // Neither version is semver - use publishedAt date
    if (!a.isSemver && !b.isSemver) {
      return (
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
    }

    // Mixed semver and non-semver - prioritize semver versions
    if (a.isSemver && !b.isSemver) {
      return -1;
    }
    if (!a.isSemver && b.isSemver) {
      return 1;
    }

    return 0;
  });
}

/**
 * Check if a version string is valid semver
 */
export function isValidSemanticVersion(version: string): boolean {
  return isValidSemver(version) !== null;
}

/**
 * Validate a package name against common registry patterns
 */
export interface PackageNameValidationRules {
  /** Allow scoped packages (e.g., @org/package) */
  allowScoped?: boolean;
  /** Minimum length */
  minLength?: number;
  /** Maximum length */
  maxLength?: number;
  /** Custom regex pattern to match */
  pattern?: RegExp;
  /** Additional forbidden characters */
  forbiddenChars?: string[];
}

/**
 * Validate package name with flexible rules
 */
export function validatePackageName(
  packageName: string,
  rules: PackageNameValidationRules = {}
): boolean {
  const {
    allowScoped = true,
    minLength = 1,
    maxLength = 214,
    pattern,
    forbiddenChars = [],
  } = rules;

  // Basic length checks
  if (packageName.length < minLength || packageName.length > maxLength) {
    return false;
  }

  // Custom pattern check
  if (pattern && !pattern.test(packageName)) {
    return false;
  }

  // Forbidden characters check
  for (const char of forbiddenChars) {
    if (packageName.includes(char)) {
      return false;
    }
  }

  // Handle scoped packages
  if (packageName.startsWith("@")) {
    if (!allowScoped) {
      return false;
    }

    const parts = packageName.split("/");
    if (parts.length !== 2) {
      return false;
    }

    const [scope, name] = parts;
    if (!scope || !name || scope.length <= 1 || name.length === 0) {
      return false;
    }
  }

  return true;
}

/**
 * Standard error handling for registry API responses
 */
export function handleRegistryError(
  error: unknown,
  registryName: string,
  operation: string
): string {
  if (error instanceof Error) {
    if (error.message.includes("404") || error.message.includes("Not Found")) {
      return `Package not found in ${registryName}`;
    }
    if (error.message.includes("403") || error.message.includes("Forbidden")) {
      return `Access denied to ${registryName} registry`;
    }
    if (error.message.includes("rate limit")) {
      return `${registryName} rate limit exceeded. Please try again later`;
    }
    return `${registryName} registry error: ${error.message}`;
  }

  return `Failed to ${operation} from ${registryName}: ${String(error)}`;
}

/**
 * Parse and standardize version information from different registries
 */
export function createPackageVersion(
  version: string,
  publishedAt: string | Date,
  metadata: Record<string, unknown> = {}
): PackageVersion {
  const publishedAtString =
    publishedAt instanceof Date ? publishedAt.toISOString() : publishedAt;

  return {
    version,
    publishedAt: publishedAtString,
    isSemver: isValidSemanticVersion(version),
    metadata,
  };
}

/**
 * Filter versions based on options
 */
export function filterVersions(
  versions: PackageVersion[],
  options: {
    includePrerelease?: boolean;
    versionLimit?: number;
  } = {}
): PackageVersion[] {
  let filtered = versions;

  // Filter out pre-release versions if not requested
  if (!options.includePrerelease) {
    filtered = filtered.filter(v => {
      // For semver, check if it's a prerelease
      if (v.isSemver) {
        return !v.version.includes("-");
      }
      // For non-semver, check for common prerelease indicators
      const lowerVersion = v.version.toLowerCase();
      return !(
        lowerVersion.includes("alpha") ||
        lowerVersion.includes("beta") ||
        lowerVersion.includes("rc") ||
        lowerVersion.includes("pre") ||
        lowerVersion.includes("dev") ||
        lowerVersion.includes("snapshot")
      );
    });
  }

  // Apply version limit
  if (options.versionLimit && options.versionLimit > 0) {
    filtered = filtered.slice(0, options.versionLimit);
  }

  return filtered;
}

/**
 * Format version for display in prompts
 */
export function formatVersionForDisplay(
  version: PackageVersion,
  showDate = false
): string {
  if (!showDate) {
    return version.version;
  }

  const date = new Date(version.publishedAt);
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return `${version.version} (${formattedDate})`;
}
