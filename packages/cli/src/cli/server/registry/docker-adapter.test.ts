// pattern: Functional Core

import { describe, expect, it } from "vitest";

import {
  type DockerHubTagsResponse,
  parseDockerHubTagsResponse,
  parseDockerImageName,
  validateDockerImageName,
} from "./docker-adapter.js";

describe("parseDockerImageName", () => {
  it("should handle official images without namespace", () => {
    const result = parseDockerImageName("nginx");

    expect(result.namespace).toBe("library");
    expect(result.repository).toBe("nginx");
    expect(result.fullName).toBe("library/nginx");
  });

  it("should handle user images with namespace", () => {
    const result = parseDockerImageName("myuser/myapp");

    expect(result.namespace).toBe("myuser");
    expect(result.repository).toBe("myapp");
    expect(result.fullName).toBe("myuser/myapp");
  });

  it("should handle registry prefix by taking last two parts", () => {
    const result = parseDockerImageName("registry.io/namespace/repo");

    expect(result.namespace).toBe("namespace");
    expect(result.repository).toBe("repo");
    expect(result.fullName).toBe("namespace/repo");
  });

  it("should handle complex registry URLs", () => {
    const result = parseDockerImageName("my-registry.com/org/project");

    expect(result.namespace).toBe("org");
    expect(result.repository).toBe("project");
    expect(result.fullName).toBe("org/project");
  });
});

describe("validateDockerImageName", () => {
  it("should accept valid Docker image names", () => {
    expect(validateDockerImageName("nginx")).toBe(true);
    expect(validateDockerImageName("myuser/myapp")).toBe(true);
    expect(validateDockerImageName("organization/project-name")).toBe(true);
    expect(validateDockerImageName("user123/app_name")).toBe(true);
    expect(validateDockerImageName("test.registry/myapp")).toBe(true);
    expect(validateDockerImageName("ubuntu")).toBe(true);
    expect(validateDockerImageName("node")).toBe(true);
    expect(validateDockerImageName("postgres")).toBe(true);
  });

  it("should reject invalid Docker image names", () => {
    expect(validateDockerImageName("")).toBe(false);
    expect(validateDockerImageName(" ")).toBe(false);
    expect(validateDockerImageName("invalid name with spaces")).toBe(false);
    expect(validateDockerImageName("-leading-hyphen")).toBe(false);
    expect(validateDockerImageName("trailing-hyphen-")).toBe(false);
    expect(validateDockerImageName("_leading_underscore")).toBe(false);
    expect(validateDockerImageName("trailing_underscore_")).toBe(false);
    expect(validateDockerImageName(".leading.dot")).toBe(false);
    expect(validateDockerImageName("trailing.dot.")).toBe(false);
    expect(validateDockerImageName("user/-invalid")).toBe(false);
    expect(validateDockerImageName("user/invalid-")).toBe(false);
    expect(validateDockerImageName("registry.io/namespace/repo/extra")).toBe(
      false
    ); // Too many parts
  });

  it("should handle edge cases", () => {
    expect(validateDockerImageName("a")).toBe(true); // Single character
    expect(validateDockerImageName("A")).toBe(true); // Single uppercase
    expect(validateDockerImageName("1")).toBe(true); // Single number
    expect(validateDockerImageName("a/b")).toBe(true); // Minimal valid namespaced image
    expect(validateDockerImageName("user/")).toBe(false); // Empty repository
    expect(validateDockerImageName("/repo")).toBe(false); // Empty namespace
  });
});

