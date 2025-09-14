import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type SpawnFunction, withProcess } from "../helpers/spawn-cli-v2.js";

describe("User Install Orphaned Server Bug", () => {
  let tempDir: string;
  let userConfigDir: string;
  let userConfigPath: string;
  let fakeHomeDir: string;
  let claudeConfigPath: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "mcpadre-test-orphaned-")
    );
    userConfigDir = path.join(tempDir, ".mcpadre");
    userConfigPath = path.join(userConfigDir, "mcpadre.yaml");
    fakeHomeDir = path.join(tempDir, "fake-home");
    claudeConfigPath = path.join(fakeHomeDir, ".claude.json");

    // Create user config directory and fake home directory
    await fs.promises.mkdir(userConfigDir, { recursive: true });
    await fs.promises.mkdir(fakeHomeDir, { recursive: true });

    // Create user config with test servers (using node only for test environment)
    const userConfig = `
version: 1
mcpServers:
  test-server-1:
    node:
      package: "@modelcontextprotocol/server-memory"
      version: "0.6.0"
  test-server-2:
    node:
      package: "@modelcontextprotocol/server-filesystem"
      version: "0.6.0"
hosts:
  claude-code: true
`;
    await fs.promises.writeFile(userConfigPath, userConfig, "utf8");
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  it(
    "should not report servers as orphaned on second install run",
    withProcess(async (spawn: SpawnFunction) => {
      // First install - should succeed without issues
      const firstResult = await spawn(["install", "--user"], {
        cwd: tempDir,
        buffer: true,
        env: {
          ...process.env,
          MCPADRE_USER_DIR: userConfigDir,
          HOME: fakeHomeDir,
        },
      });

      expect(firstResult.exitCode).toBe(0);
      expect(firstResult.stderr).toContain(
        "Installed for 1 host(s): claude-code"
      );
      expect(firstResult.stderr).toContain(
        "Configured 2 server(s) across all hosts"
      );

      // Verify the Claude Code config was created with --user flag entries
      expect(fs.existsSync(claudeConfigPath)).toBe(true);
      const claudeConfig = JSON.parse(
        await fs.promises.readFile(claudeConfigPath, "utf8")
      );

      // Check that both servers are in the config with --user flag
      expect(claudeConfig.mcpServers["test-server-1"]).toBeDefined();
      expect(claudeConfig.mcpServers["test-server-1"].args).toEqual([
        "run",
        "--user",
        "test-server-1",
      ]);
      expect(claudeConfig.mcpServers["test-server-2"]).toBeDefined();
      expect(claudeConfig.mcpServers["test-server-2"].args).toEqual([
        "run",
        "--user",
        "test-server-2",
      ]);

      // Second install - should NOT report orphaned servers
      const secondResult = await spawn(["install", "--user"], {
        cwd: tempDir,
        buffer: true,
        env: {
          ...process.env,
          MCPADRE_USER_DIR: userConfigDir,
          HOME: fakeHomeDir,
        },
      });

      expect(secondResult.exitCode).toBe(0);

      // BUG: Currently this fails because servers are incorrectly detected as orphaned
      // The system extracts "--user" as the server name instead of the actual server name
      // This should NOT contain any "orphaned" warnings
      expect(secondResult.stdout).not.toContain("orphaned");
      expect(secondResult.stderr).not.toContain("orphaned");

      // Should still show the same success metrics
      expect(secondResult.stderr).toContain(
        "Installed for 1 host(s): claude-code"
      );
      expect(secondResult.stderr).toContain(
        "Configured 2 server(s) across all hosts"
      );

      // Verify servers are still in the config and not removed
      const finalClaudeConfig = JSON.parse(
        await fs.promises.readFile(claudeConfigPath, "utf8")
      );
      expect(finalClaudeConfig.mcpServers["test-server-1"]).toBeDefined();
      expect(finalClaudeConfig.mcpServers["test-server-2"]).toBeDefined();
    })
  );

  it(
    "should correctly identify actual orphaned servers when they are removed from config",
    withProcess(async (spawn: SpawnFunction) => {
      // First install with both servers
      await spawn(["install", "--user"], {
        cwd: tempDir,
        buffer: true,
        env: {
          ...process.env,
          MCPADRE_USER_DIR: userConfigDir,
          HOME: fakeHomeDir,
        },
      });

      // Remove one server from mcpadre.yaml
      const updatedConfig = `
version: 1
mcpServers:
  test-server-1:
    node:
      package: "@modelcontextprotocol/server-memory"
      version: "0.6.0"
  # test-server-2 removed
hosts:
  claude-code: true
`;
      await fs.promises.writeFile(userConfigPath, updatedConfig, "utf8");

      // Second install - should detect test-server-2 as actually orphaned
      const result = await spawn(["install", "--user"], {
        cwd: tempDir,
        buffer: true,
        env: {
          ...process.env,
          MCPADRE_USER_DIR: userConfigDir,
          HOME: fakeHomeDir,
        },
      });

      expect(result.exitCode).toBe(0);

      // Should correctly identify only test-server-2 as orphaned
      expect(result.stderr).toContain(
        "Removing orphaned mcpadre server 'test-server-2'"
      );
      expect(result.stderr).not.toContain(
        "Removing orphaned mcpadre server 'test-server-1'"
      );

      // Should show cleanup was performed
      expect(result.stderr).toContain(
        "Cleaned up 1 orphaned mcpadre server(s)"
      );

      // Verify test-server-1 is still there, test-server-2 is removed
      const finalClaudeConfig = JSON.parse(
        await fs.promises.readFile(claudeConfigPath, "utf8")
      );
      expect(finalClaudeConfig.mcpServers["test-server-1"]).toBeDefined();
      expect(finalClaudeConfig.mcpServers["test-server-2"]).toBeUndefined();
    })
  );
});
