// pattern: Imperative Shell

import { access, constants, readFile } from "fs/promises";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import { withProcess } from "../helpers/spawn-cli-v2.js";

import type {
  CommandStringTemplate,
  EnvStringTemplate,
} from "../../config/types/index.js";
import type { TempProject } from "../../test-utils/project/temp-project.js";

describe("Python server install integration", () => {
  let tempProject: TempProject;

  beforeEach(async () => {
    // Create test project with Python server configuration
    const config = {
      version: 1 as const,
      mcpServers: {
        "pypi-server": {
          python: {
            package: "mcp-pypi",
            version: "2.6.7",
            pythonVersion: "3.11.11",
            command: "mcp-pypi" as CommandStringTemplate,
          },
          env: {
            API_KEY: "test-key" as EnvStringTemplate,
          },
        },
      },
      hosts: {
        "claude-code": true,
      },
      installImplicitlyUpgradesChangedPackages: false,
    };

    tempProject = await createTempProject({
      config,
      format: "yaml",
      prefix: "python-install-integration-",
    });
  });

  afterEach(async () => {
    await tempProject.cleanup();
  });

  it(
    "should install Python server with new pyproject.toml",
    withProcess(async spawn => {
      const proc = spawn(["install"], {
        cwd: tempProject.path,
      });

      const result = await proc;

      // Debug output to understand why test is failing
      if (result.exitCode !== 0) {
        console.log("FAILED COMMAND STDERR:", result.stderr);
        console.log("Exit code:", result.exitCode);
      }

      expect(result.exitCode).toBe(0);

      // Check that server directory was created
      const serverDir = join(
        tempProject.path,
        ".mcpadre",
        "servers",
        "pypi-server"
      );
      await access(serverDir, constants.F_OK);

      // Check .python-version file
      const pythonVersionPath = join(serverDir, ".python-version");
      await access(pythonVersionPath, constants.F_OK);
      const pythonVersionContent = await readFile(pythonVersionPath, "utf8");
      expect(pythonVersionContent.trim()).toBe("3.11.11");

      // Check pyproject.toml file
      const pyprojectPath = join(serverDir, "pyproject.toml");
      await access(pyprojectPath, constants.F_OK);
      const pyprojectContent = await readFile(pyprojectPath, "utf8");

      expect(pyprojectContent).toContain('name = "mcpadre-deps-pypi-server"');
      expect(pyprojectContent).toContain('requires-python = "==3.11.11"');
      expect(pyprojectContent).toContain('"mcp-pypi==2.6.7"');

      // Check that .mcp.json was created with correct server reference
      const claudeConfigPath = join(tempProject.path, ".mcp.json");
      await access(claudeConfigPath, constants.F_OK);
      const claudeConfigContent = await readFile(claudeConfigPath, "utf-8");
      const claudeConfig = JSON.parse(claudeConfigContent);

      expect(claudeConfig.mcpServers["pypi-server"]).toEqual({
        command: "mcpadre",
        args: ["run", "pypi-server"],
      });
    })
  );

  it(
    "should sync environment when no version changes detected",
    withProcess(async spawn => {
      // First install to create initial state
      const installProc = spawn(["install"], {
        cwd: tempProject.path,
      });
      const installResult = await installProc;
      expect(installResult.exitCode).toBe(0);

      // Run install again - should sync without changes
      const syncProc = spawn(["install"], {
        cwd: tempProject.path,
      });
      const syncResult = await syncProc;
      expect(syncResult.exitCode).toBe(0);

      // Verify the environment was actually synchronized by checking pyproject.toml
      const serverDir = join(
        tempProject.path,
        ".mcpadre",
        "servers",
        "pypi-server"
      );
      const pyprojectPath = join(serverDir, "pyproject.toml");
      const pyprojectContent = await readFile(pyprojectPath, "utf8");

      // Verify sync maintained the correct package configuration
      expect(pyprojectContent).toContain("mcp-pypi==2.6.7");

      // Check .python-version file was maintained
      const pythonVersionPath = join(serverDir, ".python-version");
      const pythonVersionContent = await readFile(pythonVersionPath, "utf8");
      expect(pythonVersionContent.trim()).toBe("3.11.11");
    })
  );

  it(
    "should refuse upgrade when version changes without force or installImplicitlyUpgradesChangedPackages",
    withProcess(async spawn => {
      // Create project with different version configuration
      const configWithOldVersion = {
        version: 1 as const,
        mcpServers: {
          "pypi-server": {
            python: {
              package: "mcp-pypi",
              version: "2.6.5",
              pythonVersion: "3.11.11",
              command: "mcp-pypi" as CommandStringTemplate,
            },
          },
        },
        hosts: {
          "claude-code": true,
        },
        installImplicitlyUpgradesChangedPackages: false,
      };

      // Create project with old version first
      const oldProject = await createTempProject({
        config: configWithOldVersion,
        format: "yaml",
        prefix: "python-upgrade-test-",
      });

      try {
        // Install with old version
        const installProc = spawn(["install"], {
          cwd: oldProject.path,
        });
        const installResult = await installProc;
        expect(installResult.exitCode).toBe(0);

        // Update config to new version
        const newConfig = {
          ...configWithOldVersion,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.7",
                pythonVersion: "3.11.11",
                command: "mcp-pypi" as CommandStringTemplate,
              },
            },
          },
        };

        await oldProject.updateConfig(newConfig);

        // Try to install with new version - should refuse
        const upgradeProc = spawn(["install"], {
          cwd: oldProject.path,
        });
        const upgradeResult = await upgradeProc;
        expect(upgradeResult.exitCode).toBe(0); // Should succeed but not upgrade

        const stderr = upgradeResult.stderr ?? "";
        expect(stderr).toContain(
          "Package/Python version changed but installImplicitlyUpgradesChangedPackages=false"
        );
        expect(stderr).toContain(
          "Package version: mcp-pypi==2.6.5 → mcp-pypi==2.6.7"
        );

        // Verify old versions are still in pyproject.toml
        const serverDir = join(
          oldProject.path,
          ".mcpadre",
          "servers",
          "pypi-server"
        );
        const pyprojectContent = await readFile(
          join(serverDir, "pyproject.toml"),
          "utf8"
        );
        expect(pyprojectContent).toContain('requires-python = "==3.11.11"');
        expect(pyprojectContent).toContain('"mcp-pypi==2.6.5"');
      } finally {
        await oldProject.cleanup();
      }
    })
  );

  it(
    "should upgrade when version changes with --force flag",
    withProcess(async spawn => {
      // Install with initial version
      const installProc = spawn(["install"], {
        cwd: tempProject.path,
      });
      const installResult = await installProc;
      expect(installResult.exitCode).toBe(0);

      // Update config to older version to test upgrade
      const configWithOldVersion = {
        version: 1 as const,
        mcpServers: {
          "pypi-server": {
            python: {
              package: "mcp-pypi",
              version: "2.6.5",
              pythonVersion: "3.11.11",
              command: "mcp-pypi" as CommandStringTemplate,
            },
          },
        },
        hosts: {
          "claude-code": true,
        },
        installImplicitlyUpgradesChangedPackages: false,
      };

      await tempProject.updateConfig(configWithOldVersion);

      // Run install with --force flag
      const forceProc = spawn(["install", "--force"], {
        cwd: tempProject.path,
      });
      const forceResult = await forceProc;
      expect(forceResult.exitCode).toBe(0);

      const stderr = forceResult.stderr ?? "";
      expect(stderr).toContain(
        "Upgrading Python project due to version changes"
      );
      expect(stderr).toContain("Package version:");

      // Verify new versions are in pyproject.toml
      const serverDir = join(
        tempProject.path,
        ".mcpadre",
        "servers",
        "pypi-server"
      );
      const pyprojectContent = await readFile(
        join(serverDir, "pyproject.toml"),
        "utf8"
      );
      expect(pyprojectContent).toContain('requires-python = "==3.11.11"');
      expect(pyprojectContent).toContain('"mcp-pypi==2.6.5"');
    })
  );
});
