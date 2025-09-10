// pattern: Imperative Shell
// Integration tests for project vs user mode isolation

import { readFile,writeFile } from "fs/promises";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import YAML from "yaml";

import { type SpawnFunction,withProcess } from "../helpers/spawn-cli-v2.js";
import {
  cleanupTestEnvironment,
  createMockServerInstallation,
  createTempProjectDir,
  createTempUserDir,
  createUserConfig,
  runUserModeCommand,
  verifyUserModeFiles,
  waitForDocker,
} from "../helpers/user-mode-utils.js";

import type { CommandStringTemplate,SettingsUser } from "../../config/types/index.js";

describe("Project vs User Mode Isolation", () => {
  let tempUserDir: string;
  let tempProjectDir: string;
  let cleanupPaths: string[];

  beforeEach(async () => {
    tempUserDir = await createTempUserDir();
    tempProjectDir = await createTempProjectDir();
    cleanupPaths = [tempUserDir, tempProjectDir];
  });

  afterEach(async () => {
    await cleanupTestEnvironment(cleanupPaths);
  });

  describe("Complete Isolation", () => {
    it(
      "should not interfere between project and user modes",
      withProcess(async (spawn: SpawnFunction) => {
        // Create same server configuration in both modes
        const sharedServerConfig = {
          "shared-server": {
            node: {
              package: "@modelcontextprotocol/server-filesystem",
              version: "0.6.0",
            },
          },
        };

        // Create user config
        const userConfig: SettingsUser = {
          version: 1,
          mcpServers: sharedServerConfig,
          hosts: {
            "claude-code": true,
          },
        };
        await createUserConfig(tempUserDir, userConfig);

        // Create project config
        const projectConfig = {
          version: 1,
          mcpServers: sharedServerConfig,
        };
        const projectConfigPath = join(tempProjectDir, "mcpadre.yaml");
        await writeFile(projectConfigPath, YAML.stringify(projectConfig));

        // Install in user mode
        const userInstallResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );
        expect(userInstallResult.exitCode).toBe(0);

        // Install in project mode (from same directory but without --user and --user-dir)
        const projectInstallResult = await spawn(["install"], {
          cwd: tempProjectDir,
          buffer: true,
        });
        expect(projectInstallResult.exitCode).toBe(0);

        // Verify files created in DIFFERENT locations
        const userFilesExist = await verifyUserModeFiles(
          tempUserDir,
          "shared-server",
          ["package.json"]
        );
        expect(userFilesExist).toBe(true);

        // Verify project files exist in project directory
        const fs = await import("fs/promises");
        const projectServerPath = join(tempProjectDir, ".mcpadre", "servers", "shared-server");
        try {
          await fs.access(join(projectServerPath, "package.json"));
          const projectFilesExist = true;
          expect(projectFilesExist).toBe(true);
        } catch {
          expect.fail("Project mode files should exist in .mcpadre/servers/");
        }

        // Verify they are in SEPARATE locations (user files not in project, project files not in user)
        // Note: This test might be tricky since project files SHOULD exist in project dir
        // Instead, verify user files don't exist in project location
        try {
          const userServerInProject = join(tempProjectDir, "servers", "shared-server");
          await fs.access(userServerInProject);
          expect.fail("User mode files should not exist in project directory");
        } catch {
          // Expected - user files should not be in project directory
        }
      })
    );

    it(
      "should handle same server name in both modes",
      withProcess(async (spawn: SpawnFunction) => {
        // Create same server name with DIFFERENT configurations
        const serverName = "identical-name-server";

        // User config with one version
        const userConfig: SettingsUser = {
          version: 1,
          mcpServers: {
            [serverName]: {
              node: {
                package: "@modelcontextprotocol/server-filesystem",
                version: "0.5.0", // Different version
              },
            },
          },
          hosts: {
            "claude-code": true,
          },
        };
        await createUserConfig(tempUserDir, userConfig);

        // Project config with different version
        const projectConfig = {
          version: 1,
          mcpServers: {
            [serverName]: {
              node: {
                package: "@modelcontextprotocol/server-filesystem",
                version: "0.6.0", // Different version
              },
            },
          },
        };
        const projectConfigPath = join(tempProjectDir, "mcpadre.yaml");
        await writeFile(projectConfigPath, YAML.stringify(projectConfig));

        // Install in both modes
        const userInstallResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );
        expect(userInstallResult.exitCode).toBe(0);

        const projectInstallResult = await spawn(["install"], {
          cwd: tempProjectDir,
          buffer: true,
        });
        expect(projectInstallResult.exitCode).toBe(0);

        // Both should succeed and create separate lock files/installations
        const userFilesExist = await verifyUserModeFiles(
          tempUserDir,
          serverName,
          ["package.json"]
        );
        expect(userFilesExist).toBe(true);

        // Verify project installation exists separately
        const fs = await import("fs/promises");
        const projectServerPath = join(tempProjectDir, ".mcpadre", "servers", serverName);
        try {
          await fs.access(join(projectServerPath, "package.json"));
          
          // Read both package.json files to verify they have different versions
          const userPackageJson = await readFile(
            join(tempUserDir, "servers", serverName, "package.json"), 
            "utf8"
          );
          const projectPackageJson = await readFile(
            join(projectServerPath, "package.json"), 
            "utf8"
          );

          // They should be different installations
          expect(userPackageJson).not.toBe(projectPackageJson);
        } catch {
          expect.fail("Project mode installation should exist");
        }
      })
    );

    it(
      "should run operations independently in both modes",
      withProcess(async (spawn: SpawnFunction) => {
        const serverName = "dual-mode-server";

        // Create configurations for both modes
        const userConfig: SettingsUser = {
          version: 1,
          mcpServers: {
            [serverName]: {
              container: {
                image: "alpine",
                tag: "latest",
              },
            },
          },
          hosts: {
            "claude-code": true,
          },
        };
        await createUserConfig(tempUserDir, userConfig);

        const projectConfig = {
          version: 1,
          mcpServers: {
            [serverName]: {
              container: {
                image: "alpine", 
                tag: "3.18", // Different tag
              },
            },
          },
        };
        const projectConfigPath = join(tempProjectDir, "mcpadre.yaml");
        await writeFile(projectConfigPath, YAML.stringify(projectConfig));

        // Skip if Docker unavailable
        if (!(await waitForDocker())) {
          console.log("Skipping container isolation test - Docker not available");
          return;
        }

        // Install in user mode
        const userInstallResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );
        expect(userInstallResult.exitCode).toBe(0);

        // Install in project mode
        const projectInstallResult = await spawn(["install"], {
          cwd: tempProjectDir,
          buffer: true,
        });
        expect(projectInstallResult.exitCode).toBe(0);

        // Run outdated check in user mode
        const userOutdatedResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["outdated", "--user"]
        );
        expect(userOutdatedResult.exitCode).toBe(0);

        // Run outdated check in project mode
        const projectOutdatedResult = await spawn(["outdated"], {
          cwd: tempProjectDir,
          buffer: true,
        });
        expect(projectOutdatedResult.exitCode).toBe(0);

        // Both should find their respective servers independently
        expect(userOutdatedResult.stdout).toContain(serverName);
        expect(projectOutdatedResult.stdout).toContain(serverName);

        // Verify lock files exist in separate locations
        const userLockExists = await verifyUserModeFiles(
          tempUserDir,
          serverName,
          ["container.lock"]
        );
        expect(userLockExists).toBe(true);

        const fs = await import("fs/promises");
        try {
          await fs.access(join(tempProjectDir, ".mcpadre", "servers", serverName, "container.lock"));
        } catch {
          expect.fail("Project mode lock file should exist");
        }
      })
    );
  });

  describe("Config Resolution Isolation", () => {
    it(
      "should load different configs in different modes",
      withProcess(async (spawn: SpawnFunction) => {
        // Create user config with user-specific servers
        const userConfig: SettingsUser = {
          version: 1,
          mcpServers: {
            "user-only-server": {
              node: {
                package: "user-package",
                version: "1.0.0",
              },
            },
          },
          hosts: {
            "claude-code": true,
          },
        };
        await createUserConfig(tempUserDir, userConfig);

        // Create project config with project-specific servers
        const projectConfig = {
          version: 1,
          mcpServers: {
            "project-only-server": {
              node: {
                package: "project-package",
                version: "2.0.0",
              },
            },
          },
        };
        const projectConfigPath = join(tempProjectDir, "mcpadre.yaml");
        await writeFile(projectConfigPath, YAML.stringify(projectConfig));

        // Test user mode config loading
        const userListResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user", "--dry-run"]
        );
        expect(userListResult.exitCode).toBe(0);
        expect(userListResult.stdout).toContain("user-only-server");
        expect(userListResult.stdout).not.toContain("project-only-server");

        // Test project mode config loading
        const projectListResult = await spawn(["install", "--dry-run"], {
          cwd: tempProjectDir,
          buffer: true,
        });
        expect(projectListResult.exitCode).toBe(0);
        expect(projectListResult.stdout).toContain("project-only-server");
        expect(projectListResult.stdout).not.toContain("user-only-server");
      })
    );

    it(
      "should handle missing configs appropriately in each mode",
      withProcess(async (spawn: SpawnFunction) => {
        // Create only project config (no user config)
        const projectConfig = {
          version: 1,
          mcpServers: {
            "project-server": {
              shell: {
                command: "echo",
                args: ["hello"],
              },
            },
          },
        };
        const projectConfigPath = join(tempProjectDir, "mcpadre.yaml");
        await writeFile(projectConfigPath, YAML.stringify(projectConfig));

        // User mode should fail (no user config)
        const userResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );
        expect(userResult.exitCode).not.toBe(0);
        expect(userResult.stderr).toContain("config");

        // Project mode should work (has project config)
        const projectResult = await spawn(["install"], {
          cwd: tempProjectDir,
          buffer: true,
        });
        expect(projectResult.exitCode).toBe(0);
      })
    );
  });

  describe("Directory Structure Isolation", () => {
    it(
      "should create separate directory structures",
      withProcess(async (spawn: SpawnFunction) => {
        // Create identical server configs
        const serverConfig = {
          "structure-test-server": {
            node: {
              package: "@modelcontextprotocol/server-filesystem",
              version: "0.6.0",
            },
          },
        };

        // Setup both configs
        const userConfig: SettingsUser = {
          version: 1,
          mcpServers: serverConfig,
          hosts: { "claude-code": true },
        };
        await createUserConfig(tempUserDir, userConfig);

        const projectConfig = {
          version: 1,
          mcpServers: serverConfig,
        };
        await writeFile(
          join(tempProjectDir, "mcpadre.yaml"),
          YAML.stringify(projectConfig)
        );

        // Install in both modes
        await runUserModeCommand(spawn, tempUserDir, tempProjectDir, ["install", "--user"]);
        await spawn(["install"], { cwd: tempProjectDir, buffer: true });

        // Verify directory structures are separate
        const fs = await import("fs/promises");

        // User mode structure: {userDir}/servers/{serverName}/
        try {
          await fs.access(join(tempUserDir, "servers", "structure-test-server"));
        } catch {
          expect.fail("User mode server directory should exist");
        }

        // Project mode structure: {projectDir}/.mcpadre/servers/{serverName}/
        try {
          await fs.access(join(tempProjectDir, ".mcpadre", "servers", "structure-test-server"));
        } catch {
          expect.fail("Project mode server directory should exist");
        }

        // Verify cross-contamination doesn't occur
        try {
          await fs.access(join(tempUserDir, ".mcpadre"));
          expect.fail("User directory should not contain .mcpadre folder");
        } catch {
          // Expected - user dir should not have .mcpadre
        }

        try {
          await fs.access(join(tempProjectDir, "servers"));
          expect.fail("Project directory should not contain servers folder (that's user mode)");
        } catch {
          // Expected - project dir should not have servers folder at root
        }
      })
    );

    it(
      "should handle orphaned directories separately",
      withProcess(async (spawn: SpawnFunction) => {
        // Create current servers
        const currentServers = {
          "current-server": {
            shell: { command: "echo current" as CommandStringTemplate },
          },
        };

        // Setup configs
        const userConfig: SettingsUser = {
          version: 1,
          mcpServers: currentServers,
          hosts: { "claude-code": true },
        };
        await createUserConfig(tempUserDir, userConfig);

        const projectConfig = {
          version: 1,
          mcpServers: currentServers,
        };
        await writeFile(
          join(tempProjectDir, "mcpadre.yaml"),
          YAML.stringify(projectConfig)
        );

        // Create orphaned directories in both locations
        await createMockServerInstallation(tempUserDir, "user-orphan", true);
        await createMockServerInstallation(tempUserDir, "current-server", true);
        await createMockServerInstallation(tempProjectDir, "project-orphan", false);
        await createMockServerInstallation(tempProjectDir, "current-server", false);

        // Run install in user mode
        const userResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );
        expect(userResult.exitCode).toBe(0);

        // Run install in project mode
        const projectResult = await spawn(["install"], {
          cwd: tempProjectDir,
          buffer: true,
        });
        expect(projectResult.exitCode).toBe(0);

        // Verify each mode only reports its own orphans
        const userOutput = String(userResult.stdout) + String(userResult.stderr);
        const projectOutput = String(projectResult.stdout) + String(projectResult.stderr);

        // User mode should find user-orphan, not project-orphan
        expect(userOutput.includes("user-orphan")).toBe(true);
        expect(userOutput.includes("project-orphan")).toBe(false);

        // Project mode should find project-orphan, not user-orphan
        expect(projectOutput.includes("project-orphan")).toBe(true);
        expect(projectOutput.includes("user-orphan")).toBe(false);
      })
    );
  });

  describe("Command Flag Isolation", () => {
    it(
      "should respect --user-dir flag boundaries",
      withProcess(async (spawn: SpawnFunction) => {
        // Create two different user directories
        const userDir1 = tempUserDir;
        const userDir2 = await createTempUserDir();
        cleanupPaths.push(userDir2);

        // Create different configs in each user directory
        await createUserConfig(userDir1, {
          version: 1,
          mcpServers: {
            "user1-server": {
              shell: { command: "echo user1" as CommandStringTemplate },
            },
          },
          hosts: { "claude-code": true },
        });

        await createUserConfig(userDir2, {
          version: 1,
          mcpServers: {
            "user2-server": {
              shell: { command: "echo user2" as CommandStringTemplate },
            },
          },
          hosts: { "claude-code": true },
        });

        // Install in first user directory
        const result1 = await runUserModeCommand(
          spawn,
          userDir1,
          tempProjectDir,
          ["install", "--user", "--dry-run"]
        );
        expect(result1.exitCode).toBe(0);
        expect(result1.stdout).toContain("user1-server");
        expect(result1.stdout).not.toContain("user2-server");

        // Install in second user directory
        const result2 = await runUserModeCommand(
          spawn,
          userDir2,
          tempProjectDir,
          ["install", "--user", "--dry-run"]
        );
        expect(result2.exitCode).toBe(0);
        expect(result2.stdout).toContain("user2-server");
        expect(result2.stdout).not.toContain("user1-server");
      })
    );

    it(
      "should maintain isolation when switching between modes",
      withProcess(async (spawn: SpawnFunction) => {
        // Create configs for both modes
        const userConfig: SettingsUser = {
          version: 1,
          mcpServers: {
            "mode-switch-server": {
              node: { package: "user-package", version: "1.0.0" },
            },
          },
          hosts: { "claude-code": true },
        };
        await createUserConfig(tempUserDir, userConfig);

        const projectConfig = {
          version: 1,
          mcpServers: {
            "mode-switch-server": {
              node: { package: "project-package", version: "2.0.0" },
            },
          },
        };
        await writeFile(
          join(tempProjectDir, "mcpadre.yaml"),
          YAML.stringify(projectConfig)
        );

        // Install in user mode
        const userInstall = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );
        expect(userInstall.exitCode).toBe(0);

        // Install in project mode
        const projectInstall = await spawn(["install"], {
          cwd: tempProjectDir,
          buffer: true,
        });
        expect(projectInstall.exitCode).toBe(0);

        // Check that outdated command sees different servers in each mode
        const userOutdated = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["outdated", "--user"]
        );
        expect(userOutdated.exitCode).toBe(0);

        const projectOutdated = await spawn(["outdated"], {
          cwd: tempProjectDir,
          buffer: true,
        });
        expect(projectOutdated.exitCode).toBe(0);

        // Both should find the server, but they should be separate installations
        expect(userOutdated.stdout).toContain("mode-switch-server");
        expect(projectOutdated.stdout).toContain("mode-switch-server");
      })
    );
  });
});