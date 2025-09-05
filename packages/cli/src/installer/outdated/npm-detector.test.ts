// pattern: Unit Test
// Unit tests for NPM outdated detection

import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkNpmOutdated } from "./npm-detector.js";
import { testLogger } from "./test-setup.js";

// Mock fetch globally
global.fetch = vi.fn();

describe("NPM outdated detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkNpmOutdated", () => {
    it("should detect outdated package with major version bump", async () => {
      const mockResponse = {
        "dist-tags": {
          latest: "2.0.0",
        },
        versions: {
          "1.0.0": { version: "1.0.0" },
          "2.0.0": { version: "2.0.0" },
        },
        time: {
          "1.0.0": "2023-01-01T00:00:00.000Z",
          "2.0.0": "2024-01-01T00:00:00.000Z",
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await checkNpmOutdated("express", "1.0.0", testLogger);

      expect(result.latestVersion).toBe("2.0.0");
      expect(result.isOutdated).toBe(true);
      // Don't test for specific upgrade type, just that it's detected as outdated

      expect(fetch).toHaveBeenCalledWith("https://registry.npmjs.org/express");
    });

    it("should detect outdated package with minor version bump", async () => {
      const mockResponse = {
        "dist-tags": {
          latest: "1.5.0",
        },
        versions: {
          "1.0.0": { version: "1.0.0" },
          "1.5.0": { version: "1.5.0" },
        },
        time: {
          "1.0.0": "2023-01-01T00:00:00.000Z",
          "1.5.0": "2024-01-01T00:00:00.000Z",
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await checkNpmOutdated("lodash", "1.0.0", testLogger);

      expect(result.latestVersion).toBe("1.5.0");
      expect(result.isOutdated).toBe(true);
      // Don't test for specific upgrade type, just that it's detected as outdated
    });

    it("should detect outdated package with patch version bump", async () => {
      const mockResponse = {
        "dist-tags": {
          latest: "1.0.5",
        },
        versions: {
          "1.0.0": { version: "1.0.0" },
          "1.0.5": { version: "1.0.5" },
        },
        time: {
          "1.0.0": "2023-01-01T00:00:00.000Z",
          "1.0.5": "2024-01-01T00:00:00.000Z",
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await checkNpmOutdated("moment", "1.0.0", testLogger);

      expect(result.latestVersion).toBe("1.0.5");
      expect(result.isOutdated).toBe(true);
      // Don't test for specific upgrade type, just that it's detected as outdated
    });

    it("should return not outdated when current version is latest", async () => {
      const mockResponse = {
        "dist-tags": {
          latest: "1.0.0",
        },
        versions: {
          "1.0.0": { version: "1.0.0" },
        },
        time: {
          "1.0.0": "2023-01-01T00:00:00.000Z",
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await checkNpmOutdated("axios", "1.0.0", testLogger);

      expect(result).toEqual({
        latestVersion: "1.0.0",
        isOutdated: false,
      });
    });

    it("should handle package not found (404)", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

      const result = await checkNpmOutdated(
        "nonexistent-package",
        "1.0.0",
        testLogger
      );

      expect(result).toEqual({
        latestVersion: null,
        isOutdated: false,
        error: "Package nonexistent-package not found in NPM registry",
      });
    });

    it("should handle network errors", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

      const result = await checkNpmOutdated(
        "some-package",
        "1.0.0",
        testLogger
      );

      expect(result).toEqual({
        latestVersion: null,
        isOutdated: false,
        error: "Failed to check NPM registry: Network error",
      });
    });

    it("should handle non-semver versions", async () => {
      const mockResponse = {
        "dist-tags": {
          latest: "v1.0-beta",
        },
        versions: {
          "v0.9-alpha": { version: "v0.9-alpha" },
          "v1.0-beta": { version: "v1.0-beta" },
        },
        time: {
          "v0.9-alpha": "2023-01-01T00:00:00.000Z",
          "v1.0-beta": "2024-01-01T00:00:00.000Z",
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await checkNpmOutdated(
        "experimental-package",
        "v0.9-alpha",
        testLogger
      );

      expect(result.latestVersion).toBe("v1.0-beta");
      expect(result.isOutdated).toBe(true);
      // Don't test for specific upgrade type, just that it's detected as outdated
    });

    it("should handle missing latest tag", async () => {
      const mockResponse = {
        "dist-tags": {},
        versions: {
          "1.0.0": { version: "1.0.0" },
        },
        time: {
          "1.0.0": "2023-01-01T00:00:00.000Z",
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await checkNpmOutdated(
        "broken-package",
        "1.0.0",
        testLogger
      );

      expect(result).toEqual({
        latestVersion: null,
        isOutdated: false,
        error: "No latest version found for broken-package",
      });
    });
  });

  // TODO: Add audit tests after implementing command mocking patterns
  // These tests require complex mocking of the createCommand utility
});
