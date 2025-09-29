// pattern: Imperative Shell

import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml, stringify as yamlStringify } from "yaml";

import { withProcess } from "./helpers/spawn-cli-v2.js";

import type {
  EnvStringTemplate,
  SettingsProject,
  SettingsUser,
} from "../config/types/index.js";

describe("Config Isolation Integration Tests", () => {
  let tempDir: string;
  let projectConfigPath: string;
  let userConfigPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mcpadre-config-isolation-"));
    projectConfigPath = join(tempDir, "mcpadre.yaml");
    userConfigPath = join(tempDir, ".mcpadre", "mcpadre.yaml");

    // Ensure .mcpadre directory exists
    await mkdir(join(tempDir, ".mcpadre"), { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Server operations maintain data isolation", () => {
    it(
      "should prevent user servers from leaking into project config when adding servers",
      withProcess(async spawn => {
        // Setup: Create initial user config with user-specific servers
        const initialUserConfig: SettingsUser = {
          version: 1,
          env: {
            USER_VAR: "user-value" as EnvStringTemplate,
          },
          mcpServers: {
            "user-server-1": {
              node: {
                package: "user-package-1",
                version: "1.0.0",
              },
            },
          },
          hosts: {
            "claude-code": true,
          },
        };

        // Setup: Create initial project config with project-specific servers
        const initialProjectConfig: SettingsProject = {
          version: 1,
          env: {
            PROJECT_VAR: "project-value" as EnvStringTemplate,
          },
          mcpServers: {
            "project-server-1": {
              node: {
                package: "project-package-1",
                version: "2.0.0",
              },
            },
          },
          hosts: {
            cursor: true,
          },
        };

        // Write initial configs to disk
        await writeFile(userConfigPath, yamlStringify(initialUserConfig));
        await writeFile(projectConfigPath, yamlStringify(initialProjectConfig));

        // Create a ServerSpec file with a new server to add
        const serverSpecPath = join(tempDir, "new-servers.yaml");
        const serverSpec = {
          mcpServers: {
            "new-project-server": {
              node: {
                package: "new-package",
                version: "3.0.0",
              },
            },
          },
        };
        await writeFile(serverSpecPath, yamlStringify(serverSpec));

        // Action: Add server to project config
        const result = await spawn(
          ["server", "add", serverSpecPath, "--all", "--yes"],
          {
            cwd: tempDir,
            buffer: true,
            env: { MCPADRE_USER_DIR: join(tempDir, ".mcpadre") },
          }
        );

        expect(result.exitCode).toBe(0);

        // Verification: Read both config files from disk
        const projectConfigContent = await readFile(projectConfigPath, "utf8");
        const userConfigContent = await readFile(userConfigPath, "utf8");

        const writtenProjectConfig = parseYaml(
          projectConfigContent
        ) as SettingsProject;
        const writtenUserConfig = parseYaml(userConfigContent) as SettingsUser;

        // Assert: Project config contains ONLY project data + new server
        expect(writtenProjectConfig).toEqual({
          version: 1,
          env: {
            PROJECT_VAR: "project-value", // Original project env
          },
          mcpServers: {
            "project-server-1": {
              node: {
                package: "project-package-1",
                version: "2.0.0",
              },
            },
            "new-project-server": {
              // Newly added server
              node: {
                package: "new-package",
                version: "3.0.0",
              },
            },
          },
          hosts: {
            cursor: true, // Original project host
          },
        });

        // Assert: User config remains unchanged and contains ONLY user data
        expect(writtenUserConfig).toEqual({
          version: 1,
          env: {
            USER_VAR: "user-value", // Original user env
          },
          mcpServers: {
            "user-server-1": {
              // Original user server unchanged
              node: {
                package: "user-package-1",
                version: "1.0.0",
              },
            },
          },
          hosts: {
            "claude-code": true, // Original user host
          },
        });

        // Assert: No merge metadata in either config
        expect(writtenProjectConfig).not.toHaveProperty("hasUserConfig");
        expect(writtenProjectConfig).not.toHaveProperty("userConfig");
        expect(writtenUserConfig).not.toHaveProperty("hasUserConfig");
        expect(writtenUserConfig).not.toHaveProperty("userConfig");

        // Assert: No cross-contamination
        expect(writtenProjectConfig.mcpServers).not.toHaveProperty(
          "user-server-1"
        );
        expect(writtenProjectConfig.env).not.toHaveProperty("USER_VAR");
        expect(writtenProjectConfig.hosts).not.toHaveProperty("claude-code");

        expect(writtenUserConfig.mcpServers).not.toHaveProperty(
          "project-server-1"
        );
        expect(writtenUserConfig.mcpServers).not.toHaveProperty(
          "new-project-server"
        );
        expect(writtenUserConfig.env).not.toHaveProperty("PROJECT_VAR");
        expect(writtenUserConfig.hosts).not.toHaveProperty("cursor");
      })
    );

    it(
      "should prevent project servers from leaking into user config when adding servers in user mode",
      withProcess(async spawn => {
        // Setup: Create initial configs with separation
        const initialUserConfig: SettingsUser = {
          version: 1,
          mcpServers: {
            "existing-user-server": {
              node: { package: "user-pkg", version: "1.0.0" },
            },
          },
          hosts: { "claude-code": true },
        };

        const initialProjectConfig: SettingsProject = {
          version: 1,
          mcpServers: {
            "existing-project-server": {
              node: { package: "project-pkg", version: "2.0.0" },
            },
          },
          hosts: { cursor: true },
        };

        await writeFile(userConfigPath, yamlStringify(initialUserConfig));
        await writeFile(projectConfigPath, yamlStringify(initialProjectConfig));

        // Create ServerSpec for new user server
        const serverSpecPath = join(tempDir, "user-servers.yaml");
        const serverSpec = {
          mcpServers: {
            "new-user-server": {
              node: { package: "new-user-pkg", version: "3.0.0" },
            },
          },
        };
        await writeFile(serverSpecPath, yamlStringify(serverSpec));

        // Action: Add server to user config using --user flag
        const result = await spawn(
          ["server", "add", serverSpecPath, "--user", "--all", "--yes"],
          {
            cwd: tempDir,
            buffer: true,
            env: { MCPADRE_USER_DIR: join(tempDir, ".mcpadre") },
          }
        );

        expect(result.exitCode).toBe(0);

        // Verification: Read configs from disk
        const projectConfigContent = await readFile(projectConfigPath, "utf8");
        const userConfigContent = await readFile(userConfigPath, "utf8");

        const writtenProjectConfig = parseYaml(
          projectConfigContent
        ) as SettingsProject;
        const writtenUserConfig = parseYaml(userConfigContent) as SettingsUser;

        // Assert: User config contains ONLY user data + new server
        expect(writtenUserConfig).toEqual({
          version: 1,
          mcpServers: {
            "existing-user-server": {
              node: { package: "user-pkg", version: "1.0.0" },
            },
            "new-user-server": {
              // Newly added server
              node: { package: "new-user-pkg", version: "3.0.0" },
            },
          },
          hosts: { "claude-code": true },
        });

        // Assert: Project config remains unchanged and contains ONLY project data
        expect(writtenProjectConfig).toEqual({
          version: 1,
          mcpServers: {
            "existing-project-server": {
              node: { package: "project-pkg", version: "2.0.0" },
            },
          },
          hosts: { cursor: true },
        });

        // Assert: No merge metadata
        expect(writtenProjectConfig).not.toHaveProperty("hasUserConfig");
        expect(writtenProjectConfig).not.toHaveProperty("userConfig");
        expect(writtenUserConfig).not.toHaveProperty("hasUserConfig");
        expect(writtenUserConfig).not.toHaveProperty("userConfig");

        // Assert: No cross-contamination
        expect(writtenUserConfig.mcpServers).not.toHaveProperty(
          "existing-project-server"
        );
        expect(writtenProjectConfig.mcpServers).not.toHaveProperty(
          "existing-user-server"
        );
        expect(writtenProjectConfig.mcpServers).not.toHaveProperty(
          "new-user-server"
        );
      })
    );
  });

  describe("Host operations maintain data isolation", () => {
    it(
      "should prevent host cross-contamination when adding hosts",
      withProcess(async spawn => {
        // Setup: Create initial configs with different hosts
        const initialUserConfig: SettingsUser = {
          version: 1,
          mcpServers: {},
          hosts: { "claude-code": true },
        };

        const initialProjectConfig: SettingsProject = {
          version: 1,
          mcpServers: {},
          hosts: { cursor: true },
        };

        await writeFile(userConfigPath, yamlStringify(initialUserConfig));
        await writeFile(projectConfigPath, yamlStringify(initialProjectConfig));

        // Action: Add host to project
        const result = await spawn(["host", "add", "zed"], {
          cwd: tempDir,
          buffer: true,
          env: { MCPADRE_USER_DIR: join(tempDir, ".mcpadre") },
        });

        expect(result.exitCode).toBe(0);

        // Verification: Read configs from disk
        const projectConfigContent = await readFile(projectConfigPath, "utf8");
        const userConfigContent = await readFile(userConfigPath, "utf8");

        const writtenProjectConfig = parseYaml(
          projectConfigContent
        ) as SettingsProject;
        const writtenUserConfig = parseYaml(userConfigContent) as SettingsUser;

        // Assert: Project config has new host + original
        expect(writtenProjectConfig.hosts).toEqual({
          cursor: true, // Original
          zed: true, // Added
        });

        // Assert: User config unchanged
        expect(writtenUserConfig.hosts).toEqual({
          "claude-code": true, // Original only
        });

        // Assert: No cross-contamination
        expect(writtenProjectConfig.hosts).not.toHaveProperty("claude-code");
        expect(writtenUserConfig.hosts).not.toHaveProperty("cursor");
        expect(writtenUserConfig.hosts).not.toHaveProperty("zed");

        // Assert: No merge metadata
        expect(writtenProjectConfig).not.toHaveProperty("hasUserConfig");
        expect(writtenProjectConfig).not.toHaveProperty("userConfig");
      })
    );
  });

  describe("Init command creates clean configs", () => {
    it(
      "should create project config without any user data contamination",
      withProcess(async spawn => {
        // Setup: Create user config first
        const existingUserConfig: SettingsUser = {
          version: 1,
          env: { USER_SECRET: "secret-value" as EnvStringTemplate },
          mcpServers: {
            "user-only-server": {
              node: { package: "user-pkg", version: "1.0.0" },
            },
          },
          hosts: { "claude-code": true },
        };

        await writeFile(userConfigPath, yamlStringify(existingUserConfig));

        // Action: Initialize project config
        const result = await spawn(["init", "--host", "cursor", "--yes"], {
          cwd: tempDir,
          buffer: true,
          env: { MCPADRE_USER_DIR: join(tempDir, ".mcpadre") },
        });

        expect(result.exitCode).toBe(0);

        // Verification: Read created project config
        const projectConfigContent = await readFile(projectConfigPath, "utf8");
        const writtenProjectConfig = parseYaml(
          projectConfigContent
        ) as SettingsProject;

        // Assert: Project config contains ONLY project data
        expect(writtenProjectConfig).toEqual({
          version: 1,
          env: {},
          mcpServers: {},
          hosts: { cursor: true },
        });

        // Assert: No user data leaked into project config
        expect(writtenProjectConfig.env).not.toHaveProperty("USER_SECRET");
        expect(writtenProjectConfig.mcpServers).not.toHaveProperty(
          "user-only-server"
        );
        expect(writtenProjectConfig.hosts).not.toHaveProperty("claude-code");

        // Assert: No merge metadata
        expect(writtenProjectConfig).not.toHaveProperty("hasUserConfig");
        expect(writtenProjectConfig).not.toHaveProperty("userConfig");
      })
    );
  });
});
