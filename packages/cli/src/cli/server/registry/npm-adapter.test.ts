// pattern: Test
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NpmRegistryAdapter } from "./npm-adapter.js";

// Mock fetch for testing
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("NpmRegistryAdapter", () => {
  let adapter: NpmRegistryAdapter;

  beforeEach(() => {
    adapter = new NpmRegistryAdapter();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("validatePackageName", () => {
    it("should validate simple package names", () => {
      expect(adapter.validatePackageName("lodash")).toBe(true);
      expect(adapter.validatePackageName("my-package")).toBe(true);
      expect(adapter.validatePackageName("package_name")).toBe(true);
    });

    it("should validate scoped package names", () => {
      expect(adapter.validatePackageName("@types/node")).toBe(true);
      expect(adapter.validatePackageName("@my-org/my-package")).toBe(true);
    });

    it("should reject invalid package names", () => {
      expect(adapter.validatePackageName("")).toBe(false);
      expect(adapter.validatePackageName("A")).toBe(false); // uppercase
      expect(adapter.validatePackageName(".private")).toBe(false); // starts with dot
      expect(adapter.validatePackageName("node_modules")).toBe(false); // reserved
    });
  });

  describe("fetchPackage", () => {
    it("should successfully fetch package information", async () => {
      const mockPackageData = {
        name: "lodash",
        description: "A modern JavaScript utility library",
        "dist-tags": { latest: "4.17.21" },
        versions: {
          "4.17.21": { version: "4.17.21" },
          "4.17.20": { version: "4.17.20" },
        },
        time: {
          "4.17.21": "2021-02-20T15:18:51.081Z",
          "4.17.20": "2020-02-18T21:18:25.490Z",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPackageData),
      });

      const result = await adapter.fetchPackage("lodash");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.package.name).toBe("lodash");
        expect(result.package.versions).toHaveLength(2);
      }
    });

    it("should handle 404 errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const result = await adapter.fetchPackage("nonexistent-package");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });

    it("should reject invalid package names", async () => {
      const result = await adapter.fetchPackage("INVALID_NAME");

      expect(result.success).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("searchPackages", () => {
    it("should successfully search for packages", async () => {
      const mockSearchData = {
        objects: [
          {
            package: {
              name: "lodash",
              version: "4.17.21",
              description: "A utility library",
            },
            score: { final: 0.95 },
          },
        ],
        total: 1,
        time: "2024-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchData),
      });

      const result = await adapter.searchPackages({ query: "lodash" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.results).toHaveLength(1);
        expect(result.results[0]?.name).toBe("lodash");
      }
    });

    it("should handle search errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await adapter.searchPackages({ query: "test" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("search error");
      }
    });
  });
});
