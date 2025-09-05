// pattern: Functional Core

/**
 * Represents a version of a package from a registry
 */
export interface PackageVersion {
  /** The version string (e.g., "1.2.3", "latest", "0.1.0-beta.1") */
  version: string;
  /** ISO 8601 timestamp when this version was published */
  publishedAt: string;
  /** Whether this version follows semver (for sorting purposes) */
  isSemver: boolean;
  /** Additional metadata specific to the registry */
  metadata?: Record<string, unknown>;
}

/**
 * Information about a package from a registry
 */
export interface PackageInfo {
  /** The package name */
  name: string;
  /** Description of the package */
  description?: string;
  /** Available versions of the package */
  versions: PackageVersion[];
  /** The latest version according to the registry */
  latestVersion?: string;
  /** Additional registry-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a package search operation
 */
export interface PackageSearchResult {
  /** The package name */
  name: string;
  /** Package description */
  description?: string;
  /** Latest version */
  version?: string;
  /** Search relevance score */
  score?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for fetching package information
 */
export interface PackageFetchOptions {
  /** Include pre-release versions */
  includePrerelease?: boolean;
  /** Limit the number of versions returned */
  versionLimit?: number;
}

/**
 * Options for searching packages
 */
export interface PackageSearchOptions {
  /** Search query */
  query: string;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Types of registries supported
 */
export type RegistryType = "node" | "python" | "container";

/**
 * Configuration for a specific registry
 */
export interface RegistryConfig {
  /** Type of registry */
  type: RegistryType;
  /** Display name for the registry */
  displayName: string;
  /** Base URL for the registry API */
  baseUrl?: string;
  /** Additional configuration options */
  options?: Record<string, unknown>;
}

/**
 * Result of fetching package information
 */
export type PackageFetchResult =
  | { success: true; package: PackageInfo }
  | { success: false; error: string };

/**
 * Result of searching packages
 */
export type PackageSearchResults =
  | { success: true; results: PackageSearchResult[] }
  | { success: false; error: string };

/**
 * Interface for registry adapters
 */
export interface RegistryAdapter {
  /** Registry configuration */
  readonly config: RegistryConfig;

  /**
   * Fetch detailed information about a specific package
   */
  fetchPackage(
    packageName: string,
    options?: PackageFetchOptions
  ): Promise<PackageFetchResult>;

  /**
   * Search for packages in the registry
   */
  searchPackages?(options: PackageSearchOptions): Promise<PackageSearchResults>;

  /**
   * Validate that a package name is valid for this registry
   */
  validatePackageName(packageName: string): boolean;
}
