import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type SpawnFunction, withProcess } from "../helpers/spawn-cli-v2.js";

describe("Host User Commands Integration", () => {
  let tempDir: string;
  let userConfigDir: string;
  let userConfigPath: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "mcpadre-test-")
    );
    userConfigDir = path.join(tempDir, ".mcpadre");
    userConfigPath = path.join(userConfigDir, "mcpadre.yaml");

    // Create user config directory
    await fs.promises.mkdir(userConfigDir, { recursive: true });

    // Create initial user config with existing host
    const initialUserConfig = `
version: 1
mcpServers:
  test-server:
    http:
      url: "http://example.com"
hosts:
  cursor: true
`;
    await fs.promises.writeFile(userConfigPath, initialUserConfig, "utf8");
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("host add --user", () => {
    it(
      "should add user-capable host to user configuration",
      withProcess(async spawn => {
        const result = await spawn(["host", "add", "claude-code", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).toBe(0);

        // Verify host was added to user config
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).toContain("claude-code: true");
        expect(configContent).toContain("cursor: true"); // Original should remain
      })
    );

    it(
      "should add claude-desktop to user configuration",
      withProcess(async spawn => {
        const result = await spawn(
          ["host", "add", "claude-desktop", "--user"],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).toBe(0);

        // Verify host was added to user config
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).toContain("claude-desktop: true");
      })
    );

    it(
      "should add opencode to user configuration",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(["host", "add", "opencode", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).toBe(0);

        // Verify host was added to user config
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).toContain("opencode: true");
      })
    );

    it(
      "should reject project-only host zed for user configuration",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(["host", "add", "zed", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(
          "Host 'zed' cannot be added to user configuration"
        );
        expect(result.stderr).toContain(
          "Host 'zed' only supports project-level configuration"
        );
        // Test in a case-insensitive way
        const stderr = (result.stderr ?? "") as string;
        expect(stderr.toLowerCase()).toContain(
          "user-capable hosts: claude-code, claude-desktop, cursor, opencode"
        );

        // Verify host was NOT added to user config
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).not.toContain("zed: true");
      })
    );

    it(
      "should reject project-only host vscode for user configuration",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(["host", "add", "vscode", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(
          "Host 'vscode' cannot be added to user configuration"
        );
        expect(result.stderr).toContain(
          "Host 'vscode' only supports project-level configuration"
        );

        // Verify host was NOT added to user config
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).not.toContain("vscode: true");
      })
    );

    it(
      "should handle already enabled host in user configuration",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(["host", "add", "cursor", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain(
          "Host 'cursor' is already enabled in user configuration"
        );

        // Config should remain unchanged
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).toContain("cursor: true");
      })
    );

    it(
      "should handle invalid host name for user configuration",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(["host", "add", "invalid-host", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("Unsupported host: invalid-host");

        // In user mode, it should only list user-capable hosts now
        const stderr = (result.stderr ?? "") as string;
        expect(stderr).toContain(
          "Supported hosts: claude-code, claude-desktop, cursor, opencode"
        );
      })
    );

    it(
      "should suggest similar host names for typos in user mode",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(["host", "add", "cursur", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("Unsupported host: cursur");
        expect(result.stderr).toContain("Did you mean: cursor");
      })
    );

    it(
      "should fail when user config directory doesn't exist",
      withProcess(async (spawn: SpawnFunction) => {
        // Remove user config directory
        await fs.promises.rm(userConfigDir, { recursive: true, force: true });

        const result = await spawn(["host", "add", "claude-code", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(
          "User configuration directory does not exist"
        );
      })
    );
  });

  describe("host manage --user", () => {
    it(
      "should display host management message for user configuration",
      withProcess(async spawn => {
        // Note: We can't fully test interactive prompts in an automated test
        // but we can verify the command starts correctly
        const result = await spawn(["host", "manage", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: {
            ...process.env,
            MCPADRE_USER_DIR: userConfigDir,
            // Force non-interactive mode to get predictable output
            CI: "true",
          },
        });

        // In CI mode it will fail but we can see the start of the command
        expect(result.stderr).toContain("Starting interactive host management");
      })
    );

    it(
      "should fail when user config doesn't exist",
      withProcess(async (spawn: SpawnFunction) => {
        // Remove user config directory
        await fs.promises.rm(userConfigDir, { recursive: true, force: true });

        const result = await spawn(["host", "manage", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(
          "User configuration directory does not exist"
        );
      })
    );
  });

  describe("host remove --user", () => {
    it(
      "should remove host from user configuration",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(["host", "remove", "cursor", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).toBe(0);

        // Verify host was removed from user config
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).not.toContain("cursor: true");
      })
    );

    it(
      "should handle already removed host in user configuration",
      withProcess(async (spawn: SpawnFunction) => {
        // First remove the host
        await spawn(["host", "remove", "cursor", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        // Try to remove again
        const result = await spawn(["host", "remove", "cursor", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain(
          "Host 'cursor' is not enabled in user configuration (or already removed)"
        );
      })
    );

    it(
      "should reject project-only host for user configuration",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(["host", "remove", "zed", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(
          "Host 'zed' cannot be removed from user configuration"
        );
        expect(result.stderr).toContain(
          "Host 'zed' only supports project-level configuration"
        );
      })
    );

    it(
      "should handle invalid host name for user configuration",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(
          ["host", "remove", "invalid-host", "--user"],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("Unsupported host: invalid-host");
      })
    );

    it(
      "should suggest similar host names for typos in user mode",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(["host", "remove", "cursur", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("Unsupported host: cursur");
        expect(result.stderr).toContain("Did you mean: cursor");
      })
    );
  });

  describe("host commands isolation", () => {
    it(
      "should not affect project config when using --user flag",
      withProcess(async spawn => {
        // Create project config
        const projectConfigPath = path.join(tempDir, "mcpadre.yaml");
        const projectConfig = `
version: 1
mcpServers:
  project-server:
    http:
      url: "http://project.example.com"
hosts:
  zed: true
`;
        await fs.promises.writeFile(projectConfigPath, projectConfig, "utf8");

        // Add host to user config
        const result = await spawn(["host", "add", "claude-code", "--user"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).toBe(0);

        // Verify project config is unchanged
        const projectContent = await fs.promises.readFile(
          projectConfigPath,
          "utf8"
        );
        expect(projectContent).toContain("zed: true");
        expect(projectContent).not.toContain("claude-code: true");

        // Verify user config was updated
        const userContent = await fs.promises.readFile(userConfigPath, "utf8");
        expect(userContent).toContain("claude-code: true");
        expect(userContent).toContain("cursor: true"); // Original user host
        expect(userContent).not.toContain("zed: true");
      })
    );

    it(
      "should not affect user config when using project mode",
      withProcess(async spawn => {
        // Create project config
        const projectConfigPath = path.join(tempDir, "mcpadre.yaml");
        const projectConfig = `
version: 1
mcpServers:
  project-server:
    http:
      url: "http://project.example.com"
`;
        await fs.promises.writeFile(projectConfigPath, projectConfig, "utf8");

        // Add host to project config (without --user flag)
        const result = await spawn(["host", "add", "zed"], {
          cwd: tempDir,
          buffer: true,
          env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
        });

        expect(result.exitCode).toBe(0);

        // Verify user config is unchanged
        const userContent = await fs.promises.readFile(userConfigPath, "utf8");
        expect(userContent).toContain("cursor: true");
        expect(userContent).not.toContain("zed: true");

        // Verify project config was updated
        const projectContent = await fs.promises.readFile(
          projectConfigPath,
          "utf8"
        );
        expect(projectContent).toContain("zed: true");
        expect(projectContent).not.toContain("cursor: true");
      })
    );
  });
});
