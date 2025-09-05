import { describe, expect, it } from "vitest";

import {
  HOST_CAPABILITY_MAP,
  isProjectCapableHost,
  isUserCapableHost,
  SUPPORTED_HOSTS_V1,
} from "./hosts.js";

describe("Host Capabilities", () => {
  describe("isUserCapableHost", () => {
    it("should return true for user-capable hosts", () => {
      expect(isUserCapableHost("claude-code")).toBe(true);
      expect(isUserCapableHost("claude-desktop")).toBe(true);
      expect(isUserCapableHost("cursor")).toBe(true);
      expect(isUserCapableHost("opencode")).toBe(true);
    });

    it("should return false for project-only hosts", () => {
      expect(isUserCapableHost("zed")).toBe(false);
      expect(isUserCapableHost("vscode")).toBe(false);
    });
  });

  describe("isProjectCapableHost", () => {
    it("should return true for project-capable hosts", () => {
      expect(isProjectCapableHost("claude-code")).toBe(true);
      expect(isProjectCapableHost("cursor")).toBe(true);
      expect(isProjectCapableHost("opencode")).toBe(true);
      expect(isProjectCapableHost("zed")).toBe(true);
      expect(isProjectCapableHost("vscode")).toBe(true);
    });

    it("should return false for user-only hosts", () => {
      expect(isProjectCapableHost("claude-desktop")).toBe(false);
    });
  });

  describe("HOST_CAPABILITY_MAP", () => {
    it("should have entries for all supported hosts", () => {
      for (const host of SUPPORTED_HOSTS_V1) {
        expect(HOST_CAPABILITY_MAP[host]).toBeDefined();
        expect(Array.isArray(HOST_CAPABILITY_MAP[host])).toBe(true);
      }
    });

    it("should have expected capabilities for each host", () => {
      expect(HOST_CAPABILITY_MAP["claude-code"]).toEqual(["PROJECT", "USER"]);
      expect(HOST_CAPABILITY_MAP["claude-desktop"]).toEqual(["USER"]);
      expect(HOST_CAPABILITY_MAP["cursor"]).toEqual(["PROJECT", "USER"]);
      expect(HOST_CAPABILITY_MAP["opencode"]).toEqual(["PROJECT", "USER"]);
      expect(HOST_CAPABILITY_MAP["zed"]).toEqual(["PROJECT"]);
      expect(HOST_CAPABILITY_MAP["vscode"]).toEqual(["PROJECT"]);
    });
  });
});
