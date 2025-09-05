// pattern: Imperative Shell

import { access, constants, readFile } from "fs/promises";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import { withProcess } from "../helpers/spawn-cli-v2.js";

import type { CommandStringTemplate } from "../../config/types/index.js";
import type { TempProject } from "../../test-utils/project/temp-project.js";

describe("Python server installImplicitlyUpgradesChangedPackages=false scenarios", () => {
  let tempProject: TempProject;

  afterEach(async () => {
    await tempProject.cleanup();
  });

  describe("Global installImplicitlyUpgradesChangedPackages=false", () => {
    beforeEach(async () => {
      // Create project with global restriction
      const globalRestrictiveConfig = {
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
        installImplicitlyUpgradesChangedPackages: false, // Global restriction
      };

      tempProject = await createTempProject({
        config: globalRestrictiveConfig,
        format: "yaml",
        prefix: "python-no-implicit-global-",
      });
    });

    it(
      "should prevent version upgrades when global installImplicitlyUpgradesChangedPackages=false",
      withProcess(async spawn => {
        // Install initial version
        const initialInstallProc = spawn(["install"], {
          cwd: tempProject.path,
        });
        const initialInstallResult = await initialInstallProc;
        expect(initialInstallResult.exitCode).toBe(0);

        // Verify initial installation
        const initialServerDir = join(
          tempProject.path,
          ".mcpadre",
          "servers",
          "pypi-server"
        );
        await access(initialServerDir, constants.F_OK);

        const initialPyprojectContent = await readFile(
          join(initialServerDir, "pyproject.toml"),
          "utf8"
        );
        expect(initialPyprojectContent).toContain('"mcp-pypi==2.6.5"');
        expect(initialPyprojectContent).toContain(
          'requires-python = "==3.11.11"'
        );

        // Update to new version
        const updatedConfig = {
          version: 1 as const,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.7", // Upgraded
                pythonVersion: "3.13.6", // Upgraded
                command: "mcp-pypi" as CommandStringTemplate,
              },
            },
          },
          hosts: {
            "claude-code": true,
          },
          installImplicitlyUpgradesChangedPackages: false, // Still false
        };

        await tempProject.updateConfig(updatedConfig);

        // Install should detect changes but not upgrade
        const updateInstallProc = spawn(["install"], {
          cwd: tempProject.path,
        });
        const updateInstallResult = await updateInstallProc;
        expect(updateInstallResult.exitCode).toBe(0); // Should succeed but not upgrade

        const stderr = updateInstallResult.stderr ?? "";
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

        // Verify old versions remain
        const finalServerDir = join(
          tempProject.path,
          ".mcpadre",
          "servers",
          "pypi-server"
        );
        const finalPyprojectContent = await readFile(
          join(finalServerDir, "pyproject.toml"),
          "utf8"
        );
        expect(finalPyprojectContent).toContain('"mcp-pypi==2.6.5"'); // Should not change
        expect(finalPyprojectContent).toContain(
          'requires-python = "==3.11.11"'
        ); // Should not change

        const pythonVersionContent = await readFile(
          join(finalServerDir, ".python-version"),
          "utf8"
        );
        expect(pythonVersionContent.trim()).toBe("3.11.11"); // Should not change
      })
    );

    it(
      "should allow server-level override of global installImplicitlyUpgradesChangedPackages=false",
      withProcess(async spawn => {
        // Install initial version first
        const initialInstallProc = spawn(["install"], {
          cwd: tempProject.path,
        });
        const initialInstallResult = await initialInstallProc;
        expect(initialInstallResult.exitCode).toBe(0);

        // Verify initial installation
        const initialServerDir = join(
          tempProject.path,
          ".mcpadre",
          "servers",
          "pypi-server"
        );
        await access(initialServerDir, constants.F_OK);
        // Update with server-level override
        const serverOverrideConfig = {
          version: 1 as const,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.7",
                pythonVersion: "3.13.6",
                command: "mcp-pypi" as CommandStringTemplate,
              },
              installImplicitlyUpgradesChangedPackages: true, // Server overrides global
            },
          },
          hosts: {
            "claude-code": true,
          },
          installImplicitlyUpgradesChangedPackages: false, // Global is still false
        };

        await tempProject.updateConfig(serverOverrideConfig);

        // Should upgrade because server-level setting overrides global
        const installProc = spawn(["install"], {
          cwd: tempProject.path,
        });
        const installResult = await installProc;
        expect(installResult.exitCode).toBe(0);

        const stderr = installResult.stderr ?? "";
        expect(stderr).toContain(
          "Upgrading Python project due to version changes"
        );
        expect(stderr).toContain("Python version: ==3.11.11 → ==3.13.6");
        expect(stderr).toContain(
          "Package version: mcp-pypi==2.6.5 → mcp-pypi==2.6.7"
        );

        // Verify upgrade occurred
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
        expect(pyprojectContent).toContain('requires-python = "==3.13.6"');
      })
    );

    it(
      "should show clear help message when upgrades are prevented",
      withProcess(async spawn => {
        // Install initial version first
        const initialInstallResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(initialInstallResult.exitCode).toBe(0);

        // Update config to trigger version change detection
        const newConfig = {
          version: 1 as const,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.7",
                pythonVersion: "3.13.6",
                command: "mcp-pypi" as CommandStringTemplate,
              },
            },
          },
          hosts: {
            "claude-code": true,
          },
          installImplicitlyUpgradesChangedPackages: false,
        };

        await tempProject.updateConfig(newConfig);

        const installProc = spawn(["install"], {
          cwd: tempProject.path,
        });
        const installResult = await installProc;
        expect(installResult.exitCode).toBe(0);

        const stderr = installResult.stderr ?? "";

        // Should provide clear guidance to user
        expect(stderr).toContain(
          "Package/Python version changed but installImplicitlyUpgradesChangedPackages=false"
        );
        expect(stderr).toContain(
          "Use --force to override or set installImplicitlyUpgradesChangedPackages=true in config"
        );

        // Should list the specific version changes in the JSON log data
        expect(stderr).toContain("Python version: ==3.11.11 → ==3.13.6");
        expect(stderr).toContain(
          "Package version: mcp-pypi==2.6.5 → mcp-pypi==2.6.7"
        );
      })
    );

    it(
      "should handle partial version changes with clear messaging",
      withProcess(async spawn => {
        // Install initial version first
        const initialInstallResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(initialInstallResult.exitCode).toBe(0);

        // Only change package version, not Python version
        const partialChangeConfig = {
          version: 1 as const,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.7", // Only this changed
                pythonVersion: "3.11.11", // Same as before
                command: "mcp-pypi" as CommandStringTemplate,
              },
            },
          },
          hosts: {
            "claude-code": true,
          },
          installImplicitlyUpgradesChangedPackages: false,
        };

        await tempProject.updateConfig(partialChangeConfig);

        const installProc = spawn(["install"], {
          cwd: tempProject.path,
        });
        const installResult = await installProc;
        expect(installResult.exitCode).toBe(0);

        const stderr = installResult.stderr ?? "";
        expect(stderr).toContain(
          "Package/Python version changed but installImplicitlyUpgradesChangedPackages=false"
        );
        expect(stderr).toContain(
          "Package version: mcp-pypi==2.6.5 → mcp-pypi==2.6.7"
        );
        expect(stderr).not.toContain("Python version:"); // Should not mention unchanged Python version
      })
    );
  });

  describe("Server-level installImplicitlyUpgradesChangedPackages=false", () => {
    it(
      "should respect server-level restriction even when global allows upgrades",
      withProcess(async spawn => {
        // Server restricts upgrades, global allows them
        const serverRestrictiveConfig = {
          version: 1 as const,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.5",
                pythonVersion: "3.11.11",
                command: "mcp-pypi" as CommandStringTemplate,
              },
              installImplicitlyUpgradesChangedPackages: false, // Server restriction
            },
          },
          hosts: {
            "claude-code": true,
          },
          installImplicitlyUpgradesChangedPackages: true, // Global allows
        };

        const serverProject = await createTempProject({
          config: serverRestrictiveConfig,
          format: "yaml",
          prefix: "python-server-restrictive-",
        });

        try {
          // Install initial version
          const installProc = spawn(["install"], {
            cwd: serverProject.path,
          });
          const installResult = await installProc;
          expect(installResult.exitCode).toBe(0);

          // Update to new version
          const updatedConfig = {
            ...serverRestrictiveConfig,
            mcpServers: {
              "pypi-server": {
                python: {
                  package: "mcp-pypi",
                  version: "2.6.7", // Updated
                  pythonVersion: "3.13.6", // Updated
                  command: "mcp-pypi" as CommandStringTemplate,
                },
                installImplicitlyUpgradesChangedPackages: false, // Still restricted
              },
            },
          };

          await serverProject.updateConfig(updatedConfig);

          // Should prevent upgrade despite global permission
          const upgradeProc = spawn(["install"], {
            cwd: serverProject.path,
          });
          const upgradeResult = await upgradeProc;
          expect(upgradeResult.exitCode).toBe(0);

          const stderr = upgradeResult.stderr ?? "";
          expect(stderr).toContain(
            "Package/Python version changed but installImplicitlyUpgradesChangedPackages=false"
          );
          expect(stderr).toContain("Python version: ==3.11.11 → ==3.13.6");
          expect(stderr).toContain(
            "Package version: mcp-pypi==2.6.5 → mcp-pypi==2.6.7"
          );

          // Verify no upgrade occurred
          const serverDir = join(
            serverProject.path,
            ".mcpadre",
            "servers",
            "pypi-server"
          );
          const pyprojectContent = await readFile(
            join(serverDir, "pyproject.toml"),
            "utf8"
          );
          expect(pyprojectContent).toContain('"mcp-pypi==2.6.5"');
          expect(pyprojectContent).toContain('requires-python = "==3.11.11"');
        } finally {
          await serverProject.cleanup();
        }
      })
    );

    it(
      "should handle mixed server configurations correctly",
      withProcess(async spawn => {
        // Multiple servers with different installImplicitlyUpgradesChangedPackages settings
        const mixedConfig = {
          version: 1 as const,
          mcpServers: {
            "server-allows": {
              python: {
                package: "mcp-pypi",
                version: "2.6.5",
                pythonVersion: "3.11.11",
                command: "mcp-pypi" as CommandStringTemplate,
              },
              installImplicitlyUpgradesChangedPackages: true, // Allows
            },
            "server-restricts": {
              python: {
                package: "mcp-pypi",
                version: "2.6.5",
                pythonVersion: "3.11.11",
                command: "mcp-pypi" as CommandStringTemplate,
              },
              installImplicitlyUpgradesChangedPackages: false, // Restricts
            },
            "server-default": {
              python: {
                package: "mcp-pypi",
                version: "2.6.5",
                pythonVersion: "3.11.11",
                command: "mcp-pypi" as CommandStringTemplate,
              },
              // No explicit setting - should inherit global
            },
          },
          hosts: {
            "claude-code": true,
          },
          installImplicitlyUpgradesChangedPackages: false, // Global default is restrictive
        };

        const mixedProject = await createTempProject({
          config: mixedConfig,
          format: "yaml",
          prefix: "python-mixed-settings-",
        });

        try {
          // Install all servers initially
          const installProc = spawn(["install"], {
            cwd: mixedProject.path,
          });
          const installResult = await installProc;
          expect(installResult.exitCode).toBe(0);

          // Update all servers to new versions
          const updatedMixedConfig = {
            ...mixedConfig,
            mcpServers: {
              "server-allows": {
                python: {
                  package: "mcp-pypi",
                  version: "2.6.7", // Updated
                  pythonVersion: "3.13.6", // Updated
                  command: "mcp-pypi" as CommandStringTemplate,
                },
                installImplicitlyUpgradesChangedPackages: true,
              },
              "server-restricts": {
                python: {
                  package: "mcp-pypi",
                  version: "2.6.7", // Updated
                  pythonVersion: "3.13.6", // Updated
                  command: "mcp-pypi" as CommandStringTemplate,
                },
                installImplicitlyUpgradesChangedPackages: false,
              },
              "server-default": {
                python: {
                  package: "mcp-pypi",
                  version: "2.6.7", // Updated
                  pythonVersion: "3.13.6", // Updated
                  command: "mcp-pypi" as CommandStringTemplate,
                },
              },
            },
          };

          await mixedProject.updateConfig(updatedMixedConfig);

          // Run install
          const upgradeProc = spawn(["install"], {
            cwd: mixedProject.path,
          });
          const upgradeResult = await upgradeProc;
          expect(upgradeResult.exitCode).toBe(0);

          const stderr = upgradeResult.stderr ?? "";

          // One server should upgrade (server-allows), two should be prevented (server-restricts and server-default)
          expect(stderr).toContain(
            "Upgrading Python project due to version changes"
          );
          expect(stderr).toContain(
            "Package/Python version changed but installImplicitlyUpgradesChangedPackages=false"
          );
          // Should show that 3 servers were processed
          expect(stderr).toContain("Configured 3 server(s) across all hosts");

          // Verify only server-allows was upgraded
          const allowsDir = join(
            mixedProject.path,
            ".mcpadre",
            "servers",
            "server-allows"
          );
          const allowsPyproject = await readFile(
            join(allowsDir, "pyproject.toml"),
            "utf8"
          );
          expect(allowsPyproject).toContain('"mcp-pypi==2.6.7"');

          const restrictsDir = join(
            mixedProject.path,
            ".mcpadre",
            "servers",
            "server-restricts"
          );
          const restrictsPyproject = await readFile(
            join(restrictsDir, "pyproject.toml"),
            "utf8"
          );
          expect(restrictsPyproject).toContain('"mcp-pypi==2.6.5"'); // Should not change

          const defaultDir = join(
            mixedProject.path,
            ".mcpadre",
            "servers",
            "server-default"
          );
          const defaultPyproject = await readFile(
            join(defaultDir, "pyproject.toml"),
            "utf8"
          );
          expect(defaultPyproject).toContain('"mcp-pypi==2.6.5"'); // Should not change
        } finally {
          await mixedProject.cleanup();
        }
      })
    );
  });
});
