// pattern: Functional Core

import { describe, expect, it } from "vitest";

import {
  parsePypiPackageResponse,
  type PypiPackageResponse,
  validatePypiPackageName,
} from "./pypi-adapter.js";

describe("validatePypiPackageName", () => {
  it("should accept valid Python package names", () => {
    expect(validatePypiPackageName("requests")).toBe(true);
    expect(validatePypiPackageName("django-rest-framework")).toBe(true);
    expect(validatePypiPackageName("Flask")).toBe(true);
    expect(validatePypiPackageName("numpy")).toBe(true);
    expect(validatePypiPackageName("tensorflow-gpu")).toBe(true);
    expect(validatePypiPackageName("scikit-learn")).toBe(true);
    expect(validatePypiPackageName("django_extensions")).toBe(true);
    expect(validatePypiPackageName("Pillow")).toBe(true);
    expect(validatePypiPackageName("requests-oauthlib")).toBe(true);
    expect(validatePypiPackageName("python-dateutil")).toBe(true);
    expect(validatePypiPackageName("pytz")).toBe(true);
    expect(validatePypiPackageName("six")).toBe(true);
    expect(validatePypiPackageName("setuptools")).toBe(true);
    expect(validatePypiPackageName("pip")).toBe(true);
    expect(validatePypiPackageName("wheel")).toBe(true);
  });

  it("should reject invalid Python package names", () => {
    expect(validatePypiPackageName("")).toBe(false);
    expect(validatePypiPackageName(" ")).toBe(false);
    expect(validatePypiPackageName("package with spaces")).toBe(false);
    expect(validatePypiPackageName("package/with/slashes")).toBe(false);
    expect(validatePypiPackageName("package\\with\\backslashes")).toBe(false);
    expect(validatePypiPackageName("-leading-hyphen")).toBe(false);
    expect(validatePypiPackageName("trailing-hyphen-")).toBe(false);
    expect(validatePypiPackageName("_leading_underscore")).toBe(false);
    expect(validatePypiPackageName("trailing_underscore_")).toBe(false);
    expect(validatePypiPackageName("@scoped/package")).toBe(false); // No scoped packages in PyPI
  });

  it("should handle edge cases", () => {
    expect(validatePypiPackageName("a")).toBe(true); // Single character
    expect(validatePypiPackageName("A")).toBe(true); // Single uppercase
    expect(validatePypiPackageName("1")).toBe(true); // Single number
    expect(validatePypiPackageName("a1")).toBe(true); // Letter + number
    expect(validatePypiPackageName("1a")).toBe(true); // Number + letter
  });
});

