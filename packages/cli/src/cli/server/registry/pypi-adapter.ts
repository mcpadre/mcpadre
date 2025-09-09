// pattern: Mixed (unavoidable)
// for the registry adapter interface requirements, we must integrate both
// network I/O (imperative shell) and data transformation (functional core)
// in the same class. The parsing logic is extracted to pure functions.

import {
  createPackageVersion,
  filterVersions,
  handleRegistryError,
  sortVersionsByRecency,
  validatePackageName,
} from "./utils.js";

import type {
  PackageFetchOptions,
  PackageFetchResult,
  PackageInfo,
  PackageSearchOptions,
  PackageSearchResults,
  PackageVersion,
  RegistryAdapter,
  RegistryConfig,
} from "./types.js";

/**
 * PyPI registry API response types
 */
export interface PypiPackageResponse {
  info: {
    name: string;
    version: string;
    summary?: string;
    description?: string;
    [key: string]: unknown;
  };
  releases: Record<
    string,
    {
      upload_time: string;
      [key: string]: unknown;
    }[]
  >;
}

// interface PypiSearchResponse {
//   projects: Array<{
//     name: string;
//     version: string;
//     description?: string;
//     [key: string]: unknown;
//   }>;
// }

/**
 * Parse PyPI API response into standardized PackageInfo
 * Pure function - can be unit tested without network calls
 */
export function parsePypiPackageResponse(
  data: PypiPackageResponse,
  options: PackageFetchOptions = {}
): PackageInfo {
  const { releases } = data;
  const { info } = data;

  // Convert releases to PackageVersion array
  const allVersions: PackageVersion[] = [];

  for (const [version, versionData] of Object.entries(releases)) {
    // Skip empty releases (can happen with yanked packages)
    if (versionData.length === 0) {
      continue;
    }

    // Use the first upload time if multiple files exist for a version
    const uploadTime = versionData[0]?.upload_time ?? new Date().toISOString();

    const packageVersion = createPackageVersion(version, uploadTime, {
      fileCount: versionData.length,
    });

    allVersions.push(packageVersion);
  }

  // Sort versions by recency (latest first)
  const sortedVersions = sortVersionsByRecency(allVersions);

  // Apply filtering based on options
  const filterOptions: { includePrerelease?: boolean; versionLimit?: number } =
    {};
  if (options.includePrerelease !== undefined) {
    filterOptions.includePrerelease = options.includePrerelease;
  }
  if (options.versionLimit !== undefined) {
    filterOptions.versionLimit = options.versionLimit;
  }
  const filteredVersions = filterVersions(sortedVersions, filterOptions);

  const packageInfo: PackageInfo = {
    name: info.name,
    versions: filteredVersions,
    latestVersion: info.version, // PyPI's reported latest version
    metadata: {
      registryType: "python",
      totalVersions: allVersions.length,
      filteredVersions: filteredVersions.length,
    },
  };

  // Add optional description only if it exists
  const description = info.summary ?? info.description;
  if (description) {
    packageInfo.description = description;
  }

  return packageInfo;
}

/**
 * Validate that a package name is valid for PyPI
 * Pure function - can be unit tested
 */
export function validatePypiPackageName(packageName: string): boolean {
  return validatePackageName(packageName, {
    allowScoped: false, // PyPI doesn't use scoped packages like NPM
    minLength: 1,
    maxLength: 214, // Same as NPM for consistency
    // Python package names: letters, numbers, hyphens, underscores, dots
    pattern: /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/,
    forbiddenChars: [" ", "/", "\\"], // Common forbidden characters
  });
}

/**
 * PyPI registry adapter for fetching Python package information
 */
export class PypiRegistryAdapter implements RegistryAdapter {
  readonly config: RegistryConfig;

  constructor(baseUrl = "https://pypi.org") {
    this.config = {
      type: "python",
      displayName: "PyPI Registry",
      baseUrl,
    };
  }

  /**
   * Fetch detailed information about a specific PyPI package
   */
  async fetchPackage(
    packageName: string,
    options: PackageFetchOptions = {}
  ): Promise<PackageFetchResult> {
    if (!this.validatePackageName(packageName)) {
      return {
        success: false,
        error: `Invalid Python package name: ${packageName}`,
      };
    }

    try {
      const encodedName = encodeURIComponent(packageName);
      const url = `${this.config.baseUrl}/pypi/${encodedName}/json`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: `Package '${packageName}' not found in PyPI registry`,
          };
        }
        return {
          success: false,
          error: `PyPI registry error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as PypiPackageResponse;
      const packageInfo = parsePypiPackageResponse(data, options);

      return {
        success: true,
        package: packageInfo,
      };
    } catch (error) {
      const errorMessage = handleRegistryError(error, "PyPI", "fetch package");
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Search for packages in the PyPI registry
   * Note: PyPI doesn't have a direct search API, so this is a placeholder
   */
  async searchPackages(
    _options: PackageSearchOptions
  ): Promise<PackageSearchResults> {
    // PyPI's simple search API is not well-documented and changes frequently
    // For now, we'll return a not-implemented error
    return {
      success: false,
      error:
        "PyPI package search is not implemented yet. Please specify the exact package name.",
    };
  }

  /**
   * Validate that a package name is valid for PyPI
   */
  validatePackageName(packageName: string): boolean {
    return validatePypiPackageName(packageName);
  }
}
