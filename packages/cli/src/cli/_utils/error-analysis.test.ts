// pattern: Functional Core

import { describe, expect, it } from "vitest";

import { analyzeError } from "./error-analysis.js";

describe("analyzeError", () => {
  describe("filesystem errors", () => {
    it("should categorize EACCES errors", () => {
      const error = new Error("EACCES: permission denied, open '/etc/test'");
      const result = analyzeError(error);

      expect(result.category).toBe("filesystem");
      expect(result.userMessage).toContain("Permission denied");
      expect(result.suggestions).toContain(
        "Check that you have write permissions to the target directories"
      );
    });

    it("should categorize permission denied errors", () => {
      const error = new Error("permission denied accessing file");
      const result = analyzeError(error);

      expect(result.category).toBe("filesystem");
      expect(result.userMessage).toContain("Permission denied");
    });

    it("should categorize ENOENT errors", () => {
      const error = new Error("ENOENT: no such file or directory");
      const result = analyzeError(error);

      expect(result.category).toBe("filesystem");
      expect(result.userMessage).toContain("file or directory not found");
      expect(result.suggestions).toContain(
        "Verify the file or directory path exists"
      );
    });
  });

  describe("network errors", () => {
    it("should categorize ECONNREFUSED errors", () => {
      const error = new Error("ECONNREFUSED: Connection refused by server");
      const result = analyzeError(error);

      expect(result.category).toBe("network");
      expect(result.userMessage).toContain("Connection refused");
      expect(result.suggestions).toContain(
        "Verify the server is running and accessible"
      );
    });

    it("should categorize ETIMEDOUT errors", () => {
      const error = new Error("ETIMEDOUT: Connection timed out");
      const result = analyzeError(error);

      expect(result.category).toBe("network");
      expect(result.userMessage).toContain("Connection timed out");
    });

    it("should categorize getaddrinfo errors", () => {
      const error = new Error("getaddrinfo ENOTFOUND example.com");
      const result = analyzeError(error);

      expect(result.category).toBe("network");
      expect(result.userMessage).toContain("Unable to reach");
    });
  });

  describe("configuration errors", () => {
    it("should categorize config not found errors", () => {
      const error = new Error("No mcpadre configuration file found");
      const result = analyzeError(error);

      expect(result.category).toBe("configuration");
      expect(result.userMessage).toContain("No mcpadre configuration");
      expect(result.suggestions).toContain(
        "Run this command from a directory containing mcpadre.yaml, mcpadre.json, or mcpadre.toml"
      );
    });

    it("should categorize validation errors", () => {
      const error = new Error("Invalid configuration format");
      const result = analyzeError(error);

      expect(result.category).toBe("validation");
      expect(result.userMessage).toContain("validation failed");
    });
  });

  describe("user cancellation", () => {
    it("should handle Inquirer SIGINT gracefully", () => {
      const error = new Error("User force closed the prompt with 0 null");
      const result = analyzeError(error);

      expect(result.category).toBe("cancellation");
      expect(result.userMessage).toBe(""); // Silent - no error message
      expect(result.suggestions).toEqual([]); // No suggestions needed
      expect(result.technicalMessage).toBe(
        "User force closed the prompt with 0 null"
      );
    });

    it("should handle variations of user cancellation message", () => {
      const error1 = new Error("User force closed the prompt");
      const result1 = analyzeError(error1);

      expect(result1.category).toBe("cancellation");
      expect(result1.userMessage).toBe("");
      expect(result1.suggestions).toEqual([]);

      // Test the actual error message from your example
      const error2 = new Error("User force closed the prompt with SIGINT");
      const result2 = analyzeError(error2);

      expect(result2.category).toBe("cancellation");
      expect(result2.userMessage).toBe("");
      expect(result2.suggestions).toEqual([]);
    });
  });

  describe("unknown errors", () => {
    it("should categorize unrecognized errors", () => {
      const result = analyzeError("Something went wrong");

      expect(result.category).toBe("unknown");
      expect(result.userMessage).toContain("unexpected error");
      expect(result.technicalMessage).toBe("Something went wrong");
    });

    it("should handle non-Error objects", () => {
      const result = analyzeError({ message: "Custom error" });

      expect(result.category).toBe("unknown");
      expect(result.technicalMessage).toBe("Custom error");
    });

    it("should handle unknown objects", () => {
      const result = analyzeError(42);

      expect(result.category).toBe("unknown");
      expect(result.technicalMessage).toBe("42");
    });

    it("should always provide suggestions", () => {
      const result = analyzeError("Unknown error");

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions).toContain(
        "Run with --log-level debug for more detailed information"
      );
    });
  });
});
