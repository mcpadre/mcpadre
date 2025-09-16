import { describe, expect, it } from "vitest";

import {
  getPythonVersionSpec,
  parsePythonVersionOutput,
} from "./requirements.js";

describe("getPythonVersionSpec", () => {
  it("should return exact version when exact=true", () => {
    const result = getPythonVersionSpec("3.11.0", true);
    expect(result).toBe("==3.11.0");
  });

  it("should return >= version when exact=false", () => {
    const result = getPythonVersionSpec("3.11.0", false);
    expect(result).toBe(">=3.11");
  });

  it("should handle short version numbers", () => {
    const result = getPythonVersionSpec("3.13", false);
    expect(result).toBe(">=3.13");
  });

  it("should throw error for invalid version format", () => {
    expect(() => getPythonVersionSpec("invalid", false)).toThrow(
      "Invalid Python version format: invalid"
    );
  });
});

describe("parsePythonVersionOutput", () => {
  it("should parse standard Python version output", () => {
    const result = parsePythonVersionOutput("Python 3.11.0");
    expect(result).toBe("3.11.0");
  });

  it("should parse with extra whitespace", () => {
    const result = parsePythonVersionOutput("  Python 3.13.1  ");
    expect(result).toBe("3.13.1");
  });

  it("should return null for invalid format", () => {
    const result = parsePythonVersionOutput("invalid output");
    expect(result).toBeNull();
  });

  it("should return null for empty string", () => {
    const result = parsePythonVersionOutput("");
    expect(result).toBeNull();
  });
});
