// pattern: Functional Core

import { rcompare as semverRcompare, valid as isValidSemver } from "semver";

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
 * NPM registry API response types
 */
interface NpmPackageResponse {
  name: string;
  description?: string;
  "dist-tags": {
    latest?: string;
    [tag: string]: string | undefined;
  };
  versions: Record<
    string,
    {
      version: string;
      description?: string;
      time?: string;
      [key: string]: unknown;
    }
  >;
  time: Record<string, string>;
}

interface NpmSearchResponse {
  objects: {
    package: {
      name: string;
      version: string;
      description?: string;
      [key: string]: unknown;
    };
    score: {
      final: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }[];
  total: number;
  time: string;
}

/**
 * NPM registry adapter for fetching Node.js package information
 */
export class NpmRegistryAdapter implements RegistryAdapter {
  readonly config: RegistryConfig;

  constructor(baseUrl = "https://registry.npmjs.org") {
    this.config = {
      type: "node",
      displayName: "NPM Registry",
      baseUrl,
    };
  }

  /**
   * Fetch detailed information about a specific NPM package
   */
  async fetchPackage(
    packageName: string,
    options: PackageFetchOptions = {}
  ): Promise<PackageFetchResult> {
    if (!this.validatePackageName(packageName)) {
      return {
        success: false,
        error: `Invalid NPM package name: ${packageName}`,
      };
    }

    try {
      const encodedName = encodeURIComponent(packageName);
      const url = `${this.config.baseUrl}/${encodedName}`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: `Package '${packageName}' not found in NPM registry`,
          };
        }
        return {
          success: false,
          error: `NPM registry error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as NpmPackageResponse;
      const packageInfo = this.parsePackageResponse(data, options);

      return {
        success: true,
        package: packageInfo,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to fetch package from NPM registry: ${errorMessage}`,
      };
    }
  }

  /**
   * Search for packages in the NPM registry
   */
  async searchPackages(
    options: PackageSearchOptions
  ): Promise<PackageSearchResults> {
    try {
      const searchUrl = new URL("/-/v1/search", this.config.baseUrl);
      searchUrl.searchParams.set("text", options.query);
      searchUrl.searchParams.set("size", String(options.limit ?? 20));
      searchUrl.searchParams.set("from", String(options.offset ?? 0));

      const response = await fetch(searchUrl.toString());

      if (!response.ok) {
        return {
          success: false,
          error: `NPM search error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as NpmSearchResponse;

      const results = data.objects.map(item => ({
        name: item.package.name,
        ...(item.package.description && {
          description: item.package.description,
        }),
        version: item.package.version,
        score: item.score.final,
        metadata: {
          npmPackage: item.package,
        },
      }));

      return {
        success: true,
        results,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to search NPM registry: ${errorMessage}`,
      };
    }
  }

  /**
   * Validate NPM package name according to NPM naming rules
   */
  validatePackageName(packageName: string): boolean {
    // NPM package name rules:
    // - can contain lowercase letters, numbers, hyphens, underscores, dots
    // - can be scoped (start with @scope/)
    // - length constraints
    if (packageName.length === 0 || packageName.length > 214) {
      return false;
    }

    // Handle scoped packages
    if (packageName.startsWith("@")) {
      const parts = packageName.split("/");
      if (parts.length !== 2) {
        return false;
      }
      const [scope, name] = parts;
      if (!scope || !name || scope.length < 2) {
        return false;
      }
      return (
        this.validatePackageNamePart(scope.slice(1)) &&
        this.validatePackageNamePart(name)
      );
    }

    return this.validatePackageNamePart(packageName);
  }

  /**
   * Parse NPM package response into our standard format
   */
  private parsePackageResponse(
    data: NpmPackageResponse,
    options: PackageFetchOptions
  ): PackageInfo {
    const versions: PackageVersion[] = Object.entries(data.versions)
      .map(([version, versionData]) => ({
        version,
        publishedAt: data.time[version] ?? new Date().toISOString(),
        isSemver: isValidSemver(version) !== null,
        metadata: {
          description: versionData.description,
        },
      }))
      .filter(version => {
        // Filter prerelease versions if not requested
        if (!options.includePrerelease && version.isSemver) {
          return !version.version.includes("-");
        }
        return true;
      });

    // Sort versions: semver versions first (newest to oldest), then non-semver by publish date
    const semverVersions = versions
      .filter(v => v.isSemver)
      .sort((a, b) => semverRcompare(a.version, b.version));

    const nonSemverVersions = versions
      .filter(v => !v.isSemver)
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );

    const sortedVersions = [...semverVersions, ...nonSemverVersions];

    // Apply version limit if specified
    const finalVersions = options.versionLimit
      ? sortedVersions.slice(0, options.versionLimit)
      : sortedVersions;

    return {
      name: data.name,
      ...(data.description && { description: data.description }),
      versions: finalVersions,
      ...(data["dist-tags"].latest && {
        latestVersion: data["dist-tags"].latest,
      }),
      metadata: {
        distTags: data["dist-tags"],
        npmData: data,
      },
    };
  }

  /**
   * Validate a single part of a package name (without scope prefix)
   */
  private validatePackageNamePart(name: string): boolean {
    // Must not be empty
    if (name.length === 0) {
      return false;
    }

    // Must not start with . or _
    if (name.startsWith(".") || name.startsWith("_")) {
      return false;
    }

    // Must contain only lowercase letters, numbers, hyphens, underscores, dots
    const validPattern = /^[a-z0-9._-]+$/;
    if (!validPattern.test(name)) {
      return false;
    }

    // Must not be a reserved name
    const reserved = ["node_modules", "favicon.ico"];
    if (reserved.includes(name)) {
      return false;
    }

    return true;
  }
}
