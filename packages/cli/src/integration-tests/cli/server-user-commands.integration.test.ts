import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type SpawnFunction, withProcess } from "../helpers/spawn-cli-v2.js";

describe("Server User Commands Integration", () => {
  let tempDir: string;
  let userConfigDir: string;
  let userConfigPath: string;
  let serverSpecPath: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "mcpadre-test-")
    );
    userConfigDir = path.join(tempDir, ".mcpadre");
    userConfigPath = path.join(userConfigDir, "mcpadre.yaml");
    serverSpecPath = path.join(tempDir, "servers.json");

    // Create user config directory
    await fs.promises.mkdir(userConfigDir, { recursive: true });

    // Create initial user config with one server
    const initialUserConfig = `
version: 1
mcpServers:
  user-echo:
    node:
      package: "@test/user-echo-server"
      version: "1.0.0"
`;
    await fs.promises.writeFile(userConfigPath, initialUserConfig, "utf8");

    // Create ServerSpec file with multiple servers
    const serverSpec = {
      version: 1,
      mcpServers: {
        filesystem: {
          node: {
            package: "@test/filesystem-server",
            version: "2.0.0",
          },
        },
        database: {
          python: {
            package: "db-server",
            version: "1.5.0",
          },
        },
        api: {
          node: {
            package: "@test/api-server",
            version: "3.0.0",
          },
        },
      },
    };
    await fs.promises.writeFile(
      serverSpecPath,
      JSON.stringify(serverSpec, null, 2),
      "utf8"
    );
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("server remove --user", () => {
    it(
      "should remove an existing server from user config with --yes flag",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(
          ["server", "remove", "user-echo", "--user", "--yes"],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).toBe(0);

        // Verify server was removed from user config
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).not.toContain("user-echo:");
      })
    );

    it(
      "should fail when trying to remove non-existent server from user config",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(
          ["server", "remove", "nonexistent", "--user", "--yes"],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("Server 'nonexistent' not found");
      })
    );

    it(
      "should require --yes flag in non-interactive mode",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(
          ["server", "remove", "user-echo", "--user"],
          {
            cwd: tempDir,
            buffer: true,
            env: {
              ...process.env,
              CI: "true", // Force non-interactive
              MCPADRE_USER_DIR: userConfigDir,
            },
          }
        );

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(
          "Non-interactive mode requires --yes flag"
        );
      })
    );

    it(
      "should fail when user config directory doesn't exist",
      withProcess(async (spawn: SpawnFunction) => {
        // Remove user config directory
        await fs.promises.rm(userConfigDir, { recursive: true, force: true });

        const result = await spawn(
          ["server", "remove", "nonexistent", "--user", "--yes"],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(
          "User configuration directory does not exist"
        );
      })
    );
  });

  describe("server add --user", () => {
    it(
      "should add single server to user config with --server-name flag",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(
          [
            "server",
            "add",
            serverSpecPath,
            "--server-name",
            "filesystem",
            "--user",
            "--yes",
          ],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).toBe(0);

        // Verify server was added to user config
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).toContain("filesystem:");
      })
    );

    it(
      "should add all servers to user config with --all flag",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(
          ["server", "add", serverSpecPath, "--all", "--user", "--yes"],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).toBe(0);

        // Verify all servers were added to user config
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).toContain("filesystem:");
        expect(configContent).toContain("database:");
        expect(configContent).toContain("api:");
        // Original server should still be there
        expect(configContent).toContain("user-echo:");
      })
    );

    it(
      "should auto-select single server from ServerSpec for user config",
      withProcess(async (spawn: SpawnFunction) => {
        // Create ServerSpec with only one server
        const singleServerSpec = {
          version: 1,
          mcpServers: {
            single: {
              node: {
                package: "@test/single-server",
                version: "1.0.0",
              },
            },
          },
        };
        const singleSpecPath = path.join(tempDir, "single.json");
        await fs.promises.writeFile(
          singleSpecPath,
          JSON.stringify(singleServerSpec, null, 2)
        );

        const result = await spawn(
          ["server", "add", singleSpecPath, "--user", "--yes"],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).toBe(0);

        // Verify server was added to user config
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).toContain("single:");
      })
    );

    it(
      "should fail when user config directory doesn't exist",
      withProcess(async (spawn: SpawnFunction) => {
        // Remove user config directory
        await fs.promises.rm(userConfigDir, { recursive: true, force: true });

        const result = await spawn(
          [
            "server",
            "add",
            serverSpecPath,
            "--server-name",
            "filesystem",
            "--user",
            "--yes",
          ],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(
          "User configuration directory does not exist"
        );
      })
    );

    it(
      "should preserve existing user config format and structure",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(
          [
            "server",
            "add",
            serverSpecPath,
            "--server-name",
            "filesystem",
            "--user",
            "--yes",
          ],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Successfully added 1 server(s)");

        // Verify user config structure is preserved
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).toContain("version: 1");
        expect(configContent).toContain("mcpServers:");
        expect(configContent).toContain("user-echo:");
        expect(configContent).toContain("filesystem:");
      })
    );

    it(
      "should handle existing server name conflicts in user config",
      withProcess(async (spawn: SpawnFunction) => {
        // Try to add a server with same name as existing one
        const conflictSpec = {
          version: 1,
          mcpServers: {
            "user-echo": {
              // Same name as existing user server
              python: {
                package: "different-user-echo-server",
                version: "2.0.0",
              },
            },
          },
        };
        const conflictSpecPath = path.join(tempDir, "conflict.json");
        await fs.promises.writeFile(
          conflictSpecPath,
          JSON.stringify(conflictSpec, null, 2)
        );

        const result = await spawn(
          ["server", "add", conflictSpecPath, "--user", "--yes"],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Successfully added 1 server(s)");

        // Should overwrite existing user server
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).toContain("user-echo:");
        expect(configContent).toContain("python");
        expect(configContent).not.toContain("node");
      })
    );

    it(
      "should require selection method in non-interactive mode for multiple servers",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(
          ["server", "add", serverSpecPath, "--user"],
          {
            cwd: tempDir,
            buffer: true,
            env: {
              ...process.env,
              CI: "true", // Force non-interactive
              MCPADRE_USER_DIR: userConfigDir,
            },
          }
        );

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(
          "Multiple servers available but no selection method specified"
        );
      })
    );

    it(
      "should handle YAML ServerSpec files for user config",
      withProcess(async (spawn: SpawnFunction) => {
        const yamlSpecPath = path.join(tempDir, "servers.yaml");
        const yamlContent = `
version: 1
mcpServers:
  yaml-server:
    python:
      package: yaml-test-server
      version: 2.5.0
`;
        await fs.promises.writeFile(yamlSpecPath, yamlContent, "utf8");

        const result = await spawn(
          ["server", "add", yamlSpecPath, "--user", "--yes"],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Auto-selected server: yaml-server");

        // Verify server was added to user config
        const configContent = await fs.promises.readFile(
          userConfigPath,
          "utf8"
        );
        expect(configContent).toContain("yaml-server:");
      })
    );

    it(
      "should fail when requesting non-existent server for user config",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(
          [
            "server",
            "add",
            serverSpecPath,
            "--server-name",
            "nonexistent",
            "--user",
            "--yes",
          ],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(
          "Server 'nonexistent' not found in ServerSpec"
        );
      })
    );
  });

  describe("server commands isolation", () => {
    it(
      "should not affect project config when using --user flag",
      withProcess(async (spawn: SpawnFunction) => {
        // Create project config
        const projectConfigPath = path.join(tempDir, "mcpadre.yaml");
        const projectConfig = `
version: 1
mcpServers:
  project-server:
    node:
      package: "@test/project-server"
      version: "1.0.0"
`;
        await fs.promises.writeFile(projectConfigPath, projectConfig, "utf8");

        // Add server to user config
        const result = await spawn(
          [
            "server",
            "add",
            serverSpecPath,
            "--server-name",
            "filesystem",
            "--user",
            "--yes",
          ],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).toBe(0);

        // Verify project config is unchanged
        const projectContent = await fs.promises.readFile(
          projectConfigPath,
          "utf8"
        );
        expect(projectContent).toContain("project-server:");
        expect(projectContent).not.toContain("filesystem:");

        // Verify user config was updated
        const userContent = await fs.promises.readFile(userConfigPath, "utf8");
        expect(userContent).toContain("filesystem:");
      })
    );

    it(
      "should not affect user config when using project mode",
      withProcess(async (spawn: SpawnFunction) => {
        // Create project config
        const projectConfigPath = path.join(tempDir, "mcpadre.yaml");
        const projectConfig = `
version: 1
mcpServers:
  project-server:
    node:
      package: "@test/project-server"
      version: "1.0.0"
`;
        await fs.promises.writeFile(projectConfigPath, projectConfig, "utf8");

        // Add server to project config (without --user flag)
        const result = await spawn(
          [
            "server",
            "add",
            serverSpecPath,
            "--server-name",
            "filesystem",
            "--yes",
          ],
          {
            cwd: tempDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userConfigDir },
          }
        );

        expect(result.exitCode).toBe(0);

        // Verify user config is unchanged
        const userContent = await fs.promises.readFile(userConfigPath, "utf8");
        expect(userContent).toContain("user-echo:");
        expect(userContent).not.toContain("filesystem:");

        // Verify project config was updated
        const projectContent = await fs.promises.readFile(
          projectConfigPath,
          "utf8"
        );
        expect(projectContent).toContain("project-server:");
        expect(projectContent).toContain("filesystem:");
      })
    );
  });
});
