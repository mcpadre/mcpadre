import { access, constants, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
  createTempProject,
  createTestProjectConfig,
} from "../../test-utils/project/temp-project.js";
import { type SpawnFunction, withProcess } from "../helpers/spawn-cli-v2.js";

describe("install command host priority merging (simple)", () => {
  it(
    "should use merged host configuration when both user and project configs exist",
    withProcess(async (spawn: SpawnFunction) => {
      // Create a project config with cursor disabled, zed enabled
      const projectConfig = createTestProjectConfig(
        "test-server",
        "http://localhost:3000"
      );
      projectConfig.hosts = {
        cursor: false, // Project disables cursor
        zed: true, // Project enables zed
      };

      const tempProject = await createTempProject({
        config: projectConfig,
        format: "yaml",
        prefix: "install-host-priority-simple-",
      });

      // Create separate user directory and config
      const userDir = join(tempProject.path, "user-home");
      await mkdir(userDir, { recursive: true });

      const userConfigContent = `
version: 1
mcpServers:
  user-server:
    shell:
      command: "echo"
      args: ["user-test"]
hosts:
  cursor: true  # User overrides project's false setting
  # zed not mentioned - should use project setting (true)
`;

      const userConfigPath = join(userDir, "mcpadre.yaml");
      await writeFile(userConfigPath, userConfigContent);

      // Run install command with custom user config
      const result = await spawn(["--log-level", "debug", "install"], {
        cwd: tempProject.path,
        env: {
          MCPADRE_USER_DIR: userDir,
        },
        buffer: true,
      });

      expect(result.exitCode).toBe(0);

      // Verify that both cursor and zed host configuration files were created
      // (cursor from user override, zed from project)
      const cursorConfigPath = join(tempProject.path, ".cursor", "mcp.json");
      const zedConfigPath = join(tempProject.path, ".zed", "settings.json");

      await access(cursorConfigPath, constants.F_OK);
      await access(zedConfigPath, constants.F_OK);
    })
  );

  it(
    "should respect user false overriding project true",
    withProcess(async (spawn: SpawnFunction) => {
      // Create a project config with both cursor and zed enabled
      const projectConfig = createTestProjectConfig(
        "test-server",
        "http://localhost:3000"
      );
      projectConfig.hosts = {
        cursor: true, // Project enables cursor
        zed: true, // Project enables zed
      };

      const tempProject = await createTempProject({
        config: projectConfig,
        format: "yaml",
        prefix: "install-host-priority-false-",
      });

      // Create separate user directory and config that disables cursor
      const userDir = join(tempProject.path, "user-home");
      await mkdir(userDir, { recursive: true });

      const userConfigContent = `
version: 1
mcpServers:
  user-server:
    shell:
      command: "echo"
      args: ["user-test"]
hosts:
  cursor: false  # User overrides project's true setting
  # zed not mentioned - should use project setting (true)
`;

      const userConfigPath = join(userDir, "mcpadre.yaml");
      await writeFile(userConfigPath, userConfigContent);

      // Run install command with custom user config
      const result = await spawn(["--log-level", "debug", "install"], {
        cwd: tempProject.path,
        env: {
          MCPADRE_USER_DIR: userDir,
        },
        buffer: true,
      });

      expect(result.exitCode).toBe(0);

      // Verify that only zed host configuration file was created (cursor disabled by user override)
      const cursorConfigPath = join(tempProject.path, ".cursor", "mcp.json");
      const zedConfigPath = join(tempProject.path, ".zed", "settings.json");

      // Zed should be installed
      await access(zedConfigPath, constants.F_OK);

      // Cursor should NOT be installed (user disabled it)
      try {
        await access(cursorConfigPath, constants.F_OK);
        // If we reach here, the file exists when it shouldn't
        expect.fail(
          "Cursor config file should not exist when disabled by user"
        );
      } catch {
        // Expected - cursor config should not exist
      }
    })
  );
});
