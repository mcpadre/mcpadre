// pattern: Imperative Shell

import { readFile } from "fs/promises";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import { withProcess } from "../helpers/spawn-cli-v2.js";

import type {
  CommandStringTemplate,
  EnvStringTemplate,
} from "../../config/types/index.js";
import type { TempProject } from "../../test-utils/project/temp-project.js";

describe("Python server version upgrade scenarios", () => {
  let tempProject: TempProject;

  afterEach(async () => {
    await tempProject.cleanup();
  });

  describe("Version upgrade from mcp-pypi 2.6.5 to 2.6.7", () => {
    beforeEach(async () => {
      // Start with old version configuration
      const oldVersionConfig = {
        version: 1 as const,
        mcpServers: {
          "pypi-server": {
            python: {
              package: "mcp-pypi",
              version: "2.6.5",
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
        config: oldVersionConfig,
        format: "yaml",
        prefix: "python-upgrade-test-",
      });
    });

    it(
      "should upgrade successfully with --force flag",
      withProcess(async spawn => {
        // Install initial version first
        const initialInstallResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(initialInstallResult.exitCode).toBe(0);

        // Update config to new version
        const newVersionConfig = {
          version: 1 as const,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.7",
                pythonVersion: "3.13.6",
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

        await tempProject.updateConfig(newVersionConfig);

        // Run install with --force flag
        console.log("=== DEBUG: Python server upgrade test ===");
        console.log("Test environment:");
        console.log("  GITHUB_ACTIONS:", process.env["GITHUB_ACTIONS"]);
        console.log("  CI:", process.env["CI"]);
        console.log("  tempProject.path:", tempProject.path);
        console.log("  Command args:", ["install", "--force"]);

        const upgradeResult = await spawn(["install", "--force"], {
          cwd: tempProject.path,
        });

        console.log("Command result:");
        console.log("  Exit code:", upgradeResult.exitCode);
        console.log("  Stdout:", JSON.stringify(upgradeResult.stdout));
        console.log("  Stderr:", JSON.stringify(upgradeResult.stderr));
        console.log("  Stdout length:", upgradeResult.stdout?.length ?? 0);
        console.log("  Stderr length:", upgradeResult.stderr?.length ?? 0);

        expect(upgradeResult.exitCode).toBe(0);

        const stderr = upgradeResult.stderr ?? "";
        console.log("Expected vs Actual stderr content:");
        console.log(
          "  Expected to contain 'Upgrading Python project due to version changes'"
        );
        console.log(
          "  Actual stderr contains it:",
          (stderr as string).includes(
            "Upgrading Python project due to version changes"
          )
        );
        console.log(
          "  Expected to contain 'Python version: ==3.11.11 → ==3.13.6'"
        );
        console.log(
          "  Actual stderr contains it:",
          (stderr as string).includes("Python version: ==3.11.11 → ==3.13.6")
        );
        console.log(
          "  Expected to contain 'Package version: mcp-pypi==2.6.5 → mcp-pypi==2.6.7'"
        );
        console.log(
          "  Actual stderr contains it:",
          (stderr as string).includes(
            "Package version: mcp-pypi==2.6.5 → mcp-pypi==2.6.7"
          )
        );

        // Verify actual upgrade happened by checking files
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
        expect(pyprojectContent).toContain('requires-python = "==3.13.6"');
        expect(pyprojectContent).toContain('"mcp-pypi==2.6.7"');

        const pythonVersionContent = await readFile(
          join(serverDir, ".python-version"),
          "utf8"
        );
        expect(pythonVersionContent.trim()).toBe("3.13.6");

        // Verify host config was updated
        const claudeConfigContent = await readFile(
          join(tempProject.path, ".mcp.json"),
          "utf-8"
        );
        const claudeConfig = JSON.parse(claudeConfigContent);
        expect(claudeConfig.mcpServers["pypi-server"]).toEqual({
          command: "mcpadre",
          args: ["run", "pypi-server"],
        });
      })
    );

    it(
      "should upgrade successfully with installImplicitlyUpgradesChangedPackages=true",
      withProcess(async spawn => {
        // Install initial version first
        const initialInstallResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(initialInstallResult.exitCode).toBe(0);

        // Update config with both new version AND installImplicitlyUpgradesChangedPackages=true
        const newVersionConfig = {
          version: 1 as const,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.7",
                pythonVersion: "3.13.6",
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
          options: {
            installImplicitlyUpgradesChangedPackages: true,
          },
        };

        await tempProject.updateConfig(newVersionConfig);

        // Run install without --force (should upgrade due to installImplicitlyUpgradesChangedPackages)
        const upgradeResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(upgradeResult.exitCode).toBe(0);

        const stderr = upgradeResult.stderr ?? "";
        expect(stderr).toContain(
          "Upgrading Python project due to version changes"
        );
        expect(stderr).toContain("Python version: ==3.11.11 → ==3.13.6");
        expect(stderr).toContain(
          "Package version: mcp-pypi==2.6.5 → mcp-pypi==2.6.7"
        );

        // Verify new versions in files
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
        expect(pyprojectContent).toContain('requires-python = "==3.13.6"');
        expect(pyprojectContent).toContain('"mcp-pypi==2.6.7"');

        const pythonVersionContent = await readFile(
          join(serverDir, ".python-version"),
          "utf8"
        );
        expect(pythonVersionContent.trim()).toBe("3.13.6");
      })
    );

    it(
      "should refuse upgrade without force flag when installImplicitlyUpgradesChangedPackages=false",
      withProcess(async spawn => {
        // Install initial version first
        const initialInstallResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(initialInstallResult.exitCode).toBe(0);

        // Update config to new version but keep installImplicitlyUpgradesChangedPackages=false
        const newVersionConfig = {
          version: 1 as const,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.7",
                pythonVersion: "3.13.6",
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

        await tempProject.updateConfig(newVersionConfig);

        // Run install without --force (should refuse to upgrade)
        const upgradeResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(upgradeResult.exitCode).toBe(0); // Should not error, just warn

        const stderr = upgradeResult.stderr ?? "";
        expect(stderr).toContain(
          "Package/Python version changed but installImplicitlyUpgradesChangedPackages=false"
        );
        expect(stderr).toContain("Python version: ==3.11.11 → ==3.13.6");
        expect(stderr).toContain(
          "Package version: mcp-pypi==2.6.5 → mcp-pypi==2.6.7"
        );
        expect(stderr).toContain(
          "Use --force to override or set installImplicitlyUpgradesChangedPackages=true in config"
        );

        // Verify old versions remain in files
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

        const pythonVersionContent = await readFile(
          join(serverDir, ".python-version"),
          "utf8"
        );
        expect(pythonVersionContent.trim()).toBe("3.11.11");
      })
    );

    it(
      "should handle package version only changes",
      withProcess(async spawn => {
        // Install initial version first
        const initialInstallResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(initialInstallResult.exitCode).toBe(0);

        // Update only package version, keep Python version same
        const newVersionConfig = {
          version: 1 as const,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.7", // Only this changed
                pythonVersion: "3.11.11", // Same as before
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

        await tempProject.updateConfig(newVersionConfig);

        // Should detect and refuse upgrade
        const upgradeResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(upgradeResult.exitCode).toBe(0);

        const stderr = upgradeResult.stderr ?? "";
        expect(stderr).toContain(
          "Package/Python version changed but installImplicitlyUpgradesChangedPackages=false"
        );
        expect(stderr).toContain(
          "Package version: mcp-pypi==2.6.5 → mcp-pypi==2.6.7"
        );
        expect(stderr).not.toContain("Python version:"); // Should not mention Python version since it didn't change

        // Force upgrade should work
        const forceResult = await spawn(["install", "--force"], {
          cwd: tempProject.path,
        });
        expect(forceResult.exitCode).toBe(0);

        // Verify upgrade
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
        expect(pyprojectContent).toContain('"mcp-pypi==2.6.7"');
        expect(pyprojectContent).toContain('requires-python = "==3.11.11"'); // Unchanged
      })
    );

    it(
      "should handle Python version only changes",
      withProcess(async spawn => {
        // Install initial version first
        const initialInstallResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(initialInstallResult.exitCode).toBe(0);

        // Update only Python version, keep package version same
        const newVersionConfig = {
          version: 1 as const,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.5", // Same as before
                pythonVersion: "3.13.6", // Only this changed
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

        await tempProject.updateConfig(newVersionConfig);

        // Should detect and refuse upgrade
        const upgradeResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(upgradeResult.exitCode).toBe(0);

        const stderr = upgradeResult.stderr ?? "";
        expect(stderr).toContain(
          "Package/Python version changed but installImplicitlyUpgradesChangedPackages=false"
        );
        expect(stderr).toContain("Python version: ==3.11.11 → ==3.13.6");
        expect(stderr).not.toContain("Package version:"); // Should not mention package version since it didn't change

        // Force upgrade should work
        const forceResult = await spawn(["install", "--force"], {
          cwd: tempProject.path,
        });
        expect(forceResult.exitCode).toBe(0);

        const forceStderr = forceResult.stderr ?? "";
        expect(forceStderr).toContain(
          "Upgrading Python project due to version changes"
        );
        expect(forceStderr).toContain("Python version: ==3.11.11 → ==3.13.6");

        // Verify upgrade
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
        expect(pyprojectContent).toContain('"mcp-pypi==2.6.5"'); // Unchanged
        expect(pyprojectContent).toContain('requires-python = "==3.13.6"');

        const pythonVersionContent = await readFile(
          join(serverDir, ".python-version"),
          "utf8"
        );
        expect(pythonVersionContent.trim()).toBe("3.13.6");
      })
    );

    it(
      "should handle no version changes with environment sync",
      withProcess(async spawn => {
        // Install initial version first
        const initialInstallResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(initialInstallResult.exitCode).toBe(0);

        // Update config with same versions (no changes)
        const sameVersionConfig = {
          version: 1 as const,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.5", // Same
                pythonVersion: "3.11.11", // Same
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

        await tempProject.updateConfig(sameVersionConfig);

        // Should sync environment without changes
        const syncResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(syncResult.exitCode).toBe(0);

        const stderr = syncResult.stderr ?? "";
        expect(stderr).toContain(
          "Environment synchronized with existing dependencies"
        );
        expect(stderr).not.toContain("Version changes detected");
        expect(stderr).not.toContain(
          "Upgrading Python project due to version changes"
        );

        // Verify versions unchanged
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

  describe("Complex upgrade scenarios", () => {
    it(
      "should handle multiple servers with mixed upgrade conditions",
      withProcess(async spawn => {
        // Create project with two Python servers - one will upgrade, one won't
        const mixedConfig = {
          version: 1 as const,
          mcpServers: {
            "server-1": {
              python: {
                package: "mcp-pypi",
                version: "2.6.5",
                pythonVersion: "3.11.11",
                command: "mcp-pypi" as CommandStringTemplate,
              },
              installImplicitlyUpgradesChangedPackages: true, // This one allows upgrades
            },
            "server-2": {
              python: {
                package: "mcp-pypi",
                version: "2.6.5",
                pythonVersion: "3.11.11",
                command: "mcp-pypi" as CommandStringTemplate,
              },
              installImplicitlyUpgradesChangedPackages: false, // This one doesn't
            },
          },
          hosts: {
            "claude-code": true,
          },
          installImplicitlyUpgradesChangedPackages: false, // Global default is false
        };

        const mixedProject = await createTempProject({
          config: mixedConfig,
          format: "yaml",
          prefix: "python-mixed-upgrade-",
        });

        try {
          // Install both servers initially
          const installResult = await spawn(["install"], {
            cwd: mixedProject.path,
          });
          expect(installResult.exitCode).toBe(0);

          // Update both servers to new version
          const updatedConfig = {
            ...mixedConfig,
            mcpServers: {
              "server-1": {
                python: {
                  package: "mcp-pypi",
                  version: "2.6.7", // Upgraded
                  pythonVersion: "3.13.6", // Upgraded
                  command: "mcp-pypi" as CommandStringTemplate,
                },
                installImplicitlyUpgradesChangedPackages: true,
              },
              "server-2": {
                python: {
                  package: "mcp-pypi",
                  version: "2.6.7", // Upgraded
                  pythonVersion: "3.13.6", // Upgraded
                  command: "mcp-pypi" as CommandStringTemplate,
                },
                installImplicitlyUpgradesChangedPackages: false,
              },
            },
          };

          await mixedProject.updateConfig(updatedConfig);

          // Install - should upgrade server-1 but not server-2
          const upgradeResult = await spawn(["install"], {
            cwd: mixedProject.path,
          });
          expect(upgradeResult.exitCode).toBe(0);

          // Verify server-1 was upgraded
          const server1Dir = join(
            mixedProject.path,
            ".mcpadre",
            "servers",
            "server-1"
          );
          const server1Pyproject = await readFile(
            join(server1Dir, "pyproject.toml"),
            "utf8"
          );
          expect(server1Pyproject).toContain('"mcp-pypi==2.6.7"');
          expect(server1Pyproject).toContain('requires-python = "==3.13.6"');

          // Verify server-2 was NOT upgraded
          const server2Dir = join(
            mixedProject.path,
            ".mcpadre",
            "servers",
            "server-2"
          );
          const server2Pyproject = await readFile(
            join(server2Dir, "pyproject.toml"),
            "utf8"
          );
          expect(server2Pyproject).toContain('"mcp-pypi==2.6.5"');
          expect(server2Pyproject).toContain('requires-python = "==3.11.11"');
        } finally {
          await mixedProject.cleanup();
        }
      })
    );
  });
});