describe("parseDockerHubTagsResponse", () => {
  it("should parse a basic Docker Hub tags response", () => {
    const mockTagsResponse: DockerHubTagsResponse = {
      count: 3,
      results: [
        {
          name: "latest",
          tag_last_pushed: "2023-05-22T14:12:00.000Z",
          tag_status: "active",
          digest: "sha256:abc123",
        },
        {
          name: "1.20.1",
          tag_last_pushed: "2023-05-22T14:11:00.000Z",
          tag_status: "active",
          digest: "sha256:def456",
        },
        {
          name: "1.20.0",
          tag_last_pushed: "2023-05-01T10:00:00.000Z",
          tag_status: "active",
          digest: "sha256:ghi789",
        },
      ],
    };

    const mockRepoResponse = {
      name: "nginx",
      description: "Official build of Nginx.",
      star_count: 12000,
      pull_count: 1000000000,
    };

    const result = parseDockerHubTagsResponse(
      "nginx",
      mockTagsResponse,
      mockRepoResponse
    );

    expect(result.name).toBe("nginx");
    expect(result.description).toBe("Official build of Nginx.");
    expect(result.latestVersion).toBe("latest");
    expect(result.versions).toHaveLength(3);
    expect(result.metadata?.["registryType"]).toBe("container");
    expect(result.metadata?.["totalVersions"]).toBe(3);
    expect(result.metadata?.["starCount"]).toBe(12000);
    expect(result.metadata?.["pullCount"]).toBe(1000000000);
    expect(result.metadata?.["totalTags"]).toBe(3);

    // Check version ordering (semver prioritized, then by date)
    expect(result.versions[0]?.version).toBe("1.20.1"); // Semver comes first
    expect(result.versions[1]?.version).toBe("1.20.0"); // Semver second
    expect(result.versions[2]?.version).toBe("latest"); // Non-semver last

    // Check version metadata
    expect(result.versions[0]?.publishedAt).toBe("2023-05-22T14:11:00.000Z");
    expect(result.versions[0]?.metadata?.["digest"]).toBe("sha256:def456");
    expect(result.versions[0]?.metadata?.["status"]).toBe("active");
    expect(result.versions[0]?.isSemver).toBe(true); // "1.20.1" is semver
    expect(result.versions[2]?.isSemver).toBe(false); // "latest" is not semver
  });

  it("should filter out inactive tags", () => {
    const mockTagsResponse: DockerHubTagsResponse = {
      count: 3,
      results: [
        {
          name: "latest",
          tag_last_pushed: "2023-05-22T14:12:00.000Z",
          tag_status: "active",
          digest: "sha256:abc123",
        },
        {
          name: "old-tag",
          tag_last_pushed: "2023-01-01T00:00:00.000Z",
          tag_status: "inactive",
          digest: "sha256:old123",
        },
        {
          name: "1.0.0",
          tag_last_pushed: "2023-05-01T10:00:00.000Z",
          tag_status: "active",
          digest: "sha256:def456",
        },
      ],
    };

    const result = parseDockerHubTagsResponse("myapp", mockTagsResponse);

    // Should only include active tags
    expect(result.versions).toHaveLength(2);
    expect(result.versions[0]?.version).toBe("1.0.0"); // Semver first
    expect(result.versions[1]?.version).toBe("latest"); // Non-semver second
    expect(result.metadata?.["totalVersions"]).toBe(2);
  });

  it("should handle version limit filtering", () => {
    const mockTagsResponse: DockerHubTagsResponse = {
      count: 5,
      results: [
        {
          name: "3.0.0",
          tag_last_pushed: "2023-05-01T00:00:00.000Z",
          tag_status: "active",
          digest: "sha256:abc1",
        },
        {
          name: "2.0.0",
          tag_last_pushed: "2023-04-01T00:00:00.000Z",
          tag_status: "active",
          digest: "sha256:abc2",
        },
        {
          name: "1.0.0",
          tag_last_pushed: "2023-03-01T00:00:00.000Z",
          tag_status: "active",
          digest: "sha256:abc3",
        },
        {
          name: "0.9.0",
          tag_last_pushed: "2023-02-01T00:00:00.000Z",
          tag_status: "active",
          digest: "sha256:abc4",
        },
        {
          name: "0.8.0",
          tag_last_pushed: "2023-01-01T00:00:00.000Z",
          tag_status: "active",
          digest: "sha256:abc5",
        },
      ],
    };

    const result = parseDockerHubTagsResponse(
      "myapp",
      mockTagsResponse,
      undefined,
      {
        versionLimit: 3,
      }
    );

    expect(result.versions).toHaveLength(3);
    expect(result.versions[0]?.version).toBe("3.0.0");
    expect(result.versions[1]?.version).toBe("2.0.0");
    expect(result.versions[2]?.version).toBe("1.0.0");
    expect(result.metadata?.["filteredVersions"]).toBe(3);
    expect(result.metadata?.["totalVersions"]).toBe(5);
  });

  it("should prefer latest tag as latestVersion when available", () => {
    const mockTagsResponse: DockerHubTagsResponse = {
      count: 3,
      results: [
        {
          name: "2.0.0",
          tag_last_pushed: "2023-05-22T14:12:00.000Z", // Most recent
          tag_status: "active",
          digest: "sha256:newest",
        },
        {
          name: "latest",
          tag_last_pushed: "2023-05-20T14:12:00.000Z", // Less recent
          tag_status: "active",
          digest: "sha256:latest",
        },
        {
          name: "1.0.0",
          tag_last_pushed: "2023-05-01T10:00:00.000Z",
          tag_status: "active",
          digest: "sha256:old",
        },
      ],
    };

    const result = parseDockerHubTagsResponse("myapp", mockTagsResponse);

    // Should prefer "latest" tag over most recent by date
    expect(result.latestVersion).toBe("latest");
    // But versions should still be sorted by semver priority
    expect(result.versions[0]?.version).toBe("2.0.0"); // Semver first
    expect(result.versions[1]?.version).toBe("1.0.0"); // Semver second
    expect(result.versions[2]?.version).toBe("latest"); // Non-semver last
  });

  it("should handle missing repository metadata", () => {
    const mockTagsResponse: DockerHubTagsResponse = {
      count: 1,
      results: [
        {
          name: "latest",
          tag_last_pushed: "2023-05-22T14:12:00.000Z",
          tag_status: "active",
          digest: "sha256:abc123",
        },
      ],
    };

    const result = parseDockerHubTagsResponse("myapp", mockTagsResponse);

    expect(result.name).toBe("myapp");
    expect(result.description).toBeUndefined();
    expect(result.metadata?.["starCount"]).toBeUndefined();
    expect(result.metadata?.["pullCount"]).toBeUndefined();
    expect(result.versions).toHaveLength(1);
  });

  it("should handle prerelease filtering", () => {
    const mockTagsResponse: DockerHubTagsResponse = {
      count: 4,
      results: [
        {
          name: "2.0.0",
          tag_last_pushed: "2023-05-01T00:00:00.000Z",
          tag_status: "active",
          digest: "sha256:stable",
        },
        {
          name: "2.0.0-rc1",
          tag_last_pushed: "2023-04-25T00:00:00.000Z",
          tag_status: "active",
          digest: "sha256:rc",
        },
        {
          name: "2.0.0-beta",
          tag_last_pushed: "2023-04-20T00:00:00.000Z",
          tag_status: "active",
          digest: "sha256:beta",
        },
        {
          name: "1.0.0",
          tag_last_pushed: "2023-04-01T00:00:00.000Z",
          tag_status: "active",
          digest: "sha256:old",
        },
      ],
    };

    // Test default behavior (filter out prereleases)
    const resultFiltered = parseDockerHubTagsResponse(
      "myapp",
      mockTagsResponse
    );
    expect(resultFiltered.versions).toHaveLength(2);
    expect(resultFiltered.versions[0]?.version).toBe("2.0.0");
    expect(resultFiltered.versions[1]?.version).toBe("1.0.0");

    // Test with prereleases included
    const resultWithPrerelease = parseDockerHubTagsResponse(
      "myapp",
      mockTagsResponse,
      undefined,
      {
        includePrerelease: true,
      }
    );
    expect(resultWithPrerelease.versions).toHaveLength(4);
    expect(resultWithPrerelease.versions[0]?.version).toBe("2.0.0");
    expect(resultWithPrerelease.versions[1]?.version).toBe("2.0.0-rc1");
    expect(resultWithPrerelease.versions[2]?.version).toBe("2.0.0-beta");
    expect(resultWithPrerelease.versions[3]?.version).toBe("1.0.0");
  });

  it("should handle non-semver tags", () => {
    const mockTagsResponse: DockerHubTagsResponse = {
      count: 4,
      results: [
        {
          name: "latest",
          tag_last_pushed: "2023-05-01T00:00:00.000Z",
          tag_status: "active",
          digest: "sha256:latest",
        },
        {
          name: "stable",
          tag_last_pushed: "2023-04-20T00:00:00.000Z",
          tag_status: "active",
          digest: "sha256:stable",
        },
        {
          name: "2023-05-01",
          tag_last_pushed: "2023-04-15T00:00:00.000Z",
          tag_status: "active",
          digest: "sha256:date",
        },
        {
          name: "1.0.0",
          tag_last_pushed: "2023-04-01T00:00:00.000Z",
          tag_status: "active",
          digest: "sha256:semver",
        },
      ],
    };

    const result = parseDockerHubTagsResponse("myapp", mockTagsResponse);

    expect(result.versions).toHaveLength(4);

    // Check isSemver flags
    const latestTag = result.versions.find(v => v.version === "latest");
    const stableTag = result.versions.find(v => v.version === "stable");
    const dateTag = result.versions.find(v => v.version === "2023-05-01");
    const semverTag = result.versions.find(v => v.version === "1.0.0");

    expect(latestTag?.isSemver).toBe(false);
    expect(stableTag?.isSemver).toBe(false);
    expect(dateTag?.isSemver).toBe(false);
    expect(semverTag?.isSemver).toBe(true);
  });
});
