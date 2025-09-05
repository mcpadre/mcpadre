import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
  createTempProject,
  createTestProjectConfig,
} from "../../test-utils/project/temp-project.js";
import { type SpawnFunction, withProcess } from "../helpers/spawn-cli-v2.js";

describe("upgrade --user command", () => {
  it(
    "should handle upgrade command for user servers",
    withProcess(async (spawn: SpawnFunction) => {
      // Create a project config (should not be affected by user upgrade)
      const projectConfig = createTestProjectConfig(
        "project-server",
        "http://localhost:3000"
      );

      const tempProject = await createTempProject({
        config: projectConfig,
        format: "yaml",
        prefix: "upgrade-user-",
      });

      // Create separate user directory and config with shell servers (no package installation required)
      const userDir = join(tempProject.path, "user-home");
      await mkdir(userDir, { recursive: true });

      const userConfigContent = `
version: 1
mcpServers:
  user-shell-server:
    shell:
      command: "echo"
      args: ["hello", "user"]
hosts:
  claude-code: true

`;

      const userConfigPath = join(userDir, "mcpadre.yaml");
      await writeFile(userConfigPath, userConfigContent);

      // Run upgrade command in user mode (should handle shell servers gracefully)
      const upgradeResult = await spawn(
        ["upgrade", "--user", "--all", "--yes"],
        {
          cwd: tempProject.path,
          env: {
            MCPADRE_USER_DIR: userDir,
          },
          buffer: true,
        }
      );

      expect(upgradeResult.exitCode).toBe(0);

      // The logs are in stderr as JSON, so check there
      const stderr =
        typeof upgradeResult.stderr === "string" ? upgradeResult.stderr : "";
      expect(stderr).toContain("Upgrading user servers");
      expect(stderr).toContain("No servers need upgrading");
      expect(stderr).toContain("Upgrade completed successfully");
    })
  );

  it(
    "should handle missing user config gracefully",
    withProcess(async (spawn: SpawnFunction) => {
      const tempProject = await createTempProject({
        config: createTestProjectConfig("test-server", "http://localhost:3000"),
        format: "yaml",
        prefix: "upgrade-user-missing-",
      });

      // Create user directory but no config file
      const userDir = join(tempProject.path, "user-home");
      await mkdir(userDir, { recursive: true });

      const result = await spawn(["upgrade", "--user", "--all", "--yes"], {
        cwd: tempProject.path,
        env: {
          MCPADRE_USER_DIR: userDir,
        },
        buffer: true,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        "No mcpadre user configuration file found"
      );
    })
  );

  it(
    "should upgrade specific user server by name",
    withProcess(async (spawn: SpawnFunction) => {
      const tempProject = await createTempProject({
        config: createTestProjectConfig("test-server", "http://localhost:3000"),
        format: "yaml",
        prefix: "upgrade-user-specific-",
      });

      // Create user directory and config with multiple servers
      const userDir = join(tempProject.path, "user-home");
      await mkdir(userDir, { recursive: true });

      const userConfigContent = `
version: 1
mcpServers:
  user-server-1:
    shell:
      command: "echo"
      args: ["server", "1"]
  user-server-2:
    shell:
      command: "echo"
      args: ["server", "2"]
hosts:
  claude-code: true

`;

      const userConfigPath = join(userDir, "mcpadre.yaml");
      await writeFile(userConfigPath, userConfigContent);

      // Upgrade only specific server (shell servers won't need actual upgrading)
      const upgradeSpecificResult = await spawn(
        ["upgrade", "--user", "user-server-1", "--yes"],
        {
          cwd: tempProject.path,
          env: {
            MCPADRE_USER_DIR: userDir,
          },
          buffer: true,
        }
      );

      expect(upgradeSpecificResult.exitCode).toBe(0);

      // The logs are in stderr as JSON
      const stderr =
        typeof upgradeSpecificResult.stderr === "string"
          ? upgradeSpecificResult.stderr
          : "";
      expect(stderr).toContain("Upgrading user servers");
    })
  );
});
