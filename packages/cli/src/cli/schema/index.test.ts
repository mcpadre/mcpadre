// pattern: Functional Core

import { describe, expect, it } from "vitest";
import YAML from "yaml";

import {
  ServerSpecV1,
  SettingsProjectV1,
  SettingsUserV1,
} from "../../config/types/v1/index.js";

describe("Schema TypeBox definitions", () => {
  describe("SettingsUserV1", () => {
    it("should be a valid TypeBox schema object", () => {
      expect(SettingsUserV1).toBeDefined();
      expect(typeof SettingsUserV1).toBe("object");
    });

    it("should serialize to valid JSON", () => {
      const json = JSON.stringify(SettingsUserV1, null, 2);
      expect(json).toBeDefined();
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("should serialize to valid YAML", () => {
      const yaml = YAML.stringify(SettingsUserV1);
      expect(yaml).toBeDefined();
      expect(() => YAML.parse(yaml)).not.toThrow();
    });

    it("should have expected JSON Schema properties", () => {
      expect(SettingsUserV1).toHaveProperty("type");
      expect(SettingsUserV1).toHaveProperty("properties");
    });
  });

  describe("SettingsProjectV1", () => {
    it("should be a valid TypeBox schema object", () => {
      expect(SettingsProjectV1).toBeDefined();
      expect(typeof SettingsProjectV1).toBe("object");
    });

    it("should serialize to valid JSON", () => {
      const json = JSON.stringify(SettingsProjectV1, null, 2);
      expect(json).toBeDefined();
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("should serialize to valid YAML", () => {
      const yaml = YAML.stringify(SettingsProjectV1);
      expect(yaml).toBeDefined();
      expect(() => YAML.parse(yaml)).not.toThrow();
    });

    it("should have expected JSON Schema properties", () => {
      expect(SettingsProjectV1).toHaveProperty("type");
      expect(SettingsProjectV1).toHaveProperty("properties");
    });
  });

  describe("ServerSpecV1", () => {
    it("should be a valid TypeBox schema object", () => {
      expect(ServerSpecV1).toBeDefined();
      expect(typeof ServerSpecV1).toBe("object");
    });

    it("should serialize to valid JSON", () => {
      const json = JSON.stringify(ServerSpecV1, null, 2);
      expect(json).toBeDefined();
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("should serialize to valid YAML", () => {
      const yaml = YAML.stringify(ServerSpecV1);
      expect(yaml).toBeDefined();
      expect(() => YAML.parse(yaml)).not.toThrow();
    });

    it("should have expected JSON Schema properties", () => {
      expect(ServerSpecV1).toHaveProperty("type");
      expect(ServerSpecV1).toHaveProperty("properties");
    });
  });

  describe("JSON output format", () => {
    it("should produce pretty-printed JSON with 2-space indentation", () => {
      const json = JSON.stringify(ServerSpecV1, null, 2);
      const lines = json.split("\n");

      // Verify multi-line output
      expect(lines.length).toBeGreaterThan(1);

      // Check for 2-space indentation pattern
      const indentedLines = lines.filter(line => line.startsWith("  "));
      expect(indentedLines.length).toBeGreaterThan(0);

      // Verify it's valid JSON
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe("YAML output format", () => {
    it("should produce valid YAML output", () => {
      const yaml = YAML.stringify(ServerSpecV1);

      // Verify multi-line output
      expect(yaml.split("\n").length).toBeGreaterThan(1);

      // Verify it's valid YAML that parses
      expect(() => YAML.parse(yaml)).not.toThrow();
    });
  });
});
