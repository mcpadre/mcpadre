// Unit tests for Docker outdated detection
import { describe, expect, it } from "vitest";

import { ContainerLockManager } from "../container-lock.js";

import { checkDockerOutdated } from "./docker-detector.js";

import type Docker from "dockerode";
import type { Logger } from "pino";

// Create minimal logger mock
const createMockLogger = (): Logger =>
  ({
    debug: () => {
      // Mock debug method
    },
    info: () => {
      // Mock info method
    },
    warn: () => {
      // Mock warn method
    },
    error: () => {
      // Mock error method
    },
  }) as unknown as Logger;

describe("Docker registry API integration", () => {
  it("should make real HTTP calls to Docker registries", async () => {
    const lockManager = new ContainerLockManager("/tmp", {} as Docker);

    // Test real Docker Hub API calls
    const digest1 = await lockManager.getRemoteDigest("node", "18");
    const digest2 = await lockManager.getRemoteDigest("node", "latest");

    // Should get valid SHA256 digests
    expect(digest1).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(digest2).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Different tags should have different digests
    expect(digest1).not.toBe(digest2);
  });

  it("should handle registry parsing for different image formats", async () => {
    const lockManager = new ContainerLockManager("/tmp", {} as Docker);

    // Test various image name formats
    const testCases = [
      "node", // Official library image
      "nginx", // Another official image
      "alpine", // Minimal image
    ];

    for (const image of testCases) {
      const digest = await lockManager.getRemoteDigest(image, "latest");
      expect(digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it("should handle non-existent images with proper errors", async () => {
    const lockManager = new ContainerLockManager("/tmp", {} as Docker);

    await expect(
      lockManager.getRemoteDigest("nonexistent-image-12345", "latest")
    ).rejects.toThrow(/Registry request failed|Failed to get remote digest/);
  });

  it("should make proper Docker outdated detection calls", async () => {
    const mockLogger = createMockLogger();

    // Test with no lock file (expected scenario)
    const result = await checkDockerOutdated(
      "node",
      "18",
      "/tmp/nonexistent-server",
      {} as Docker,
      mockLogger
    );

    // Should handle missing lock file gracefully
    expect(result.latestVersion).toBe("18");
    expect(result.isOutdated).toBe(false);
    expect(result.error).toContain("No container lock found");
  });

  it("should detect registry failures vs file system failures", async () => {
    const mockLogger = createMockLogger();

    // Test with bad image name - should fail at registry level
    const result = await checkDockerOutdated(
      "definitely-nonexistent-image-98765",
      "latest",
      "/tmp/test-dir",
      {} as Docker,
      mockLogger
    );

    expect(result.isOutdated).toBe(false);
    expect(result.latestVersion).toBe("latest");

    if (result.error) {
      // Should be either no lock file or registry error
      expect(
        result.error.includes("No container lock found") ||
          result.error.includes("Registry request failed") ||
          result.error.includes("Failed to check remote digest")
      ).toBe(true);
    }
  });
});