describe("parsePypiPackageResponse", () => {
  it("should parse a basic PyPI package response", () => {
    const mockResponse: PypiPackageResponse = {
      info: {
        name: "requests",
        version: "2.31.0",
        summary: "Python HTTP for Humans.",
        description: "A simple, yet elegant HTTP library.",
      },
      releases: {
        "2.31.0": [
          {
            upload_time: "2023-05-22T14:12:00.000Z",
            filename: "requests-2.31.0-py3-none-any.whl",
          },
        ],
        "2.30.0": [
          {
            upload_time: "2023-05-03T10:30:00.000Z",
            filename: "requests-2.30.0-py3-none-any.whl",
          },
        ],
        "2.29.0": [
          {
            upload_time: "2023-05-01T09:15:00.000Z",
            filename: "requests-2.29.0-py3-none-any.whl",
          },
        ],
      },
    };

    const result = parsePypiPackageResponse(mockResponse);

    expect(result.name).toBe("requests");
    expect(result.description).toBe("Python HTTP for Humans.");
    expect(result.latestVersion).toBe("2.31.0");
    expect(result.versions).toHaveLength(3);
    expect(result.metadata?.["registryType"]).toBe("python");
    expect(result.metadata?.["totalVersions"]).toBe(3);

    // Check version ordering (latest first)
    expect(result.versions[0]?.version).toBe("2.31.0");
    expect(result.versions[1]?.version).toBe("2.30.0");
    expect(result.versions[2]?.version).toBe("2.29.0");

    // Check version metadata
    expect(result.versions[0]?.isSemver).toBe(true);
    expect(result.versions[0]?.publishedAt).toBe("2023-05-22T14:12:00.000Z");
    expect(result.versions[0]?.metadata?.["fileCount"]).toBe(1);
  });

  it("should handle empty releases", () => {
    const mockResponse: PypiPackageResponse = {
      info: {
        name: "test-package",
        version: "1.0.0",
        summary: "Test package",
      },
      releases: {
        "1.0.0": [
          {
            upload_time: "2023-01-01T00:00:00.000Z",
            filename: "test-package-1.0.0.tar.gz",
          },
        ],
        "0.9.0": [], // Empty release (yanked)
      },
    };

    const result = parsePypiPackageResponse(mockResponse);

    expect(result.versions).toHaveLength(1);
    expect(result.versions[0]?.version).toBe("1.0.0");
    expect(result.metadata?.["totalVersions"]).toBe(1);
  });

  it("should apply version limit filtering", () => {
    const mockResponse: PypiPackageResponse = {
      info: {
        name: "test-package",
        version: "3.0.0",
        summary: "Test package",
      },
      releases: {
        "3.0.0": [{ upload_time: "2023-03-01T00:00:00.000Z" }],
        "2.0.0": [{ upload_time: "2023-02-01T00:00:00.000Z" }],
        "1.0.0": [{ upload_time: "2023-01-01T00:00:00.000Z" }],
        "0.9.0": [{ upload_time: "2022-12-01T00:00:00.000Z" }],
        "0.8.0": [{ upload_time: "2022-11-01T00:00:00.000Z" }],
      },
    };

    const result = parsePypiPackageResponse(mockResponse, { versionLimit: 3 });

    expect(result.versions).toHaveLength(3);
    expect(result.versions[0]?.version).toBe("3.0.0");
    expect(result.versions[1]?.version).toBe("2.0.0");
    expect(result.versions[2]?.version).toBe("1.0.0");
    expect(result.metadata?.["filteredVersions"]).toBe(3);
    expect(result.metadata?.["totalVersions"]).toBe(5);
  });

  it("should filter prerelease versions by default", () => {
    const mockResponse: PypiPackageResponse = {
      info: {
        name: "test-package",
        version: "2.0.0",
        summary: "Test package",
      },
      releases: {
        "2.0.0": [{ upload_time: "2023-02-01T00:00:00.000Z" }],
        "2.0.0-rc1": [{ upload_time: "2023-01-25T00:00:00.000Z" }],
        "2.0.0-beta1": [{ upload_time: "2023-01-20T00:00:00.000Z" }],
        "2.0.0-alpha1": [{ upload_time: "2023-01-15T00:00:00.000Z" }],
        "1.0.0": [{ upload_time: "2023-01-01T00:00:00.000Z" }],
      },
    };

    const result = parsePypiPackageResponse(mockResponse);

    // Should only include stable versions
    expect(result.versions).toHaveLength(2);
    expect(result.versions[0]?.version).toBe("2.0.0");
    expect(result.versions[1]?.version).toBe("1.0.0");
  });

  it("should include prerelease versions when requested", () => {
    const mockResponse: PypiPackageResponse = {
      info: {
        name: "test-package",
        version: "2.0.0",
        summary: "Test package",
      },
      releases: {
        "2.0.0": [{ upload_time: "2023-02-01T00:00:00.000Z" }],
        "2.0.0-rc1": [{ upload_time: "2023-01-25T00:00:00.000Z" }],
        "1.0.0": [{ upload_time: "2023-01-01T00:00:00.000Z" }],
      },
    };

    const result = parsePypiPackageResponse(mockResponse, {
      includePrerelease: true,
    });

    expect(result.versions).toHaveLength(3);
    expect(result.versions[0]?.version).toBe("2.0.0");
    expect(result.versions[1]?.version).toBe("2.0.0-rc1");
    expect(result.versions[2]?.version).toBe("1.0.0");
  });

  it("should handle non-semver versions", () => {
    const mockResponse: PypiPackageResponse = {
      info: {
        name: "legacy-package",
        version: "latest",
        summary: "Legacy package with non-semver versions",
      },
      releases: {
        latest: [{ upload_time: "2023-03-01T00:00:00.000Z" }],
        stable: [{ upload_time: "2023-02-01T00:00:00.000Z" }],
        "2023.01.15": [{ upload_time: "2023-01-15T00:00:00.000Z" }],
        "1.0.0": [{ upload_time: "2023-01-01T00:00:00.000Z" }],
      },
    };

    const result = parsePypiPackageResponse(mockResponse);

    expect(result.versions).toHaveLength(4);

    // Check isSemver flag
    const latestVersion = result.versions.find(v => v.version === "latest");
    const stableVersion = result.versions.find(v => v.version === "stable");
    const dateVersion = result.versions.find(v => v.version === "2023.01.15");
    const semverVersion = result.versions.find(v => v.version === "1.0.0");

    expect(latestVersion?.isSemver).toBe(false);
    expect(stableVersion?.isSemver).toBe(false);
    expect(dateVersion?.isSemver).toBe(false);
    expect(semverVersion?.isSemver).toBe(true);
  });

  it("should handle missing optional fields", () => {
    const mockResponse: PypiPackageResponse = {
      info: {
        name: "minimal-package",
        version: "1.0.0",
      },
      releases: {
        "1.0.0": [{ upload_time: "2023-01-01T00:00:00.000Z" }],
      },
    };

    const result = parsePypiPackageResponse(mockResponse);

    expect(result.name).toBe("minimal-package");
    expect(result.description).toBeUndefined();
    expect(result.latestVersion).toBe("1.0.0");
    expect(result.versions).toHaveLength(1);
  });

  it("should handle missing upload_time gracefully", () => {
    const mockResponse: PypiPackageResponse = {
      info: {
        name: "test-package",
        version: "1.0.0",
      },
      releases: {
        "1.0.0": [
          {
            filename: "test-package-1.0.0.tar.gz",
            // upload_time is missing
          } as unknown as { upload_time: string },
        ],
      },
    };

    const result = parsePypiPackageResponse(mockResponse);

    expect(result.versions).toHaveLength(1);
    expect(result.versions[0]?.version).toBe("1.0.0");
    // Should get current timestamp as fallback
    expect(result.versions[0]?.publishedAt).toBeDefined();
  });
});
