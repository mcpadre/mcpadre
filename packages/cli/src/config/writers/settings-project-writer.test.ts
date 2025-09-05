// pattern: Functional Core

import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeSettingsProjectToFile } from "./settings-project-writer.js";

import type { SettingsProject } from "../types/index.js";

describe("settings-project-writer", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mcpadre-writer-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const testConfig: SettingsProject = {
    version: 1,
    mcpServers: {
      "test-server": {
        http: {
          url: "http://example.com",
          headers: {},
        },
      },
    },
    hosts: {
      cursor: true,
      zed: false,
    },
  };

  describe("JSON format", () => {
    it("should write JSON config with proper formatting", async () => {
      const configPath = join(tempDir, "mcpadre.json");

      await writeSettingsProjectToFile(configPath, testConfig);

      const content = await readFile(configPath, "utf8");
      const parsed = JSON.parse(content);

      expect(parsed).toEqual(testConfig);
      expect(content).toMatch(/^\{[\s\S]*\}\n$/); // Should be properly formatted JSON with newline
      expect(content).toContain("  "); // Should have 2-space indentation
      expect(content.endsWith("\n")).toBe(true); // Should end with newline
    });
  });

  describe("YAML format", () => {
    it("should write YAML config", async () => {
      const configPath = join(tempDir, "mcpadre.yaml");

      await writeSettingsProjectToFile(configPath, testConfig);

      const content = await readFile(configPath, "utf8");

      expect(content).toContain("version: 1");
      expect(content).toContain("mcpServers:");
      expect(content).toContain("test-server:");
      expect(content).toContain("hosts:");
      expect(content).toContain("cursor: true");
      expect(content).toContain("zed: false");
    });

    it("should handle .yml extension", async () => {
      const configPath = join(tempDir, "mcpadre.yml");

      await writeSettingsProjectToFile(configPath, testConfig);

      const content = await readFile(configPath, "utf8");
      expect(content).toContain("version: 1");
    });
  });

  describe("TOML format", () => {
    it("should write TOML config", async () => {
      const configPath = join(tempDir, "mcpadre.toml");

      await writeSettingsProjectToFile(configPath, testConfig);

      const content = await readFile(configPath, "utf8");

      expect(content).toContain("version = 1");
      expect(content).toContain("[mcpServers.test-server.http]");
      expect(content).toContain('url = "http://example.com"');
      expect(content).toContain("[hosts]");
      expect(content).toContain("cursor = true");
      expect(content).toContain("zed = false");
    });
  });

  describe("error cases", () => {
    it("should throw error for unsupported file extension", async () => {
      const configPath = join(tempDir, "mcpadre.txt");

      await expect(
        writeSettingsProjectToFile(configPath, testConfig)
      ).rejects.toThrow("Unsupported file format: .txt");
    });

    it("should throw error for no file extension", async () => {
      const configPath = join(tempDir, "mcpadre");

      await expect(
        writeSettingsProjectToFile(configPath, testConfig)
      ).rejects.toThrow("Unsupported file format:");
    });
  });

  describe("minimal config", () => {
    const minimalConfig: SettingsProject = {
      version: 1,
      mcpServers: {},
    };

    it("should handle minimal JSON config", async () => {
      const configPath = join(tempDir, "minimal.json");

      await writeSettingsProjectToFile(configPath, minimalConfig);

      const content = await readFile(configPath, "utf8");
      const parsed = JSON.parse(content);

      expect(parsed).toEqual(minimalConfig);
    });

    it("should handle minimal YAML config", async () => {
      const configPath = join(tempDir, "minimal.yaml");

      await writeSettingsProjectToFile(configPath, minimalConfig);

      const content = await readFile(configPath, "utf8");
      expect(content).toContain("version: 1");
      expect(content).toContain("mcpServers: {}");
    });

    it("should handle minimal TOML config", async () => {
      const configPath = join(tempDir, "minimal.toml");

      await writeSettingsProjectToFile(configPath, minimalConfig);

      const content = await readFile(configPath, "utf8");
      expect(content).toContain("version = 1");
      expect(content).toMatch(/mcpServers.*=/); // Either inline or section format
    });
  });
});
