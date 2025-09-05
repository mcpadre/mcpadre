/**
 * Docker-specific semantic version utilities.
 *
 * IMPORTANT: These utilities are specifically for Docker tag version handling
 * and should NOT be used for NPM or Python package versions. Docker tags
 * commonly use 'v' prefixes (e.g., v1.0.0) which need special handling.
 *
 * This module provides normalization and comparison functions that handle
 * both 'v' prefixed and non-prefixed semantic versions consistently.
 */

/**
 * Normalize a Docker version tag by stripping the 'v' prefix if present.
 * This is Docker-specific and should NOT be used for NPM or Python versions.
 *
 * @param version - Docker version tag (e.g., "v1.0.0" or "1.0.0")
 * @returns Normalized version without 'v' prefix (e.g., "1.0.0")
 *
 * @example
 * normalizeDockerVersion("v1.0.0") // returns "1.0.0"
 * normalizeDockerVersion("1.0.0")  // returns "1.0.0"
 */
export function normalizeDockerVersion(version: string): string {
  return version.replace(/^v/, "");
}

/**
 * Check if a Docker tag represents a fully qualified semantic version.
 * Accepts both 'v' prefixed and non-prefixed versions.
 *
 * @param tag - Docker tag to validate
 * @returns true if the tag is a fully qualified semver (X.Y.Z format)
 *
 * @example
 * isFullyQualifiedSemver("v1.0.0")    // returns true
 * isFullyQualifiedSemver("1.0.0")     // returns true
 * isFullyQualifiedSemver("latest")    // returns false
 * isFullyQualifiedSemver("18")        // returns false
 * isFullyQualifiedSemver("18.19")     // returns false
 */
export function isFullyQualifiedSemver(tag: string): boolean {
  return /^v?\d+\.\d+\.\d+/.test(tag);
}

/**
 * Check if a Docker tag represents a partial semantic version.
 * This includes major-only (e.g., "18") or major.minor (e.g., "18.19") versions.
 *
 * @param tag - Docker tag to validate
 * @returns true if the tag is a partial semver
 *
 * @example
 * isPartialSemver("18")        // returns true
 * isPartialSemver("18.19")     // returns true
 * isPartialSemver("v18")       // returns true
 * isPartialSemver("1.0.0")     // returns false (fully qualified)
 * isPartialSemver("latest")    // returns false (named tag)
 */
export function isPartialSemver(tag: string): boolean {
  // Match major-only or major.minor, but not major.minor.patch
  return /^v?\d+(\.\d+)?$/.test(tag) && !isFullyQualifiedSemver(tag);
}

/**
 * Categorize a Docker tag into fully qualified, partial, or named.
 *
 * @param tag - Docker tag to categorize
 * @returns "fully-qualified", "partial", or "named"
 *
 * @example
 * categorizeDockerTag("1.0.0")    // returns "fully-qualified"
 * categorizeDockerTag("18")       // returns "partial"
 * categorizeDockerTag("latest")   // returns "named"
 */
export function categorizeDockerTag(
  tag: string
): "fully-qualified" | "partial" | "named" {
  if (isFullyQualifiedSemver(tag)) {
    return "fully-qualified";
  }
  if (isPartialSemver(tag)) {
    return "partial";
  }
  return "named";
}

/**
 * Compare two Docker version tags, handling 'v' prefix normalization.
 * Returns a number indicating the sort order:
 * - Positive if version1 > version2
 * - Negative if version1 < version2
 * - Zero if version1 === version2
 *
 * @param version1 - First Docker version tag
 * @param version2 - Second Docker version tag
 * @returns Comparison result for sorting
 *
 * @example
 * compareDockerVersions("v2.0.0", "v1.0.0")  // returns positive number
 * compareDockerVersions("1.0.0", "v2.0.0")   // returns negative number
 * compareDockerVersions("v1.0.0", "1.0.0")   // returns 0
 */
export function compareDockerVersions(
  version1: string,
  version2: string
): number {
  const v1 = normalizeDockerVersion(version1);
  const v2 = normalizeDockerVersion(version2);

  // Parse versions into parts
  const parseVersion = (version: string): (string | number)[] => {
    const parts = version
      .split(/[.-]/)
      .map(part => (isNaN(Number(part)) ? part : Number(part)));
    return parts;
  };

  const v1Parts = parseVersion(v1);
  const v2Parts = parseVersion(v2);

  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] ?? 0;
    const v2Part = v2Parts[i] ?? 0;

    // Handle numeric comparison
    if (typeof v1Part === "number" && typeof v2Part === "number") {
      if (v1Part !== v2Part) {
        return v1Part - v2Part;
      }
    }
    // Handle string comparison (for suffixes like alpha, beta)
    else if (typeof v1Part === "string" && typeof v2Part === "string") {
      if (v1Part !== v2Part) {
        return v1Part.localeCompare(v2Part);
      }
    }
    // Mixed types - numbers come first (no suffix is newer than with suffix)
    else if (typeof v1Part === "number") {
      return 1; // number is "greater" than string suffix
    } else if (typeof v2Part === "number") {
      return -1;
    }
  }
  return 0;
}

/**
 * Parse a Docker semantic version tag into major, minor, and patch components.
 * Handles 'v' prefix automatically.
 *
 * @param version - Docker version tag
 * @returns Object with major, minor, and patch numbers, or null if not a valid semver
 *
 * @example
 * parseDockerSemver("v1.2.3")  // returns { major: 1, minor: 2, patch: 3 }
 * parseDockerSemver("1.2.3")   // returns { major: 1, minor: 2, patch: 3 }
 * parseDockerSemver("latest")  // returns null
 */
export function parseDockerSemver(
  version: string
): { major: number; minor: number; patch: number } | null {
  const semverRegex = /^v?(\d+)\.(\d+)\.(\d+)/;
  const match = version.match(semverRegex);

  if (!match) {
    return null;
  }

  return {
    major: parseInt(match[1] ?? "0", 10),
    minor: parseInt(match[2] ?? "0", 10),
    patch: parseInt(match[3] ?? "0", 10),
  };
}

/**
 * Determine the type of version upgrade between two Docker tags.
 *
 * @param currentTag - Current version tag
 * @param targetTag - Target version tag
 * @returns "major", "minor", "patch", or undefined if not a semver upgrade
 *
 * @example
 * determineUpgradeType("v1.0.0", "v2.0.0")  // returns "major"
 * determineUpgradeType("1.0.0", "v1.1.0")   // returns "minor"
 * determineUpgradeType("v1.0.0", "1.0.1")   // returns "patch"
 * determineUpgradeType("latest", "main")    // returns undefined
 */
export function determineUpgradeType(
  currentTag: string,
  targetTag: string
): "major" | "minor" | "patch" | undefined {
  // If tags are the same, it's a digest-only update
  if (currentTag === targetTag) {
    return undefined;
  }

  const current = parseDockerSemver(currentTag);
  const target = parseDockerSemver(targetTag);

  if (!current || !target) {
    // Not semver, return undefined (unknown upgrade type)
    return undefined;
  }

  if (target.major > current.major) return "major";
  if (target.minor > current.minor) return "minor";
  if (target.patch > current.patch) return "patch";

  return undefined;
}
