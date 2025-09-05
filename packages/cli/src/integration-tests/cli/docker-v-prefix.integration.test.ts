// Integration tests for Docker tags with 'v' prefix support
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkDockerHubVersions } from "../../installer/outdated/docker-detector.js";
import {
  categorizeDockerTag,
  compareDockerVersions,
  determineUpgradeType,
  isFullyQualifiedSemver,
  isPartialSemver,
  normalizeDockerVersion,
} from "../../utils/docker-semver.js";

describe("Docker 'v' prefix support", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for the test
    tempDir = join(tmpdir(), `mcpadre-docker-v-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("Docker Hub API version detection", () => {
    it("should handle non-v-prefixed tags (eropple/mcpadre-time-mcp-test)", async () => {
      // Test the Docker Hub API directly for non-v-prefixed tags

      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as any;

      const result = await checkDockerHubVersions(
        "eropple/mcpadre-time-mcp-test",
        "2.0.0",
        logger
      );

      expect(result.latestVersion).toBe("2.0.1");
      expect(result.availableVersions).toContain("2.0.0");
      expect(result.availableVersions).toContain("2.0.1");

      // Verify versions are sorted correctly (newest first)
      expect(result.availableVersions[0]).toBe("2.0.1");
    });

    it("should handle v-prefixed tags (eropple/mcpadre-calculator-mcp-test)", async () => {
      // Test the Docker Hub API directly for v-prefixed tags

      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as any;

      const result = await checkDockerHubVersions(
        "eropple/mcpadre-calculator-mcp-test",
        "v1.0.0",
        logger
      );

      expect(result.latestVersion).toBe("v1.0.1");
      expect(result.availableVersions).toContain("v1.0.0");
      expect(result.availableVersions).toContain("v1.0.1");

      // Verify v-prefix is preserved
      expect(result.availableVersions[0]).toMatch(/^v/);
      expect(result.availableVersions[1]).toMatch(/^v/);
    });
  });

  describe("Version comparison and normalization", () => {
    it("should correctly compare versions with mixed 'v' prefix", () => {
      // Test normalization
      expect(normalizeDockerVersion("v1.0.0")).toBe("1.0.0");
      expect(normalizeDockerVersion("1.0.0")).toBe("1.0.0");

      // Test comparison with mixed prefixes
      expect(compareDockerVersions("v2.0.0", "1.0.0")).toBeGreaterThan(0);
      expect(compareDockerVersions("1.0.0", "v2.0.0")).toBeLessThan(0);
      expect(compareDockerVersions("v1.0.0", "1.0.0")).toBe(0);

      // Test sorting
      const versions = ["1.0.0", "v2.0.1", "v2.0.0", "1.0.1"];
      const sorted = versions.sort((a, b) => -compareDockerVersions(a, b));
      expect(sorted[0]).toBe("v2.0.1"); // Highest version first
      expect(sorted[sorted.length - 1]).toBe("1.0.0"); // Lowest version last
    });

    it("should categorize Docker tags correctly", () => {
      // Fully qualified semver
      expect(isFullyQualifiedSemver("1.0.0")).toBe(true);
      expect(isFullyQualifiedSemver("v1.0.0")).toBe(true);
      expect(categorizeDockerTag("1.0.0")).toBe("fully-qualified");
      expect(categorizeDockerTag("v1.0.0")).toBe("fully-qualified");

      // Partial semver
      expect(isPartialSemver("18")).toBe(true);
      expect(isPartialSemver("18.19")).toBe(true);
      expect(isPartialSemver("v18")).toBe(true);
      expect(categorizeDockerTag("18")).toBe("partial");
      expect(categorizeDockerTag("18.19")).toBe("partial");

      // Named tags
      expect(categorizeDockerTag("latest")).toBe("named");
      expect(categorizeDockerTag("main")).toBe("named");
      expect(categorizeDockerTag("develop")).toBe("named");
    });
  });

  describe("Upgrade type detection", () => {
    it("should detect upgrade types with v-prefixed versions", () => {
      // Major upgrades
      expect(determineUpgradeType("v1.0.0", "v2.0.0")).toBe("major");
      expect(determineUpgradeType("1.0.0", "v2.0.0")).toBe("major");

      // Minor upgrades
      expect(determineUpgradeType("v1.0.0", "v1.1.0")).toBe("minor");
      expect(determineUpgradeType("1.0.0", "v1.1.0")).toBe("minor");

      // Patch upgrades
      expect(determineUpgradeType("v1.0.0", "v1.0.1")).toBe("patch");
      expect(determineUpgradeType("1.0.0", "v1.0.1")).toBe("patch");

      // Same version
      expect(determineUpgradeType("v1.0.0", "v1.0.0")).toBeUndefined();
      expect(determineUpgradeType("1.0.0", "1.0.0")).toBeUndefined();

      // Non-semver
      expect(determineUpgradeType("latest", "main")).toBeUndefined();
    });
  });
});
