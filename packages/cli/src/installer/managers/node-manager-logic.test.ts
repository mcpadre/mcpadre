import { describe, expect, it } from "vitest";

import { determineReshimAction } from "./node-manager-logic.js";

describe("determineReshimAction", () => {
  it("should return 'none' if manager is 'none'", () => {
    const action = determineReshimAction("none", "/home/user/.asdf/shims/node");
    expect(action).toBe("none");
  });

  it("should return 'asdf' if manager is 'asdf'", () => {
    const action = determineReshimAction("asdf", "/usr/bin/node");
    expect(action).toBe("asdf");
  });

  it("should return 'mise' if manager is 'mise'", () => {
    const action = determineReshimAction("mise", "/usr/bin/node");
    expect(action).toBe("mise");
  });

  describe("auto mode", () => {
    it("should return 'asdf' if path contains 'asdf'", () => {
      const action = determineReshimAction(
        "auto",
        "/home/user/.asdf/shims/node"
      );
      expect(action).toBe("asdf");
    });

    it("should return 'mise' if path contains 'mise'", () => {
      const action = determineReshimAction(
        "auto",
        "/home/user/.mise/shims/node"
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
      const action = determineReshimAction("auto", "/usr/bin/node");
      expect(action).toBe("none");
    });

    it("should throw an error if path is null", () => {
      expect(() => determineReshimAction("auto", null)).toThrow(
        "Cannot determine version manager in 'auto' mode because the base executable (e.g., node) was not found in the PATH."
      );
    });
  });
});
