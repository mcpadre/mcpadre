// pattern: Unit Test
// Unit tests for PyPI outdated detection

import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkPypiOutdated } from "./pypi-detector.js";
import { testLogger } from "./test-setup.js";

// Mock fetch globally
global.fetch = vi.fn();

describe("PyPI outdated detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkPypiOutdated", () => {
    it("should detect outdated package with major version bump", async () => {
      const mockResponse = {
        info: {
          name: "requests",
          version: "3.0.0",
        },
        releases: {
          "2.0.0": [{ upload_time: "2023-01-01T00:00:00.000Z" }],
          "3.0.0": [{ upload_time: "2024-01-01T00:00:00.000Z" }],
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await checkPypiOutdated("requests", "2.0.0", testLogger);

      expect(result.latestVersion).toBe("3.0.0");
      expect(result.isOutdated).toBe(true);
      // Don't test for specific upgrade type, just that it's detected as outdated

      expect(fetch).toHaveBeenCalledWith("https://pypi.org/pypi/requests/json");
    });

    it("should detect outdated package with minor version bump", async () => {
      const mockResponse = {
        info: {
          name: "flask",
          version: "1.5.0",
        },
        releases: {
          "1.0.0": [{ upload_time: "2023-01-01T00:00:00.000Z" }],
          "1.5.0": [{ upload_time: "2024-01-01T00:00:00.000Z" }],
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await checkPypiOutdated("flask", "1.0.0", testLogger);

      expect(result.latestVersion).toBe("1.5.0");
      expect(result.isOutdated).toBe(true);
      // Don't test for specific upgrade type, just that it's detected as outdated
    });

    it("should detect outdated package with patch version bump", async () => {
      const mockResponse = {
        info: {
          name: "numpy",
          version: "1.0.5",
        },
        releases: {
          "1.0.0": [{ upload_time: "2023-01-01T00:00:00.000Z" }],
          "1.0.5": [{ upload_time: "2024-01-01T00:00:00.000Z" }],
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await checkPypiOutdated("numpy", "1.0.0", testLogger);

      expect(result.latestVersion).toBe("1.0.5");
      expect(result.isOutdated).toBe(true);
      // Don't test for specific upgrade type, just that it's detected as outdated
    });

    it("should return not outdated when current version is latest", async () => {
      const mockResponse = {
        info: {
          name: "django",
          version: "4.2.0",
        },
        releases: {
          "4.2.0": [{ upload_time: "2023-01-01T00:00:00.000Z" }],
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await checkPypiOutdated("django", "4.2.0", testLogger);

      expect(result).toEqual({
        latestVersion: "4.2.0",
        isOutdated: false,
      });
    });

    it("should handle package not found (404)", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

      const result = await checkPypiOutdated(
        "nonexistent-package",
        "1.0.0",
        testLogger
      );

      expect(result).toEqual({
        latestVersion: null,
        isOutdated: false,
        error: "Package nonexistent-package not found in PyPI registry",
      });
    });

    it("should handle network errors", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network timeout"));

      const result = await checkPypiOutdated(
        "some-package",
        "1.0.0",
        testLogger
      );

      expect(result).toEqual({
        latestVersion: null,
        isOutdated: false,
        error: "Failed to check PyPI registry: Network timeout",
      });
    });

    it("should handle complex version formats", async () => {
      const mockResponse = {
        info: {
          name: "tensorflow",
          version: "2.13.0rc1",
        },
        releases: {
          "2.12.0": [{ upload_time: "2023-01-01T00:00:00.000Z" }],
          "2.13.0rc1": [{ upload_time: "2024-01-01T00:00:00.000Z" }],
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await checkPypiOutdated(
        "tensorflow",
        "2.12.0",
        testLogger
      );

      expect(result.latestVersion).toBe("2.13.0rc1");
      expect(result.isOutdated).toBe(true);
      // Don't test for specific upgrade type, just that it's detected as outdated
    });

    it("should handle missing version info", async () => {
      const mockResponse = {
        info: {
          name: "broken-package",
        },
        releases: {},
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await checkPypiOutdated(
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

    it("should handle version strings with 'v' prefix", async () => {
      const mockResponse = {
        info: {
          name: "test-package",
          version: "v2.0.0",
        },
        releases: {
          "v1.5.0": [{ upload_time: "2023-01-01T00:00:00.000Z" }],
          "v2.0.0": [{ upload_time: "2024-01-01T00:00:00.000Z" }],
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await checkPypiOutdated(
        "test-package",
        "v1.5.0",
        testLogger
      );

      expect(result.latestVersion).toBe("v2.0.0");
      expect(result.isOutdated).toBe(true);
      // Don't test for specific upgrade type, just that it's detected as outdated
    });
  });

  // TODO: Add audit tests after implementing command mocking patterns
  // These tests require complex mocking of the createCommand utility
});
