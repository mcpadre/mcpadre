// pattern: Mixed (unavoidable)
// for the registry adapter interface requirements, we must integrate both
// network I/O (imperative shell) and data transformation (functional core)
// in the same class. The parsing logic is extracted to pure functions.

import {
  createPackageVersion,
  filterVersions,
  handleRegistryError,
  sortVersionsByRecency,
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
 * Docker Hub registry API response types
 */
export interface DockerHubTagsResponse {
  count: number;
  next?: string;
  previous?: string;
  results: {
    name: string;
    tag_last_pushed: string;
    tag_status: string;
    digest: string;
    [key: string]: unknown;
  }[];
}

interface DockerHubRepositoryResponse {
  name: string;
  description?: string;
  star_count: number;
  pull_count: number;
  [key: string]: unknown;
}

/**
 * Parse Docker image name into namespace and repository
 * Pure function - can be unit tested
 */
export function parseDockerImageName(imageName: string): {
  namespace: string;
  repository: string;
  fullName: string;
} {
  // Handle official images (no namespace)
  if (!imageName.includes("/")) {
    return {
      namespace: "library",
      repository: imageName,
      fullName: `library/${imageName}`,
    };
  }

  const parts = imageName.split("/");
  if (parts.length === 2) {
    const namespace = parts[0];
    const repository = parts[1];
    if (!namespace || !repository) {
      throw new Error(`Invalid image name: ${imageName}`);
    }
    return {
      namespace,
      repository,
      fullName: imageName,
    };
  }

  // Handle registry.com/namespace/repo format - just take the last two parts
  const namespace = parts[parts.length - 2];
  const repository = parts[parts.length - 1];
  if (!namespace || !repository) {
    throw new Error(`Invalid image name: ${imageName}`);
  }
  return {
    namespace,
    repository,
    fullName: `${namespace}/${repository}`,
  };
}

/**
 * Validate that an image name is valid for Docker Hub
 * Pure function - can be unit tested
 */
export function validateDockerImageName(imageName: string): boolean {
  if (!imageName || imageName.trim() === "") {
    return false;
  }

  // Basic validation for Docker image names
  // Allow: letters, numbers, hyphens, underscores, dots, and single slash
  const dockerImagePattern = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*\/)?[a-zA-Z0-9._-]*$/;

  if (!dockerImagePattern.test(imageName)) {
    return false;
  }

  // Additional validations
  const parts = imageName.split("/");

  // Too many slashes (only support namespace/repo format)
  if (parts.length > 2) {
    return false;
  }

  // Each part must be valid
  for (const part of parts) {
    if (!part || part.length === 0) {
      return false;
    }

    // Parts cannot start or end with special characters
    if (
      part.startsWith("-") ||
      part.startsWith("_") ||
      part.startsWith(".") ||
      part.endsWith("-") ||
      part.endsWith("_") ||
      part.endsWith(".")
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Parse Docker Hub tags response into standardized PackageInfo
 * Pure function - can be unit tested without network calls
 */
export function parseDockerHubTagsResponse(
  imageName: string,
  tagsData: DockerHubTagsResponse,
  repositoryData?: DockerHubRepositoryResponse,
  options: PackageFetchOptions = {}
): PackageInfo {
  const { results } = tagsData;

  // Convert tags to PackageVersion array
  const allVersions: PackageVersion[] = results
    .filter(tag => tag.tag_status === "active") // Only include active tags
    .map(tag => {
      return createPackageVersion(tag.name, tag.tag_last_pushed, {
        digest: tag.digest,
        status: tag.tag_status,
      });
    });

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

  // Find the "latest" tag if it exists
  const latestTag = results.find(tag => tag.name === "latest");
  const latestVersion = latestTag?.name ?? filteredVersions[0]?.version;

  const packageInfo: PackageInfo = {
    name: imageName,
    versions: filteredVersions,
    metadata: {
      registryType: "container",
      totalVersions: allVersions.length,
      filteredVersions: filteredVersions.length,
      starCount: repositoryData?.star_count,
      pullCount: repositoryData?.pull_count,
      totalTags: tagsData.count,
    },
  };

  // Add optional fields only if they exist
  if (latestVersion) {
    packageInfo.latestVersion = latestVersion;
  }

  if (repositoryData?.description) {
    packageInfo.description = repositoryData.description;
  }

  return packageInfo;
}

/**
 * Docker Hub registry adapter for fetching container image information
 */
export class DockerHubRegistryAdapter implements RegistryAdapter {
  readonly config: RegistryConfig;

  constructor(baseUrl = "https://hub.docker.com") {
    this.config = {
      type: "container",
      displayName: "Docker Hub Registry",
      baseUrl,
    };
  }

  /**
   * Fetch detailed information about a specific Docker image
   */
  async fetchPackage(
    imageName: string,
    options: PackageFetchOptions = {}
  ): Promise<PackageFetchResult> {
    if (!this.validatePackageName(imageName)) {
      return {
        success: false,
        error: `Invalid Docker image name: ${imageName}`,
      };
    }

    try {
      const { fullName } = parseDockerImageName(imageName);

      // Fetch tags from Docker Hub API
      const tagsUrl = `${this.config.baseUrl}/v2/repositories/${fullName}/tags/`;
      const tagsResponse = await fetch(tagsUrl);

      if (!tagsResponse.ok) {
        if (tagsResponse.status === 404) {
          return {
            success: false,
            error: `Docker image '${imageName}' not found in Docker Hub`,
          };
        }
        return {
          success: false,
          error: `Docker Hub API error: ${tagsResponse.status} ${tagsResponse.statusText}`,
        };
      }

      const tagsData = (await tagsResponse.json()) as DockerHubTagsResponse;

      // Optionally fetch repository metadata for additional info
      let repositoryData: DockerHubRepositoryResponse | undefined;
      try {
        const repoUrl = `${this.config.baseUrl}/v2/repositories/${fullName}/`;
        const repoResponse = await fetch(repoUrl);
        if (repoResponse.ok) {
          repositoryData =
            (await repoResponse.json()) as DockerHubRepositoryResponse;
        }
      } catch {
        // Repository metadata is optional, continue without it
      }

      const packageInfo = parseDockerHubTagsResponse(
        imageName,
        tagsData,
        repositoryData,
        options
      );

      return {
        success: true,
        package: packageInfo,
      };
    } catch (error) {
      const errorMessage = handleRegistryError(
        error,
        "Docker Hub",
        "fetch image"
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Search for images in Docker Hub registry
   * Note: Docker Hub search API has limitations and requires authentication for higher limits
   */
  async searchPackages(
    options: PackageSearchOptions
  ): Promise<PackageSearchResults> {
    try {
      const searchUrl = new URL(
        "/v2/search/repositories/",
        this.config.baseUrl
      );
      searchUrl.searchParams.set("query", options.query);
      searchUrl.searchParams.set("page_size", String(options.limit ?? 20));
      searchUrl.searchParams.set(
        "page",
        String(Math.floor((options.offset ?? 0) / (options.limit ?? 20)) + 1)
      );

      const response = await fetch(searchUrl.toString());

      if (!response.ok) {
        return {
          success: false,
          error: `Docker Hub search error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        results: {
          name: string;
          description?: string;
          star_count: number;
          [key: string]: unknown;
        }[];
      };

      const results = data.results.map(item => {
        const result: {
          name: string;
          description?: string;
          score?: number;
          metadata?: Record<string, unknown>;
        } = {
          name: item.name,
          score: item.star_count, // Use star count as relevance score
          metadata: {
            stars: item.star_count,
          },
        };

        // Add optional description only if it exists
        if (item.description) {
          result.description = item.description;
        }

        return result;
      });

      return {
        success: true,
        results,
      };
    } catch (error) {
      const errorMessage = handleRegistryError(
        error,
        "Docker Hub",
        "search images"
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Validate that an image name is valid for Docker Hub
   */
  validatePackageName(imageName: string): boolean {
    return validateDockerImageName(imageName);
  }
}
