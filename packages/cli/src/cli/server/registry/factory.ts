// pattern: Functional Core

import { NpmRegistryAdapter } from "./npm-adapter.js";

import type { RegistryAdapter, RegistryType } from "./types.js";

/**
 * Factory for creating registry adapters based on type
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- factory pattern with only static methods
export class RegistryAdapterFactory {
  /**
   * Create a registry adapter for the specified type
   */
  static createAdapter(type: RegistryType): RegistryAdapter {
    switch (type) {
      case "node":
        return new NpmRegistryAdapter();

      case "python":
        throw new Error("Python registry adapter not yet implemented");

      case "container":
        throw new Error("Container registry adapter not yet implemented");

      default:
        throw new Error(`Unsupported registry type: ${type}`);
    }
  }

  /**
   * Get all supported registry types with their display names
   */
  static getSupportedRegistries(): {
    type: RegistryType;
    displayName: string;
    implemented: boolean;
  }[] {
    return [
      { type: "node", displayName: "Node.js (NPM)", implemented: true },
      { type: "python", displayName: "Python (PyPI)", implemented: false },
      {
        type: "container",
        displayName: "Container (Docker)",
        implemented: false,
      },
    ];
  }

  /**
   * Get only the implemented registry types
   */
  static getAvailableRegistries(): {
    type: RegistryType;
    displayName: string;
  }[] {
    return this.getSupportedRegistries()
      .filter(registry => registry.implemented)
      .map(({ type, displayName }) => ({ type, displayName }));
  }
}
