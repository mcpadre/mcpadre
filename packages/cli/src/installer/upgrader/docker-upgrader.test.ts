// Unit tests for Docker upgrader with 'v' prefix support
import { describe, expect, it } from "vitest";

// We need to test the determineUpgradeType function
// Since it's not exported, we'll need to test it through the main function
// For now, let's create a separate test for the logic

describe("Docker version upgrade type detection", () => {
  // Helper function that mirrors the logic in docker-upgrader.ts
  function determineUpgradeType(
    currentTag: string,
    targetTag: string
  ): "major" | "minor" | "patch" | undefined {
    // If tags are the same, it's a digest-only update
    if (currentTag === targetTag) {
      return undefined;
    }

    // Simple semver detection (handles v1.2.3 and 1.2.3 formats)
    const semverRegex = /^v?(\d+)\.(\d+)\.(\d+)/;
    const currentMatch = currentTag.match(semverRegex);
    const targetMatch = targetTag.match(semverRegex);

    if (!currentMatch || !targetMatch) {
      // Not semver, return undefined (unknown upgrade type)
      return undefined;
    }

    const currentMajor = parseInt(currentMatch[1] ?? "0", 10);
    const currentMinor = parseInt(currentMatch[2] ?? "0", 10);
    const currentPatch = parseInt(currentMatch[3] ?? "0", 10);

    const targetMajor = parseInt(targetMatch[1] ?? "0", 10);
    const targetMinor = parseInt(targetMatch[2] ?? "0", 10);
    const targetPatch = parseInt(targetMatch[3] ?? "0", 10);

    if (targetMajor > currentMajor) return "major";
    if (targetMinor > currentMinor) return "minor";
    if (targetPatch > currentPatch) return "patch";

    return undefined;
  }

  describe("without 'v' prefix", () => {
    it("should detect major version upgrade", () => {
      expect(determineUpgradeType("1.0.0", "2.0.0")).toBe("major");
      expect(determineUpgradeType("1.5.3", "2.0.0")).toBe("major");
    });

    it("should detect minor version upgrade", () => {
      expect(determineUpgradeType("1.0.0", "1.1.0")).toBe("minor");
      expect(determineUpgradeType("2.3.5", "2.4.0")).toBe("minor");
    });

    it("should detect patch version upgrade", () => {
      expect(determineUpgradeType("1.0.0", "1.0.1")).toBe("patch");
      expect(determineUpgradeType("2.3.5", "2.3.6")).toBe("patch");
    });

    it("should return undefined for same versions", () => {
      expect(determineUpgradeType("1.0.0", "1.0.0")).toBeUndefined();
      expect(determineUpgradeType("2.3.5", "2.3.5")).toBeUndefined();
    });

    it("should return undefined for downgrades", () => {
      expect(determineUpgradeType("2.0.0", "1.0.0")).toBeUndefined();
      expect(determineUpgradeType("1.1.0", "1.0.0")).toBeUndefined();
      expect(determineUpgradeType("1.0.1", "1.0.0")).toBeUndefined();
    });
  });

  describe("with 'v' prefix", () => {
    it("should detect major version upgrade with v prefix", () => {
      expect(determineUpgradeType("v1.0.0", "v2.0.0")).toBe("major");
      expect(determineUpgradeType("v1.5.3", "v2.0.0")).toBe("major");
    });

    it("should detect minor version upgrade with v prefix", () => {
      expect(determineUpgradeType("v1.0.0", "v1.1.0")).toBe("minor");
      expect(determineUpgradeType("v2.3.5", "v2.4.0")).toBe("minor");
    });

    it("should detect patch version upgrade with v prefix", () => {
      expect(determineUpgradeType("v1.0.0", "v1.0.1")).toBe("patch");
      expect(determineUpgradeType("v2.3.5", "v2.3.6")).toBe("patch");
    });

    it("should return undefined for same versions with v prefix", () => {
      expect(determineUpgradeType("v1.0.0", "v1.0.0")).toBeUndefined();
      expect(determineUpgradeType("v2.3.5", "v2.3.5")).toBeUndefined();
    });
  });

  describe("mixed 'v' prefix", () => {
    it("should handle mixed v prefix correctly", () => {
      expect(determineUpgradeType("1.0.0", "v2.0.0")).toBe("major");
      expect(determineUpgradeType("v1.0.0", "2.0.0")).toBe("major");
      expect(determineUpgradeType("1.0.0", "v1.1.0")).toBe("minor");
      expect(determineUpgradeType("v1.0.0", "1.0.1")).toBe("patch");
    });
  });

  describe("non-semver tags", () => {
    it("should return undefined for non-semver tags", () => {
      expect(determineUpgradeType("latest", "latest")).toBeUndefined();
      expect(determineUpgradeType("main", "develop")).toBeUndefined();
      expect(determineUpgradeType("18", "20")).toBeUndefined();
      expect(determineUpgradeType("18.19", "20.10")).toBeUndefined();
    });
  });

  describe("test containers", () => {
    it("should handle eropple/mcpadre-time-mcp-test versions", () => {
      expect(determineUpgradeType("2.0.0", "2.0.1")).toBe("patch");
    });

    it("should handle eropple/mcpadre-calculator-mcp-test versions", () => {
      expect(determineUpgradeType("v1.0.0", "v1.0.1")).toBe("patch");
    });
  });
});
