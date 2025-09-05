// pattern: Imperative Shell

import { access, constants, readFile } from "fs/promises";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import { withProcess } from "../helpers/spawn-cli-v2.js";

import type {
  CommandStringTemplate,
  SettingsProject,
} from "../../config/types/index.js";
import type { TempProject } from "../../test-utils/project/temp-project.js";

describe("Python server --force flag override behavior", () => {
  let tempProject: TempProject;

  afterEach(async () => {
    await tempProject.cleanup();
  });

  describe("Force flag overrides installImplicitlyUpgradesChangedPackages=false", () => {
    beforeEach(async () => {
      // Start with installImplicitlyUpgradesChangedPackages explicitly set to false
      const restrictiveConfig = {
        version: 1 as const,
        mcpServers: {
          "pypi-server": {
            python: {
              package: "mcp-pypi",
              version: "2.6.5",
              pythonVersion: "3.11.11",
              command: "mcp-pypi" as CommandStringTemplate,
            },
            installImplicitlyUpgradesChangedPackages: false, // Server-level restriction
          },
        },
        hosts: {
          "claude-code": true,
        },
        installImplicitlyUpgradesChangedPackages: false, // Global-level restriction
      } as SettingsProject;

      tempProject = await createTempProject({
        config: restrictiveConfig,
        format: "yaml",
        prefix: "python-force-override-",
      });
    });

    it(
      "should override global installImplicitlyUpgradesChangedPackages=false with --force",
      withProcess(async spawn => {
        // Install initial version
        const installResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(installResult.exitCode).toBe(0);

        // Verify initial state
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
        expect(initialPyprojectContent).toContain(
          'requires-python = "==3.11.11"'
        );
        expect(initialPyprojectContent).toContain('"mcp-pypi==2.6.5"');

        // Update to new version
        const updatedConfig = {
          version: 1 as const,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.7",
                pythonVersion: "3.13.6",
                command: "mcp-pypi" as CommandStringTemplate,
              },
              installImplicitlyUpgradesChangedPackages: false, // Still false
            },
          },
          hosts: {
            "claude-code": true,
          },
          installImplicitlyUpgradesChangedPackages: false, // Still false
        };

        await tempProject.updateConfig(updatedConfig);

        // First attempt without --force should fail
        const normalProc = spawn(["install"], {
          cwd: tempProject.path,
        });
        const normalResult = await normalProc;
        expect(normalResult.exitCode).toBe(0); // Should not error but should warn

        const normalStderr = normalResult.stderr ?? "";
        expect(normalStderr).toContain(
          "Package/Python version changed but installImplicitlyUpgradesChangedPackages=false"
        );
        expect(normalStderr).toContain("Python version: ==3.11.11 → ==3.13.6");
        expect(normalStderr).toContain(
          "Package version: mcp-pypi==2.6.5 → mcp-pypi==2.6.7"
        );

        // Second attempt with --force should succeed
        const forceProc = spawn(["install", "--force"], {
          cwd: tempProject.path,
        });
        const forceResult = await forceProc;
        expect(forceResult.exitCode).toBe(0);

        const forceStderr = forceResult.stderr ?? "";
        expect(forceStderr).toContain(
          "Upgrading Python project due to version changes"
        );
        expect(forceStderr).toContain("Python version: ==3.11.11 → ==3.13.6");
        expect(forceStderr).toContain(
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
      "should override server-level installImplicitlyUpgradesChangedPackages=false with --force",
      withProcess(async spawn => {
        // Install initial version first
        const initialInstallResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(initialInstallResult.exitCode).toBe(0);

        // Update config with server-level restriction but global permission
        const mixedConfig = {
          version: 1 as const,
          mcpServers: {
            "pypi-server": {
              python: {
                package: "mcp-pypi",
                version: "2.6.7",
                pythonVersion: "3.13.6",
                command: "mcp-pypi" as CommandStringTemplate,
              },
              installImplicitlyUpgradesChangedPackages: false, // Server says no
            },
          },
          hosts: {
            "claude-code": true,
          },
          installImplicitlyUpgradesChangedPackages: true, // Global says yes, but server wins
        };

        await tempProject.updateConfig(mixedConfig);

        // Normal install should respect server-level restriction
        const normalProc = spawn(["install"], {
          cwd: tempProject.path,
        });
        const normalResult = await normalProc;
        expect(normalResult.exitCode).toBe(0);

        const normalStderr = normalResult.stderr ?? "";
        expect(normalStderr).toContain(
          "Package/Python version changed but installImplicitlyUpgradesChangedPackages=false"
        );

        // Force should override server-level restriction
        const forceProc = spawn(["install", "--force"], {
          cwd: tempProject.path,
        });
        const forceResult = await forceProc;
        expect(forceResult.exitCode).toBe(0);

        const forceStderr = forceResult.stderr ?? "";
        expect(forceStderr).toContain(
          "Upgrading Python project due to version changes"
        );

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
      })
    );

    it(
      "should handle --force with multiple servers having different restriction levels",
      withProcess(async spawn => {
        // Create project with multiple servers with different installImplicitlyUpgradesChangedPackages settings
        const multiServerConfig = {
          version: 1 as const,
          mcpServers: {
            "server-restricted": {
              python: {
                package: "mcp-pypi",
                version: "2.6.5",
                pythonVersion: "3.11.11",
                command: "mcp-pypi" as CommandStringTemplate,
              },
              installImplicitlyUpgradesChangedPackages: false, // Restricted
            },
            "server-permissive": {
              python: {
                package: "mcp-pypi",
                version: "2.6.5",
                pythonVersion: "3.11.11",
                command: "mcp-pypi" as CommandStringTemplate,
              },
              installImplicitlyUpgradesChangedPackages: true, // Permissive
            },
          },
          hosts: {
            "claude-code": true,
          },
          installImplicitlyUpgradesChangedPackages: false, // Global default is restrictive
        };

        const multiProject = await createTempProject({
          config: multiServerConfig,
          format: "yaml",
          prefix: "python-force-multi-",
        });

        try {
          // Install both servers initially
          const installProc = spawn(["install"], {
            cwd: multiProject.path,
          });
          const installResult = await installProc;
          expect(installResult.exitCode).toBe(0);

          // Update both servers to new versions
          const updatedMultiConfig = {
            ...multiServerConfig,
            mcpServers: {
              "server-restricted": {
                python: {
                  package: "mcp-pypi",
                  version: "2.6.7", // Updated
                  pythonVersion: "3.13.6", // Updated
                  command: "mcp-pypi" as CommandStringTemplate,
                },
                installImplicitlyUpgradesChangedPackages: false,
              },
              "server-permissive": {
                python: {
                  package: "mcp-pypi",
                  version: "2.6.7", // Updated
                  pythonVersion: "3.13.6", // Updated
                  command: "mcp-pypi" as CommandStringTemplate,
                },
                installImplicitlyUpgradesChangedPackages: true,
              },
            },
          };

          await multiProject.updateConfig(updatedMultiConfig);

          // Normal install should upgrade permissive but not restricted
          const normalProc = spawn(["install"], {
            cwd: multiProject.path,
          });
          const normalResult = await normalProc;
          expect(normalResult.exitCode).toBe(0);

          const normalStderr = normalResult.stderr ?? "";
          // One server should upgrade (permissive), one should be blocked (restricted)
          expect(normalStderr).toContain(
            "Upgrading Python project due to version changes"
          );
          expect(normalStderr).toContain(
            "Package/Python version changed but installImplicitlyUpgradesChangedPackages=false"
          );
          expect(normalStderr).toContain(
            "Configured 2 server(s) across all hosts"
          );

          // Force install should upgrade both
          const forceProc = spawn(["install", "--force"], {
            cwd: multiProject.path,
          });
          const forceResult = await forceProc;
          expect(forceResult.exitCode).toBe(0);

          const forceStderr = forceResult.stderr ?? "";
          // Both servers should be upgraded with --force, so we expect upgrade messages
          expect(forceStderr).toContain(
            "Upgrading Python project due to version changes"
          );
          expect(forceStderr).toContain(
            "Configured 2 server(s) across all hosts"
          );

          // Verify both servers were upgraded
          const restrictedDir = join(
            multiProject.path,
            ".mcpadre",
            "servers",
            "server-restricted"
          );
          const restrictedPyproject = await readFile(
            join(restrictedDir, "pyproject.toml"),
            "utf8"
          );
          expect(restrictedPyproject).toContain('"mcp-pypi==2.6.7"');

          const permissiveDir = join(
            multiProject.path,
            ".mcpadre",
            "servers",
            "server-permissive"
          );
          const permissivePyproject = await readFile(
            join(permissiveDir, "pyproject.toml"),
            "utf8"
          );
          expect(permissivePyproject).toContain('"mcp-pypi==2.6.7"');
        } finally {
          await multiProject.cleanup();
        }
      })
    );

    it(
      "should show appropriate messaging when --force overrides restrictions",
      withProcess(async spawn => {
        // Install initial version first
        const initialInstallResult = await spawn(["install"], {
          cwd: tempProject.path,
        });
        expect(initialInstallResult.exitCode).toBe(0);

        // Update config to trigger restriction warning
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
              installImplicitlyUpgradesChangedPackages: false,
            },
          },
          hosts: {
            "claude-code": true,
          },
          installImplicitlyUpgradesChangedPackages: false,
        };

        await tempProject.updateConfig(newConfig);

        // Use --force and verify messaging indicates override
        const forceProc = spawn(["install", "--force"], {
          cwd: tempProject.path,
        });
        const forceResult = await forceProc;
        expect(forceResult.exitCode).toBe(0);

        const stderr = forceResult.stderr ?? "";

        // Should show upgrade happened
        expect(stderr).toContain(
          "Upgrading Python project due to version changes"
        );
        expect(stderr).toContain("Python version: ==3.11.11 → ==3.13.6");
        expect(stderr).toContain(
          "Package version: mcp-pypi==2.6.5 → mcp-pypi==2.6.7"
        );

        // Should NOT show restriction warning when using --force
        expect(stderr).not.toContain(
          "Package/Python version changed but installImplicitlyUpgradesChangedPackages=false"
        );
        expect(stderr).not.toContain("Use --force to upgrade");
      })
    );
  });
});
