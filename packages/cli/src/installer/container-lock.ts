// pattern: Functional Core
// Trust-on-first-use container lock management with remote digest checking

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  ContainerError,
  FileSystemError,
  NetworkError,
} from "../utils/errors.js";

import type Docker from "dockerode";

/**
 * Container lock file format for trust-on-first-use security model
 */
export interface ContainerLock {
  /** Image tag that was locked */
  tag: string;
  /** SHA256 digest of the locked image */
  digest: string;
  /** ISO timestamp when the image was first pulled */
  pulledAt: string;
}

/**
 * Result of checking whether a container image should be pulled
 */
export interface PullDecision {
  /** Whether the image should be pulled */
  shouldPull: boolean;
  /** Human-readable reason for the decision */
  reason: string;
  /** Whether this is an error condition (digest changed but pullWhenDigestChanges=false) */
  isError: boolean;
}

/**
 * Options for container pull decisions
 */
export interface ContainerPullOptions {
  /** Current tag being requested */
  tag: string;
  /** Whether to pull when digest changes but tag remains the same */
  pullWhenDigestChanges: boolean;
}

/**
 * Manages container lock files for trust-on-first-use security model.
 *
 * Key behaviors:
 * 1. First pull: Always pull and create lock file
 * 2. Subsequent pulls: Check remote digest BEFORE pulling
 * 3. Tag unchanged, digest unchanged: Skip pull
 * 4. Tag unchanged, digest changed + pullWhenDigestChanges=false: ERROR
 * 5. Tag unchanged, digest changed + pullWhenDigestChanges=true: Pull and update
 * 6. Tag changed: Always pull and update
 */
export class ContainerLockManager {
  constructor(
    private readonly serverDirectory: string,
    _docker: Docker
  ) {}

  // Note: docker parameter kept for API compatibility but HTTP registry calls used instead

  /**
   * Get the path to the container lock file for a server
   */
  private getLockFilePath(): string {
    return path.join(this.serverDirectory, "container.lock");
  }

  /**
   * Read existing container lock file if it exists
   */
  async readLock(): Promise<ContainerLock | null> {
    try {
      const lockPath = this.getLockFilePath();
      const content = await fs.readFile(lockPath, "utf8");
      return JSON.parse(content) as ContainerLock;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null; // No lock file exists
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new FileSystemError(
        `Failed to read container lock file: ${message}`,
        "read",
        this.getLockFilePath()
      );
    }
  }

  /**
   * Write container lock file
   */
  async writeLock(lock: ContainerLock): Promise<void> {
    try {
      const lockPath = this.getLockFilePath();
      // Ensure server directory exists
      await fs.mkdir(this.serverDirectory, { recursive: true });
      const content = JSON.stringify(lock, null, 2);
      await fs.writeFile(lockPath, content, "utf8");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new FileSystemError(
        `Failed to write container lock file: ${message}`,
        "write",
        this.getLockFilePath()
      );
    }
  }

  /**
   * Get remote digest for an image tag by checking registry without pulling.
   * This implements the critical requirement: remote tag checking BEFORE pulls.
   */
  async getRemoteDigest(image: string, tag: string): Promise<string> {
    try {
      // Parse registry info from image name
      const { registry, repository } = this.parseImageRegistry(image);

      // Make HTTP request to Docker registry API for manifest digest
      return await this.fetchManifestDigest(registry, repository, tag);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new NetworkError(
        `Failed to get remote digest for ${image}:${tag}: ${message}`,
        `${image}:${tag}`
      );
    }
  }

  /**
   * Parse image name to extract registry and repository
   */
  private parseImageRegistry(image: string): {
    registry: string;
    repository: string;
  } {
    // Default to Docker Hub if no registry specified
    if (
      !image.includes("/") ||
      (!image.includes(".") && !image.includes(":"))
    ) {
      return {
        registry: "registry-1.docker.io",
        repository: `library/${image}`,
      };
    }

    const parts = image.split("/");
    if (parts[0] && (parts[0].includes(".") || parts[0].includes(":"))) {
      // Has explicit registry
      return {
        registry: parts[0],
        repository: parts.slice(1).join("/"),
      };
    } else {
      // Docker Hub with user/org
      return {
        registry: "registry-1.docker.io",
        repository: image,
      };
    }
  }

