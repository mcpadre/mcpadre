// pattern: Test
import { describe, expect, it } from "vitest";

import { DockerHubRegistryAdapter } from "./docker-adapter.js";
import { RegistryAdapterFactory } from "./factory.js";
import { NpmRegistryAdapter } from "./npm-adapter.js";
import { PypiRegistryAdapter } from "./pypi-adapter.js";

describe("RegistryAdapterFactory", () => {
  describe("createAdapter", () => {
    it("should create NPM adapter for node type", () => {
      const adapter = RegistryAdapterFactory.createAdapter("node");
      expect(adapter).toBeInstanceOf(NpmRegistryAdapter);
      expect(adapter.config.type).toBe("node");
      expect(adapter.config.displayName).toBe("NPM Registry");
    });

    it("should create PyPI adapter for python type", () => {
      const adapter = RegistryAdapterFactory.createAdapter("python");
      expect(adapter).toBeInstanceOf(PypiRegistryAdapter);
      expect(adapter.config.type).toBe("python");
      expect(adapter.config.displayName).toBe("PyPI Registry");
    });

    it("should create Docker Hub adapter for container type", () => {
      const adapter = RegistryAdapterFactory.createAdapter("container");
      expect(adapter).toBeInstanceOf(DockerHubRegistryAdapter);
      expect(adapter.config.type).toBe("container");
      expect(adapter.config.displayName).toBe("Docker Hub Registry");
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
        { type: "python", displayName: "Python (PyPI)", implemented: true },
        {
          type: "container",
          displayName: "Container (Docker)",
          implemented: true,
        },
      ]);
    });
  });

  describe("getAvailableRegistries", () => {
    it("should return only implemented registries", () => {
      const available = RegistryAdapterFactory.getAvailableRegistries();

      expect(available).toEqual([
        { type: "node", displayName: "Node.js (NPM)" },
        { type: "python", displayName: "Python (PyPI)" },
        { type: "container", displayName: "Container (Docker)" },
      ]);
    });

    it("should include all implemented registries", () => {
      const available = RegistryAdapterFactory.getAvailableRegistries();
      const types = available.map(r => r.type);

      expect(types).toContain("node");
      expect(types).toContain("python");
      expect(types).toContain("container");
    });
  });
});
