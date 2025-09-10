// pattern: Imperative Shell
import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CommandStringTemplate } from "../types/v1/index.js";

import {
  loadAndValidateSettingsProject,
  loadSettingsProjectFromFile,
  validateSettingsProjectObject,
} from "./settings-project.js";

import type {
  EnvStringTemplate,
  PathStringTemplate,
  SettingsProject,
} from "../types/index.js";

describe("SettingsProject Loaders", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create unique test directory
    testDir = join(
      tmpdir(),
      `mcpadre-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe("loadSettingsProjectFromFile", () => {
    const validSettings: SettingsProject = {
      version: 1,
      mcpServers: {
        "test-server": {
          shell: {
            command: "node test-server.js" as CommandStringTemplate,
          },
        },
      },
    };

    it("should load JSON files", async () => {
      const filePath = join(testDir, "config.json");
      await writeFile(filePath, JSON.stringify(validSettings));

      const result = await loadSettingsProjectFromFile(filePath);
      expect(result).toEqual(validSettings);
    });

    it("should load YAML files", async () => {
      const filePath = join(testDir, "config.yaml");
      const yamlContent = `
version: 1
mcpServers:
  test-server:
    shell:
      command: "node test-server.js"
`.trim();
      await writeFile(filePath, yamlContent);

      const result = await loadSettingsProjectFromFile(filePath);
      expect(result).toEqual(validSettings);
    });

    it("should load YML files", async () => {
      const filePath = join(testDir, "config.yml");
      const yamlContent = `
version: 1
mcpServers:
  test-server:
    shell:
      command: "node test-server.js"
`.trim();
      await writeFile(filePath, yamlContent);

      const result = await loadSettingsProjectFromFile(filePath);
      expect(result).toEqual(validSettings);
    });

    it("should load TOML files", async () => {
      const filePath = join(testDir, "config.toml");
      const tomlContent = `
version = 1

[mcpServers.test-server.shell]
command = "node test-server.js"
`.trim();
      await writeFile(filePath, tomlContent);

      const result = await loadSettingsProjectFromFile(filePath);
      expect(result).toEqual(validSettings);
    });

    it("should handle complex configurations", async () => {
      const complexSettings: SettingsProject = {
        version: 1,
        env: {
          API_KEY: { pass: "API_KEY" },
          PROJECT_DIR: { special: "home" },
          COMPUTED: { command: "echo hello" },
          TEMPLATE: { string: "prefix-{{value}}" as EnvStringTemplate },
        },
        mcpServers: {
          "server-1": {
            shell: {
              command: "node server1.js" as CommandStringTemplate,
            },
            env: {
              SERVER_PORT: "3001" as EnvStringTemplate,
            },
            sandbox: {
              enabled: true,
              networking: false,
              omitSystemPaths: true,
              omitWorkspacePath: false,
              allowRead: ["/tmp" as PathStringTemplate],
              allowReadWrite: ["/tmp/output" as PathStringTemplate],
            },
          },
          "server-2": {
            shell: {
              command: "python server2.py" as CommandStringTemplate,
              cwd: "/opt/servers" as PathStringTemplate,
            },
          },
        },
      };

      const filePath = join(testDir, "complex.json");
      await writeFile(filePath, JSON.stringify(complexSettings));

      const result = await loadSettingsProjectFromFile(filePath);
      expect(result).toEqual(complexSettings);
    });

    it("should throw error for unsupported file extensions", async () => {
      const filePath = join(testDir, "config.txt");
      await writeFile(filePath, "invalid content");

      await expect(loadSettingsProjectFromFile(filePath)).rejects.toThrow(
        "Unsupported file format: .txt"
      );
    });

    it("should throw error for invalid JSON", async () => {
      const filePath = join(testDir, "invalid.json");
      await writeFile(filePath, "{ invalid json }");

      await expect(loadSettingsProjectFromFile(filePath)).rejects.toThrow();
    });

    it("should throw error for invalid YAML", async () => {
      const filePath = join(testDir, "invalid.yaml");
      await writeFile(filePath, "invalid: [\n  - yaml\n  missing: bracket");

      await expect(loadSettingsProjectFromFile(filePath)).rejects.toThrow();
    });

    it("should throw error for invalid TOML", async () => {
      const filePath = join(testDir, "invalid.toml");
      await writeFile(filePath, "[invalid\ntoml = structure");

      await expect(loadSettingsProjectFromFile(filePath)).rejects.toThrow();
    });
  });

  describe("validateSettingsProjectObject", () => {
    it("should validate valid SettingsProject", () => {
      const validData: SettingsProject = {
        version: 1,
        mcpServers: {
          "test-server": {
            shell: {
              command: "node test.js" as CommandStringTemplate,
            },
          },
        },
      };

      expect(validateSettingsProjectObject(validData)).toBe(true);
    });

    it("should validate minimal configuration", () => {
      const minimalData: SettingsProject = {
        version: 1,
        mcpServers: {},
      };

      expect(validateSettingsProjectObject(minimalData)).toBe(true);
    });

    it("should validate configuration with env", () => {
      const dataWithEnv: SettingsProject = {
        version: 1,
        env: {
          TEST_VAR: "test-value" as EnvStringTemplate,
          PASS_VAR: { pass: "EXISTING_VAR" },
        },
        mcpServers: {
          server: {
            shell: {
              command: "test" as CommandStringTemplate,
            },
          },
        },
      };

      expect(validateSettingsProjectObject(dataWithEnv)).toBe(true);
    });
  });

  describe("loadAndValidateSettingsProject", () => {
    it("should load and validate valid configuration", async () => {
      const validSettings: SettingsProject = {
        version: 1,
        mcpServers: {
          "test-server": {
            shell: {
              command: "node test-server.js" as CommandStringTemplate,
            },
          },
        },
      };

      const filePath = join(testDir, "valid.json");
      await writeFile(filePath, JSON.stringify(validSettings));

      const result = await loadAndValidateSettingsProject(filePath);
      expect(result).toEqual(validSettings);
    });

    it("should work with YAML files", async () => {
      const validSettings: SettingsProject = {
        version: 1,
        mcpServers: {
          "test-server": {
            shell: {
              command: "node test-server.js" as CommandStringTemplate,
            },
          },
        },
      };

      const filePath = join(testDir, "valid.yaml");
      const yamlContent = `
version: 1
mcpServers:
  test-server:
    shell:
      command: "node test-server.js"
`.trim();
      await writeFile(filePath, yamlContent);

      const result = await loadAndValidateSettingsProject(filePath);
      expect(result).toEqual(validSettings);
    });

    it("should work with TOML files", async () => {
      const validSettings: SettingsProject = {
        version: 1,
        mcpServers: {
          "test-server": {
            shell: {
              command: "node test-server.js" as CommandStringTemplate,
            },
          },
        },
      };

      const filePath = join(testDir, "valid.toml");
      const tomlContent = `
version = 1

[mcpServers.test-server.shell]
command = "node test-server.js"
`.trim();
      await writeFile(filePath, tomlContent);

      const result = await loadAndValidateSettingsProject(filePath);
      expect(result).toEqual(validSettings);
    });
  });

  describe("validation error cases", () => {
    it("should throw for missing version", () => {
      const invalidData = {
        mcpServers: {
          server: { type: "stdio", command: "test" },
        },
      };

      expect(() => validateSettingsProjectObject(invalidData)).toThrow(
        "Settings validation failed"
      );
    });

    it("should throw for wrong version type", () => {
      const invalidData = {
        version: "1",
        mcpServers: {},
      };

      expect(() => validateSettingsProjectObject(invalidData)).toThrow(
        "Settings validation failed"
      );
    });

    it("should throw for wrong version value", () => {
      const invalidData = {
        version: 2,
        mcpServers: {},
      };

      expect(() => validateSettingsProjectObject(invalidData)).toThrow(
        "Settings validation failed"
      );
    });

    it("should throw for missing mcpServers", () => {
      const invalidData = {
        version: 1,
      };

      expect(() => validateSettingsProjectObject(invalidData)).toThrow(
        "Settings validation failed"
      );
    });

    it("should throw for invalid mcpServer type", () => {
      const invalidData = {
        version: 1,
        mcpServers: {
          server: { type: "invalid", command: "test" },
        },
      };

      expect(() => validateSettingsProjectObject(invalidData)).toThrow(
        "Settings validation failed"
      );
    });

    it("should throw for missing command in stdio server", () => {
      const invalidData = {
        version: 1,
        mcpServers: {
          server: { type: "stdio" },
        },
      };

      expect(() => validateSettingsProjectObject(invalidData)).toThrow(
        "Settings validation failed"
      );
    });

    it("should throw for invalid env value type", () => {
      const invalidData = {
        version: 1,
        env: {
          INVALID: 123,
        },
        mcpServers: {},
      };

      expect(() => validateSettingsProjectObject(invalidData)).toThrow(
        "Settings validation failed"
      );
    });

    it("should throw for invalid special directory", () => {
      const invalidData = {
        version: 1,
        env: {
          INVALID_DIR: { special: "invalid_dir" },
        },
        mcpServers: {},
      };

      expect(() => validateSettingsProjectObject(invalidData)).toThrow(
        "Settings validation failed"
      );
    });

    it("should throw for null input", () => {
      expect(() => validateSettingsProjectObject(null)).toThrow(
        "Settings validation failed"
      );
    });

    it("should throw for array input", () => {
      expect(() => validateSettingsProjectObject([])).toThrow(
        "Settings validation failed"
      );
    });

    it("should throw for string input", () => {
      expect(() => validateSettingsProjectObject("invalid")).toThrow(
        "Settings validation failed"
      );
    });

    it("should throw for number input", () => {
      expect(() => validateSettingsProjectObject(42)).toThrow(
        "Settings validation failed"
      );
    });

    // Note: Additional properties are allowed by the schema
    // This is intentional behavior for extensibility
  });

  describe("file loading error cases", () => {
    it("should throw validation error for invalid file content", async () => {
      const invalidSettings = {
        version: "invalid",
        mcpServers: {},
      };

      const filePath = join(testDir, "invalid.json");
      await writeFile(filePath, JSON.stringify(invalidSettings));

      await expect(loadAndValidateSettingsProject(filePath)).rejects.toThrow(
        "Settings validation failed"
      );
    });

    it("should throw error for non-existent file", async () => {
      const filePath = join(testDir, "non-existent.json");

      await expect(loadAndValidateSettingsProject(filePath)).rejects.toThrow();
    });

    it("should throw error for malformed JSON in validation", async () => {
      const filePath = join(testDir, "malformed.json");
      await writeFile(filePath, "{ malformed json }");

      await expect(loadAndValidateSettingsProject(filePath)).rejects.toThrow();
    });
  });
});
