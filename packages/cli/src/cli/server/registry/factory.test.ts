// pattern: Test
import { describe, expect, it } from "vitest";

import { RegistryAdapterFactory } from "./factory.js";
import { NpmRegistryAdapter } from "./npm-adapter.js";

describe("RegistryAdapterFactory", () => {
  describe("createAdapter", () => {
    it("should create NPM adapter for node type", () => {
      const adapter = RegistryAdapterFactory.createAdapter("node");
      expect(adapter).toBeInstanceOf(NpmRegistryAdapter);
      expect(adapter.config.type).toBe("node");
      expect(adapter.config.displayName).toBe("NPM Registry");
    });

    it("should throw error for unimplemented python type", () => {
      expect(() => {
        RegistryAdapterFactory.createAdapter("python");
      }).toThrow("Python registry adapter not yet implemented");
    });

    it("should throw error for unimplemented container type", () => {
      expect(() => {
        RegistryAdapterFactory.createAdapter("container");
      }).toThrow("Container registry adapter not yet implemented");
    });

    it("should throw error for unsupported type", () => {
      expect(() => {
        RegistryAdapterFactory.createAdapter("invalid" as any);
      }).toThrow("Unsupported registry type: invalid");
    });
  });

  describe("getSupportedRegistries", () => {
    it("should return all supported registries with implementation status", () => {
      const registries = RegistryAdapterFactory.getSupportedRegistries();

      expect(registries).toEqual([
        { type: "node", displayName: "Node.js (NPM)", implemented: true },
        { type: "python", displayName: "Python (PyPI)", implemented: false },
        {
          type: "container",
          displayName: "Container (Docker)",
          implemented: false,
        },
      ]);
    });
  });

  describe("getAvailableRegistries", () => {
    it("should return only implemented registries", () => {
      const available = RegistryAdapterFactory.getAvailableRegistries();

      expect(available).toEqual([
        { type: "node", displayName: "Node.js (NPM)" },
      ]);
    });

    it("should not include unimplemented registries", () => {
      const available = RegistryAdapterFactory.getAvailableRegistries();
      const types = available.map(r => r.type);

      expect(types).not.toContain("python");
      expect(types).not.toContain("container");
    });
  });
});
