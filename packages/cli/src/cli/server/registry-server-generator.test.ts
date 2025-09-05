// pattern: Test
import { describe, expect, it } from "vitest";

import {
  generateDefaultServerName,
  generateServerConfigFromRegistry,
  validateServerName,
} from "./registry-server-generator.js";

describe("registry-server-generator", () => {
  describe("generateServerConfigFromRegistry", () => {
    it("should generate Node.js server config", () => {
      const result = generateServerConfigFromRegistry({
        serverName: "my-server",
        registryType: "node",
        packageName: "lodash",
        version: "4.17.21",
      });

      expect(result.serverName).toBe("my-server");
      expect(result.serverConfig).toEqual({
        node: {
          package: "lodash",
          version: "4.17.21",
        },
      });
    });

    it("should throw error for unsupported registry types", () => {
      expect(() => {
        generateServerConfigFromRegistry({
          serverName: "my-server",
          registryType: "python" as any,
          packageName: "requests",
          version: "2.31.0",
        });
      }).toThrow("Python server generation not yet implemented");

      expect(() => {
        generateServerConfigFromRegistry({
          serverName: "my-server",
          registryType: "container" as any,
          packageName: "nginx",
          version: "latest",
        });
      }).toThrow("Container server generation not yet implemented");
    });

    it("should throw error for completely invalid registry type", () => {
      expect(() => {
        generateServerConfigFromRegistry({
          serverName: "my-server",
          registryType: "invalid" as any,
          packageName: "package",
          version: "1.0.0",
        });
      }).toThrow("Unsupported registry type: invalid");
    });
  });

  describe("generateDefaultServerName", () => {
    it("should generate simple server name from package name", () => {
      expect(generateDefaultServerName("lodash")).toBe("lodash");
      expect(generateDefaultServerName("express")).toBe("express");
    });

    it("should handle scoped packages", () => {
      expect(generateDefaultServerName("@types/node")).toBe("node");
      expect(generateDefaultServerName("@angular/core")).toBe("core");
    });

    it("should clean up invalid characters", () => {
      expect(generateDefaultServerName("my@package")).toBe("my-package");
      expect(generateDefaultServerName("package.name")).toBe("package-name");
      expect(generateDefaultServerName("package_name")).toBe("package_name");
      expect(generateDefaultServerName("package--with---hyphens")).toBe(
        "package-with-hyphens"
      );
    });

    it("should remove leading and trailing hyphens", () => {
      expect(generateDefaultServerName("-package-")).toBe("package");
      expect(generateDefaultServerName("--package--")).toBe("package");
    });

    it("should handle empty or invalid names", () => {
      expect(generateDefaultServerName("")).toBe("mcp-server");
      expect(generateDefaultServerName("@@@")).toBe("mcp-server");
      expect(generateDefaultServerName("---")).toBe("mcp-server");
    });

    it("should ensure uniqueness when names conflict", () => {
      const existing = ["lodash", "lodash-2"];

      expect(generateDefaultServerName("lodash", existing)).toBe("lodash-3");
      expect(generateDefaultServerName("express", existing)).toBe("express");
    });

    it("should handle complex uniqueness scenarios", () => {
      const existing = ["server", "server-2", "server-3", "server-5"];

      expect(generateDefaultServerName("server", existing)).toBe("server-4");
    });

    it("should handle scoped packages with uniqueness", () => {
      const existing = ["node", "node-2"];

      expect(generateDefaultServerName("@types/node", existing)).toBe("node-3");
    });
  });

  describe("validateServerName", () => {
    it("should validate correct server names", () => {
      expect(validateServerName("valid-name")).toBe(true);
      expect(validateServerName("valid_name")).toBe(true);
      expect(validateServerName("validname")).toBe(true);
      expect(validateServerName("valid123")).toBe(true);
      expect(validateServerName("Valid-Name")).toBe(true);
    });

    it("should reject empty or whitespace names", () => {
      expect(validateServerName("")).toBe(false);
      expect(validateServerName("   ")).toBe(false);
    });

    it("should reject names with invalid characters", () => {
      expect(validateServerName("invalid@name")).toBe(false);
      expect(validateServerName("invalid.name")).toBe(false);
      expect(validateServerName("invalid name")).toBe(false);
      expect(validateServerName("invalid/name")).toBe(false);
      expect(validateServerName("invalid:name")).toBe(false);
    });

    it("should reject names starting or ending with hyphens/underscores", () => {
      expect(validateServerName("-invalid")).toBe(false);
      expect(validateServerName("invalid-")).toBe(false);
      expect(validateServerName("_invalid")).toBe(false);
      expect(validateServerName("invalid_")).toBe(false);
    });

    it("should accept names with internal hyphens and underscores", () => {
      expect(validateServerName("valid-name-here")).toBe(true);
      expect(validateServerName("valid_name_here")).toBe(true);
      expect(validateServerName("valid-name_here")).toBe(true);
    });
  });
});
