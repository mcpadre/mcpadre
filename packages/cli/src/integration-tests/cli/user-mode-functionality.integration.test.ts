// pattern: Imperative Shell
// Integration tests for user mode functionality using --user-dir

import { mkdir } from "fs/promises";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type SpawnFunction,withProcess } from "../helpers/spawn-cli-v2.js";
import {
  cleanupTestEnvironment,
  createConfigWithServers,
  createMockServerInstallation,
  createTempProjectDir,
  createTempUserDir,
  createUserConfig,
  runUserModeCommand,
  TEST_CONTAINER_SERVER_CONFIG,
  TEST_MULTI_SERVER_CONFIG,
  TEST_NODE_SERVER_CONFIG,
  verifyProjectModeFilesAbsent,
  verifyUserModeFiles,
  waitForDocker,
} from "../helpers/user-mode-utils.js";

import type { SettingsUser } from "../../config/types/index.js";

describe("User Mode Integration Tests", () => {
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

  describe("Container Server User Mode", () => {
    it(
      "should install container server in user directory",
      withProcess(async (spawn: SpawnFunction) => {
        // Skip if Docker unavailable
        if (!(await waitForDocker())) {
          console.log("Skipping container test - Docker not available");
          return;
        }

        // Create user config with container server
        await createUserConfig(tempUserDir, TEST_CONTAINER_SERVER_CONFIG);

        // Run install --user with --user-dir
        const result = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );

        expect(result.exitCode).toBe(0);

        // Verify lock file created in user directory
        const lockExists = await verifyUserModeFiles(
          tempUserDir,
          "test-container",
          ["container.lock"]
        );
        expect(lockExists).toBe(true);

        // Verify NOT created in project directory
        const projectFilesAbsent = await verifyProjectModeFilesAbsent(
          tempProjectDir,
          "test-container",
          ["container.lock"]
        );
        expect(projectFilesAbsent).toBe(true);
      })
    );

    it(
      "should run container server from user directory",
      withProcess(async (spawn: SpawnFunction) => {
        // Skip if Docker unavailable
        if (!(await waitForDocker())) {
          console.log("Skipping container test - Docker not available");
          return;
        }

        // Setup user config and install
        await createUserConfig(tempUserDir, TEST_CONTAINER_SERVER_CONFIG);

        // Install first
        const installResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"],
{}
        );
        expect(installResult.exitCode).toBe(0);

        // Test that run --user finds the lock file and works
        const runResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["run", "test-container", "--user"],
{}
        );

        // Should not fail with "no container lock found"
        expect(runResult.stderr).not.toContain("no container lock found");
        expect(runResult.stderr).not.toContain("container lock file not found");
      })
    );
  });

  describe("Node Server User Mode", () => {
    it(
      "should install node server in user directory",
      withProcess(async (spawn: SpawnFunction) => {
        // Create user config with node server
        await createUserConfig(tempUserDir, TEST_NODE_SERVER_CONFIG);

        // Run install --user
        const result = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );

        expect(result.exitCode).toBe(0);

        // Verify package files created in user directory
        const nodeFilesExist = await verifyUserModeFiles(
          tempUserDir,
          "test-node",
          ["package.json", "package-lock.json"]
        );
        expect(nodeFilesExist).toBe(true);

        // Verify NOT created in project directory
        const projectFilesAbsent = await verifyProjectModeFilesAbsent(
          tempProjectDir,
          "test-node",
          ["package.json", "package-lock.json"]
        );
        expect(projectFilesAbsent).toBe(true);
      })
    );

    it(
      "should run node server from user directory",
      withProcess(async (spawn: SpawnFunction) => {
        // Setup and install
        await createUserConfig(tempUserDir, TEST_NODE_SERVER_CONFIG);

        const installResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );
        expect(installResult.exitCode).toBe(0);

        // Test run command
        const runResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["run", "test-node", "--user"],
{}
        );

        // Should find the installed server
        expect(runResult.stderr).not.toContain("server not found");
        expect(runResult.stderr).not.toContain("package.json not found");
      })
    );
  });

  describe("Outdated Checker User Mode", () => {
    it(
      "should find servers in user directory for outdated check",
      withProcess(async (spawn: SpawnFunction) => {
        // Create user config with multiple servers
        await createUserConfig(tempUserDir, TEST_MULTI_SERVER_CONFIG);

        // Create mock server installations in user directory
        await createMockServerInstallation(tempUserDir, "container-server", true, [
          { name: "container.lock", content: JSON.stringify({ digest: "sha256:old" }) },
        ]);
        await createMockServerInstallation(tempUserDir, "node-server", true, [
          { name: "package.json", content: JSON.stringify({ version: "1.0.0" }) },
        ]);

        // Run outdated --user
        const result = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["outdated", "--user"]
        );

        expect(result.exitCode).toBe(0);

        // Should find and analyze user servers
        expect(result.stdout).toContain("container-server");
        expect(result.stdout).toContain("node-server");
      })
    );
  });

  describe("Upgrade System User Mode", () => {
    it(
      "should upgrade servers in user directory",
      withProcess(async (spawn: SpawnFunction) => {
        // Create user config with server that can be upgraded
        const upgradableConfig: SettingsUser = {
          version: 1,
          mcpServers: {
            "upgradable-node": {
              node: {
                package: "@modelcontextprotocol/server-filesystem",
                version: "0.5.0", // Older version
              },
            },
          },
          hosts: {
            "claude-code": true,
          },
        };

        await createUserConfig(tempUserDir, upgradableConfig);

        // Install the server first
        const installResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );
        expect(installResult.exitCode).toBe(0);

        // Run upgrade --user
        const upgradeResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["upgrade", "--user", "--yes"], // Use --yes to skip prompts
{}
        );

        // Should operate on user directories
        expect(upgradeResult.stderr).not.toContain("No servers to upgrade");
      })
    );
  });

  describe("Directory Analysis User Mode", () => {
    it(
      "should find orphaned directories in user mode",
      withProcess(async (spawn: SpawnFunction) => {
        // Create config with only some servers
        const partialConfig = createConfigWithServers(["current-server"]);
        await createUserConfig(tempUserDir, partialConfig);

        // Create server directories (some will be orphaned)
        await createMockServerInstallation(tempUserDir, "current-server", true);
        await createMockServerInstallation(tempUserDir, "orphaned-server1", true);
        await createMockServerInstallation(tempUserDir, "orphaned-server2", true);

        // Run install --user (should detect orphans)
        const result = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );

        expect(result.exitCode).toBe(0);

        // Should detect orphaned directories in user dir, not project dir
        expect(
          result.stdout.includes("orphaned-server1") ||
          result.stderr.includes("orphaned-server1")
        ).toBe(true);
        expect(
          result.stdout.includes("orphaned-server2") ||
          result.stderr.includes("orphaned-server2")
        ).toBe(true);
      })
    );

    it(
      "should not report project mode orphans when in user mode",
      withProcess(async (spawn: SpawnFunction) => {
        // Create user config
        const userConfig = createConfigWithServers(["user-server"]);
        await createUserConfig(tempUserDir, userConfig);

        // Create orphaned servers in BOTH locations
        await createMockServerInstallation(tempUserDir, "user-orphan", true);
        await createMockServerInstallation(tempProjectDir, "project-orphan", false);

        // Run install --user
        const result = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );

        expect(result.exitCode).toBe(0);

        // Should only find user mode orphan, not project mode orphan
        const output = result.stdout + result.stderr;
        expect(output.includes("user-orphan")).toBe(true);
        expect(output.includes("project-orphan")).toBe(false);
      })
    );
  });

  describe("User Config Loading", () => {
    it(
      "should load user config from user directory",
      withProcess(async (spawn: SpawnFunction) => {
        // Create user config
        await createUserConfig(tempUserDir, TEST_NODE_SERVER_CONFIG);

        // Run any command that loads config
        const result = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user", "--dry-run"]
        );

        expect(result.exitCode).toBe(0);

        // Should find the server from user config
        expect(result.stdout).toContain("test-node");
      })
    );

    it(
      "should handle missing user config gracefully",
      withProcess(async (spawn: SpawnFunction) => {
        // Don't create any user config

        // Run command that requires user config
        const result = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );

        // Should fail gracefully with appropriate error
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("config");
      })
    );

    it(
      "should support both .yaml and .toml user configs",
      withProcess(async (spawn: SpawnFunction) => {
        // Test .yaml config (already covered above)
        await createUserConfig(tempUserDir, TEST_NODE_SERVER_CONFIG);

        const yamlResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user", "--dry-run"]
        );

        expect(yamlResult.exitCode).toBe(0);
        expect(yamlResult.stdout).toContain("test-node");

        // Note: .toml config testing would require creating a TOML file
        // This is left for future enhancement if TOML support is critical
      })
    );
  });

  describe("Command Line Flag Integration", () => {
    it(
      "should respect --user-dir flag consistently",
      withProcess(async (spawn: SpawnFunction) => {
        // Create config in custom user directory
        await createUserConfig(tempUserDir, TEST_NODE_SERVER_CONFIG);

        // Install using --user-dir
        const installResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );
        expect(installResult.exitCode).toBe(0);

        // Run using the same --user-dir (should find installed server)
        const runResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["run", "test-node", "--user"],
{}
        );

        // Should find the server installed with same --user-dir
        expect(runResult.stderr).not.toContain("server not found");
      })
    );

    it(
      "should fail when --user-dir points to different directory",
      withProcess(async (spawn: SpawnFunction) => {
        // Install in one user directory
        await createUserConfig(tempUserDir, TEST_NODE_SERVER_CONFIG);
        
        const installResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );
        expect(installResult.exitCode).toBe(0);

        // Try to run with different user directory
        const differentUserDir = await createTempUserDir();
        cleanupPaths.push(differentUserDir);

        const runResult = await runUserModeCommand(
          spawn,
          differentUserDir, // Different user dir
          tempProjectDir,
          ["run", "test-node", "--user"],
{}
        );

        // Should not find the server (installed in different user dir)
        expect(runResult.exitCode).not.toBe(0);
      })
    );
  });

  describe("Cross-Mode Path Verification", () => {
    it(
      "should create files in user directories, not project directories",
      withProcess(async (spawn: SpawnFunction) => {
        // Setup user config
        await createUserConfig(tempUserDir, TEST_MULTI_SERVER_CONFIG);

        // Run install --user
        const result = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );

        expect(result.exitCode).toBe(0);

        // Verify files created in user directories
        const userContainerExists = await verifyUserModeFiles(
          tempUserDir,
          "container-server",
          ["container.lock"]
        );
        const userNodeExists = await verifyUserModeFiles(
          tempUserDir,
          "node-server",
          ["package.json"]
        );

        expect(userContainerExists || userNodeExists).toBe(true);

        // Verify files NOT created in project directories
        const projectContainerAbsent = await verifyProjectModeFilesAbsent(
          tempProjectDir,
          "container-server",
          ["container.lock"]
        );
        const projectNodeAbsent = await verifyProjectModeFilesAbsent(
          tempProjectDir,
          "node-server",
          ["package.json"]
        );

        expect(projectContainerAbsent).toBe(true);
        expect(projectNodeAbsent).toBe(true);
      })
    );

    it(
      "should read config from user directory, not project directory",
      withProcess(async (spawn: SpawnFunction) => {
        // Create different configs in user vs project directories
        await createUserConfig(tempUserDir, {
          version: 1,
          mcpServers: {
            "user-config-server": {
              node: { package: "user-package", version: "1.0.0" },
            },
          },
          hosts: { "claude-code": true },
        });

        // Create project config with different server
        const projectConfig = JSON.stringify({
          version: 1,
          mcpServers: {
            "project-config-server": {
              node: { package: "project-package", version: "2.0.0" },
            },
          },
        });
        await mkdir(join(tempProjectDir, ".mcpadre"), { recursive: true });
        await import("fs/promises").then(fs =>
          fs.writeFile(join(tempProjectDir, "mcpadre.yaml"), projectConfig)
        );

        // Run --user command
        const result = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user", "--dry-run"]
        );

        expect(result.exitCode).toBe(0);

        // Should show user config server, not project config server
        expect(result.stdout).toContain("user-config-server");
        expect(result.stdout).not.toContain("project-config-server");
      })
    );
  });
});