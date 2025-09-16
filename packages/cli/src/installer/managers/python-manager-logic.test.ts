import { describe, expect, it } from "vitest";

import {
  determineReshimAction,
  generatePyprojectToml,
} from "./python-manager-logic.js";

describe("determineReshimAction", () => {
  it("should return 'none' if manager is 'none'", () => {
    const action = determineReshimAction(
      "none",
      "/home/user/.asdf/shims/python"
    );
    expect(action).toBe("none");
  });

  it("should return 'asdf' if manager is 'asdf'", () => {
    const action = determineReshimAction("asdf", "/usr/bin/python");
    expect(action).toBe("asdf");
  });

  it("should return 'mise' if manager is 'mise'", () => {
    const action = determineReshimAction("mise", "/usr/bin/python");
    expect(action).toBe("mise");
  });

  describe("auto mode", () => {
    it("should return 'asdf' if path contains 'asdf'", () => {
      const action = determineReshimAction(
        "auto",
        "/home/user/.asdf/shims/python"
      );
      expect(action).toBe("asdf");
    });

    it("should return 'mise' if path contains 'mise'", () => {
      const action = determineReshimAction(
        "auto",
        "/home/user/.mise/shims/python"
      );
      expect(action).toBe("mise");
    });

    it("should throw an error if path contains both asdf and mise", () => {
      expect(() =>
        determineReshimAction("auto", "/foo/asdf/bar/mise/baz")
      ).toThrow(
        "Your PATH is configured to use both asdf and mise for the same tool, which is not supported."
      );
    });

    it("should return 'none' if path does not contain asdf or mise", () => {
      const action = determineReshimAction("auto", "/usr/bin/python");
      expect(action).toBe("none");
    });

    it("should throw an error if path is null", () => {
      expect(() => determineReshimAction("auto", null)).toThrow(
        "Cannot determine version manager in 'auto' mode because the base executable (e.g., python) was not found in the PATH."
      );
    });
  });
});

describe("generatePyprojectToml", () => {
  it("should generate toml with exact python version when specified", () => {
    const result = generatePyprojectToml(
      "test-server",
      { package: "mcp-test", version: "1.0.0", pythonVersion: "3.11.0" },
      "==3.11.0"
    );

    expect(result).toContain('name = "mcpadre-deps-test-server"');
    expect(result).toContain('requires-python = "==3.11.0"');
    expect(result).toContain('"mcp-test==1.0.0"');
  });

  it("should generate toml with provided requirement", () => {
    const result = generatePyprojectToml(
      "test-server",
      { package: "mcp-test", version: "1.0.0" },
      ">=3.13"
    );

    expect(result).toContain('name = "mcpadre-deps-test-server"');
    expect(result).toContain('requires-python = ">=3.13"');
    expect(result).toContain('"mcp-test==1.0.0"');
  });

  it("should generate toml with system Python requirement", () => {
    const result = generatePyprojectToml(
      "test-server",
      { package: "mcp-test", version: "1.0.0" },
      ">=3.11"
    );

    expect(result).toContain('name = "mcpadre-deps-test-server"');
    expect(result).toContain('requires-python = ">=3.11"');
    expect(result).toContain('"mcp-test==1.0.0"');
  });
});
