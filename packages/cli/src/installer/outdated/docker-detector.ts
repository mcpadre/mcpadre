// pattern: Functional Core
// Docker container outdated detection logic

import { ContainerLockManager } from "../container-lock.js";

import type Docker from "dockerode";
import type { Logger } from "pino";

/**
 * Check if a Docker container has updates available (digest changes)
 */
export async function checkDockerOutdated(
  image: string,
  tag: string,
  serverDir: string,
  docker: Docker,
  logger: Logger
): Promise<{
  latestVersion: string | null;
  isOutdated: boolean;
  digestInfo?: {
    currentDigest: string;
    latestDigest: string;
    digestChanged: boolean;
  };
  error?: string;
}> {
  try {
    logger.debug(`Checking Docker registry for ${image}:${tag}`);

    const lockManager = new ContainerLockManager(serverDir, docker);

    // Read existing lock file
    const existingLock = await lockManager.readLock();
    if (!existingLock) {
      return {
        latestVersion: tag,
        isOutdated: false,
        error: `No container lock found for ${image}:${tag} (not installed yet)`,
      };
    }

    // Check remote digest
    let remoteDigest: string;
    try {
      remoteDigest = await lockManager.getRemoteDigest(image, tag);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        latestVersion: tag,
        isOutdated: false,
        error: `Failed to check remote digest: ${message}`,
      };
    }

    const digestChanged = existingLock.digest !== remoteDigest;

    return {
      latestVersion: tag,
      isOutdated: digestChanged,
      digestInfo: {
        currentDigest: existingLock.digest,
        latestDigest: remoteDigest,
        digestChanged,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug(
      `Failed to check Docker outdated for ${image}:${tag}: ${message}`
    );
    return {
      latestVersion: null,
      isOutdated: false,
      error: `Failed to check Docker registry: ${message}`,
    };
  }
}

/**
 * Check Docker Hub API for newer versions (tags) of an image
 * This is a best-effort attempt for versioned tags
 */
export async function checkDockerHubVersions(
  image: string,
  currentTag: string,
  logger: Logger
): Promise<{
  latestVersion: string | null;
  availableVersions: string[];
  error?: string;
}> {
  try {
    // Only check Docker Hub for now (most common registry)
    if (!image.includes("/")) {
      image = `library/${image}`;
    }

    const [namespace, repository] = image.split("/");
    if (!namespace || !repository) {
      return {
        latestVersion: currentTag,
        availableVersions: [currentTag],
        error: "Invalid image format for version checking",
      };
    }

    logger.debug(`Checking Docker Hub API for ${namespace}/${repository}`);

    const response = await fetch(
      `https://registry.hub.docker.com/v2/repositories/${namespace}/${repository}/tags?page_size=100`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      results?: { name: string }[];
    };
    const tags = data.results?.map(tag => tag.name) ?? [];

    // Filter for fully qualified semver tags (exclude major-only, latest, main, etc.)
    const versionTags = tags
      .filter((tag: string) => {
        // Match fully qualified semver: X.Y.Z or vX.Y.Z with optional suffixes
        // Exclude major-only (e.g., "18", "20") and major.minor (e.g., "18.19")
        return /^v?\d+\.\d+\.\d+/.test(tag);
      })
      .sort((a: string, b: string) => {
        // Proper semver sort (newest first)
        const parseVersion = (version: string): (string | number)[] => {
          // Strip optional 'v' prefix before parsing
          const cleanVersion = version.replace(/^v/, "");
          const parts = cleanVersion
            .split(/[.-]/)
            .map(part => (isNaN(Number(part)) ? part : Number(part)));
          return parts;
        };

        const aParts = parseVersion(a);
        const bParts = parseVersion(b);

        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aPart = aParts[i] ?? 0;
          const bPart = bParts[i] ?? 0;

          // Handle numeric comparison
          if (typeof aPart === "number" && typeof bPart === "number") {
            if (bPart !== aPart) {
              return bPart - aPart;
            }
          }
          // Handle string comparison (for suffixes like alpha, beta)
          else if (typeof aPart === "string" && typeof bPart === "string") {
            if (aPart !== bPart) {
              return bPart.localeCompare(aPart);
            }
          }
          // Mixed types - numbers come first
          else if (typeof aPart === "number") {
            return -1;
          } else if (typeof bPart === "number") {
            return 1;
          }
        }
        return 0;
      });

    const latestVersion = versionTags[0] ?? currentTag;

    return {
      latestVersion,
      availableVersions: versionTags.slice(0, 10), // Top 10 versions
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug(`Failed to check Docker Hub versions: ${message}`);
    return {
      latestVersion: currentTag,
      availableVersions: [currentTag],
      error: `Failed to check Docker Hub API: ${message}`,
    };
  }
}