  /**
   * Fetch manifest digest from Docker registry API
   */
  private async fetchManifestDigest(
    registry: string,
    repository: string,
    tag: string
  ): Promise<string> {
    // For Docker Hub, get anonymous token first
    if (registry === "registry-1.docker.io") {
      const tokenUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`;

      const tokenResponse = await fetch(tokenUrl, {
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
      if (!tokenResponse.ok) {
        throw new NetworkError(
          `Failed to get Docker Hub token: ${tokenResponse.statusText}`,
          "auth.docker.io"
        );
      }

      const tokenData = (await tokenResponse.json()) as { token: string };

      // Now fetch manifest with token
      const manifestUrl = `https://${registry}/v2/${repository}/manifests/${tag}`;

      const response = await fetch(manifestUrl, {
        method: "HEAD", // HEAD request to get just the digest header
        headers: {
          Accept: "application/vnd.docker.distribution.manifest.v2+json",
          Authorization: `Bearer ${tokenData.token}`,
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new NetworkError(
          `Registry request failed: ${response.status} ${response.statusText}`,
          `${registry}/v2/${repository}/manifests/${tag}`
        );
      }

      const digest = response.headers.get("docker-content-digest");
      if (!digest) {
        throw new ContainerError("No digest header found in manifest response");
      }

      return digest;
    }

    // For other registries, try without authentication first
    const manifestUrl = `https://${registry}/v2/${repository}/manifests/${tag}`;

    const response = await fetch(manifestUrl, {
      method: "HEAD",
      headers: {
        Accept: "application/vnd.docker.distribution.manifest.v2+json",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new NetworkError(
        `Registry request failed for ${registry}: ${response.status} ${response.statusText}`,
        `${registry}/v2/${repository}/manifests/${tag}`
      );
    }

    const digest = response.headers.get("docker-content-digest");
    if (!digest) {
      throw new ContainerError("No digest header found in manifest response");
    }

    return digest;
  }

  /**
   * Determine whether container image should be pulled based on TOFU model.
   * Performs remote digest check BEFORE making pull decision.
   */
  async shouldPullImage(
    image: string,
    options: ContainerPullOptions
  ): Promise<PullDecision> {
    const existingLock = await this.readLock();

    // Case 1: No existing lock - first time pull
    if (!existingLock) {
      return {
        shouldPull: true,
        reason: "First time pulling image, creating trust anchor",
        isError: false,
      };
    }

    // Case 2: Tag has changed - always pull and update
    if (existingLock.tag !== options.tag) {
      return {
        shouldPull: true,
        reason: `Tag changed from ${existingLock.tag} to ${options.tag}`,
        isError: false,
      };
    }

    // Case 3: Tag unchanged - check remote digest BEFORE deciding
    let remoteDigest: string;
    try {
      remoteDigest = await this.getRemoteDigest(image, options.tag);
    } catch (error: unknown) {
      // If we can't check remote, be conservative and skip pull
      const message = error instanceof Error ? error.message : String(error);
      return {
        shouldPull: false,
        reason: `Cannot check remote digest: ${message}`,
        isError: false,
      };
    }

    // Case 4: Tag unchanged, digest unchanged - skip pull
    if (existingLock.digest === remoteDigest) {
      return {
        shouldPull: false,
        reason: "Image digest matches lock file, no pull needed",
        isError: false,
      };
    }

    // Case 5: Tag unchanged, digest changed - check pullWhenDigestChanges flag
    if (!options.pullWhenDigestChanges) {
      return {
        shouldPull: false,
        reason: `Digest changed (${existingLock.digest} → ${remoteDigest}) but pullWhenDigestChanges=false`,
        isError: true,
      };
    }

    // Case 6: Tag unchanged, digest changed, pullWhenDigestChanges=true - pull and update
    return {
      shouldPull: true,
      reason: `Digest changed (${existingLock.digest} → ${remoteDigest}), updating with pullWhenDigestChanges=true`,
      isError: false,
    };
  }

  /**
   * Update lock file after successful pull
   */
  async updateLockAfterPull(
    _image: string,
    tag: string,
    digest: string
  ): Promise<void> {
    const lock: ContainerLock = {
      tag,
      digest,
      pulledAt: new Date().toISOString(),
    };

    await this.writeLock(lock);
  }
}
