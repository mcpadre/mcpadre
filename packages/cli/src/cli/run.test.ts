// pattern: Imperative Shell

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  findProjectConfig,
  loadProjectConfig,
} from "../config/loaders/settings-project.js";
import {
  createTempProject,
  createTestProjectConfig,
} from "../test-utils/project/temp-project.js";

import type { TempProject } from "../test-utils/project/temp-project.js";

describe("mcpadre run command", () => {
  let tempProject: TempProject;

  beforeEach(async () => {
    // Create a test project with Context7 HTTP server config
    const config = createTestProjectConfig(
      "context7",
      "https://mcp.context7.com/mcp"
    );
    tempProject = await createTempProject({
      config,
      format: "yaml",
      prefix: "mcpadre-run-test-",
    });
  });

  describe("config file discovery", () => {
    it("should find mcpadre.yaml in project directory", async () => {
      const configPath = await findProjectConfig(tempProject.path);
      expect(configPath).toBe(tempProject.configPath);
    });

    it("should find config in parent directory", async () => {
      // Create subdirectory
      const subdir = await mkdtemp(join(tempProject.path, "subdir-"));

      const configPath = await findProjectConfig(subdir);
      expect(configPath).toBe(tempProject.configPath);
    });

    it("should return null when no config found", async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), "empty-"));
      const configPath = await findProjectConfig(emptyDir);
      expect(configPath).toBeNull();

      // Cleanup
      await rm(emptyDir, { recursive: true, force: true });
    });
  });

  describe("project config loading", () => {
    it("should load and validate project config", async () => {
      // Test with different working directories
      const originalCwd = process.cwd();

      try {
        process.chdir(tempProject.path);
        const config = await loadProjectConfig();

        expect(config).toMatchObject({
          mcpServers: {
            context7: {
              http: {
                url: "https://mcp.context7.com/mcp",
                headers: {},
              },
            },
          },
        });
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe("error cases", () => {
    it("should throw error for missing config file", async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), "no-config-"));
      const originalCwd = process.cwd();

      try {
        process.chdir(emptyDir);
        await expect(loadProjectConfig()).rejects.toThrow(
          "No mcpadre configuration file found"
        );
      } finally {
        process.chdir(originalCwd);
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe("multiple config formats", () => {
    it("should support JSON config format", async () => {
      const config = createTestProjectConfig(
        "test-server",
        "http://localhost:3000"
      );
      const jsonProject = await createTempProject({
        config,
        format: "json",
      });

      try {
        const foundConfig = await findProjectConfig(jsonProject.path);
        expect(foundConfig).toBe(jsonProject.configPath);
        expect(foundConfig).toMatch(/\.json$/);
      } finally {
        await jsonProject.cleanup();
      }
    });

    it("should support TOML config format", async () => {
      const config = createTestProjectConfig(
        "test-server",
        "http://localhost:3000"
      );
      const tomlProject = await createTempProject({
        config,
        format: "toml",
      });

      try {
        const foundConfig = await findProjectConfig(tomlProject.path);
        expect(foundConfig).toBe(tomlProject.configPath);
        expect(foundConfig).toMatch(/\.toml$/);
      } finally {
        await tomlProject.cleanup();
      }
    });
  });

  afterEach(async () => {
    await tempProject.cleanup();
  });
});
