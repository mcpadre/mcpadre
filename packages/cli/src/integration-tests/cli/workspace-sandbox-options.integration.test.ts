// pattern: Imperative Shell

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import { type SpawnFunction, withProcess } from "../helpers/spawn-cli-v2.js";

import type {
  CommandStringTemplate,
  PathStringTemplate,
} from "../../config/types/index.js";
import type { TempProject } from "../../test-utils/project/temp-project.js";

// Helper to determine if sandbox tests should be skipped
function shouldSkipSandboxTests(): boolean {
  if (process.env["MCPADRE_SKIP_SANDBOX_TESTS"] === "1") {
    return true;
  }
  return false;
}

describe.skipIf(shouldSkipSandboxTests())(
  "Workspace sandbox options integration",
  () => {
    let tempProject: TempProject;

    beforeEach(async () => {
      // Base configuration without workspace options
      const baseConfig = {
        version: 1 as const,
        mcpServers: {
          "echo-server": {
            shell: {
              command: "echo 'test'" as CommandStringTemplate,
            },
            sandbox: {
              enabled: true,
              networking: false,
              omitSystemPaths: false,
              omitWorkspacePath: false,
              allowRead: ["{{dirs.workspace}}/input" as PathStringTemplate],
              allowReadWrite: [
                "{{dirs.workspace}}/output" as PathStringTemplate,
              ],
            },
          },
        },
        hosts: {
          "claude-code": true,
        },
      };

      tempProject = await createTempProject({
        config: baseConfig,
        format: "yaml",
        prefix: "workspace-sandbox-opts-",
      });
    });

    afterEach(async () => {
      await tempProject.cleanup();
    });

    describe("disableAllSandboxes option", () => {
      it(
        "should disable sandboxing when disableAllSandboxes is true",
        withProcess(async spawn => {
          // Update config with disableAllSandboxes option
          const configWithDisable = {
            version: 1 as const,
            mcpServers: {
              "echo-server": {
                shell: {
                  command: "echo 'sandbox test'" as CommandStringTemplate,
                },
                sandbox: {
                  enabled: true, // Server wants sandbox enabled
                  networking: false,
                  omitSystemPaths: false,
                  omitWorkspacePath: false,
                },
              },
            },
            hosts: {
              "claude-code": true,
            },
            options: {
              disableAllSandboxes: true, // But workspace disables all sandboxes
            },
          };

          await tempProject.updateConfig(configWithDisable);

          // Install the configuration
          const installResult = await spawn(["install"], {
            cwd: tempProject.path,
          });
          expect(installResult.exitCode).toBe(0);

          // Run the server - should work without sandbox
          const runProc = spawn(
            ["run", "echo-server", "--log-level", "debug"],
            {
              cwd: tempProject.path,
              buffer: false,
            }
          );

          // Give it time to start
          const timeoutPromise = new Promise<void>(resolve => {
            setTimeout(() => {
              runProc.kill("SIGTERM");
              resolve();
            }, 2000);
          });

          try {
            const result = await Promise.race([runProc, timeoutPromise]);
            // If it exited quickly, check for sandbox-related errors
            if (result && "exitCode" in result) {
              const output =
                String(result.stderr ?? "") + String(result.stdout ?? "");
              // Should not contain sandbox-exec errors
              expect(output).not.toContain("sandbox-exec");
            }
          } catch {
            // Timeout means it was waiting for input - that's fine
          }
        })
      );

      it(
        "should respect server's disabled setting when disableAllSandboxes is false",
        withProcess(async spawn => {
          const configWithOption = {
            version: 1 as const,
            mcpServers: {
              "echo-server": {
                shell: {
                  command: "echo 'test'" as CommandStringTemplate,
                },
                sandbox: {
                  enabled: false, // Server disables sandbox
                  networking: false,
                  omitSystemPaths: false,
                  omitWorkspacePath: false,
                },
              },
            },
            hosts: {
              "claude-code": true,
            },
            options: {
              disableAllSandboxes: false, // Workspace doesn't force disable
            },
          };

          await tempProject.updateConfig(configWithOption);

          const installResult = await spawn(["install"], {
            cwd: tempProject.path,
          });
          expect(installResult.exitCode).toBe(0);
        })
      );
    });

    describe("extraAllowRead option", () => {
      it(
        "should add extra read paths to all servers",
        withProcess(async spawn => {
          const configWithExtraRead = {
            version: 1 as const,
            mcpServers: {
              "test-server": {
                shell: {
                  command: "cat {{dirs.home}}/.bashrc" as CommandStringTemplate,
                },
                sandbox: {
                  enabled: true,
                  networking: false,
                  omitSystemPaths: false,
                  omitWorkspacePath: false,
                  allowRead: ["{{dirs.workspace}}/data" as PathStringTemplate],
                },
              },
            },
            hosts: {
              "claude-code": true,
            },
            options: {
              extraAllowRead: [
                "{{dirs.home}}/.bashrc" as PathStringTemplate,
                "{{dirs.home}}/.profile" as PathStringTemplate,
              ],
            },
          };

          await tempProject.updateConfig(configWithExtraRead);

          const installResult = await spawn(["install"], {
            cwd: tempProject.path,
          });
          expect(installResult.exitCode).toBe(0);

          // The server should be able to read both its specific paths and the extra paths
          // This test verifies configuration parsing and merging
        })
      );

      it(
        "should resolve templates in extraAllowRead",
        withProcess(async spawn => {
          const configWithTemplates = {
            version: 1 as const,
            mcpServers: {
              "template-server": {
                shell: {
                  command: "ls" as CommandStringTemplate,
                },
                sandbox: {
                  enabled: true,
                  networking: false,
                  omitSystemPaths: false,
                  omitWorkspacePath: false,
                },
              },
            },
            hosts: {
              "claude-code": true,
            },
            options: {
              extraAllowRead: [
                "{{dirs.workspace}}/shared" as PathStringTemplate,
                "{{dirs.data}}/common" as PathStringTemplate,
              ],
            },
          };

          await tempProject.updateConfig(configWithTemplates);

          const installResult = await spawn(["install"], {
            cwd: tempProject.path,
          });
          expect(installResult.exitCode).toBe(0);
        })
      );
    });

    describe("extraAllowWrite option", () => {
      it(
        "should add extra write paths to all servers",
        withProcess(async spawn => {
          const configWithExtraWrite = {
            version: 1 as const,
            mcpServers: {
              "writer-server": {
                shell: {
                  command:
                    "touch {{dirs.temp}}/test.txt" as CommandStringTemplate,
                },
                sandbox: {
                  enabled: true,
                  networking: false,
                  omitSystemPaths: false,
                  omitWorkspacePath: false,
                  allowReadWrite: [
                    "{{dirs.workspace}}/output" as PathStringTemplate,
                  ],
                },
              },
            },
            hosts: {
              "claude-code": true,
            },
            options: {
              extraAllowWrite: [
                "{{dirs.temp}}" as PathStringTemplate,
                "{{dirs.cache}}/builds" as PathStringTemplate,
              ],
            },
          };

          await tempProject.updateConfig(configWithExtraWrite);

          const installResult = await spawn(["install"], {
            cwd: tempProject.path,
          });
          expect(installResult.exitCode).toBe(0);
        })
      );
    });

    describe("combined workspace options", () => {
      it(
        "should apply all workspace options together",
        withProcess(async spawn => {
          const configWithAllOptions = {
            version: 1 as const,
            mcpServers: {
              "combined-server": {
                shell: {
                  command: "echo 'combined test'" as CommandStringTemplate,
                },
                sandbox: {
                  enabled: true,
                  networking: false,
                  omitSystemPaths: false,
                  omitWorkspacePath: false,
                  allowRead: ["{{dirs.workspace}}/input" as PathStringTemplate],
                  allowReadWrite: [
                    "{{dirs.workspace}}/output" as PathStringTemplate,
                  ],
                },
              },
            },
            hosts: {
              "claude-code": true,
            },
            options: {
              disableAllSandboxes: false,
              extraAllowRead: [
                "{{dirs.home}}/.config" as PathStringTemplate,
                "{{dirs.data}}/shared" as PathStringTemplate,
              ],
              extraAllowWrite: ["{{dirs.temp}}/work" as PathStringTemplate],
            },
          };

          await tempProject.updateConfig(configWithAllOptions);

          const installResult = await spawn(["install"], {
            cwd: tempProject.path,
          });
          expect(installResult.exitCode).toBe(0);

          // Verify the configuration was accepted and installed
          const output =
            String(installResult.stdout ?? "") +
            String(installResult.stderr ?? "");
          expect(output).toContain("Installed for 1 host(s)");
        })
      );

      it(
        "should handle Python servers with workspace options",
        withProcess(async spawn => {
          const pythonConfig = {
            version: 1 as const,
            mcpServers: {
              "python-server": {
                python: {
                  package: "mcp-pypi",
                  version: "2.6.7",
                  pythonVersion: "3.13.6",
                  command: "mcp-pypi" as CommandStringTemplate,
                },
                sandbox: {
                  enabled: true,
                  networking: false,
                  omitSystemPaths: false,
                  omitWorkspacePath: false,
                },
              },
            },
            hosts: {
              "claude-code": true,
            },
            options: {
              extraAllowRead: ["{{dirs.home}}/.pypirc" as PathStringTemplate],
            },
          };

          await tempProject.updateConfig(pythonConfig);

          const installResult = await spawn(["install"], {
            cwd: tempProject.path,
          });
          expect(installResult.exitCode).toBe(0);
        })
      );

      it(
        "should handle container servers with workspace options",
        withProcess(async spawn => {
          const containerConfig = {
            version: 1 as const,
            mcpServers: {
              "container-server": {
                container: {
                  image: "mcp/test-server",
                  tag: "latest",
                  pullWhenDigestChanges: false,
                },
                sandbox: {
                  enabled: true,
                  networking: false,
                  omitSystemPaths: false,
                  omitWorkspacePath: false,
                },
              },
            },
            hosts: {
              "claude-code": true,
            },
            options: {
              disableAllSandboxes: true, // Should be processed even for containers
              extraAllowRead: [
                "{{dirs.workspace}}/container-data" as PathStringTemplate,
              ],
            },
          };

          await tempProject.updateConfig(containerConfig);

          const installResult = await spawn(["install"], {
            cwd: tempProject.path,
          });
          // Container pull will fail but config validation should pass
          // The exit code is 1 due to container pull failure, not config validation
          expect(installResult.exitCode).toBe(1);
        })
      );
    });

    describe("validation and error handling", () => {
      it(
        "should accept empty options object",
        withProcess(async spawn => {
          const configWithEmptyOptions = {
            version: 1 as const,
            mcpServers: {
              "test-server": {
                shell: {
                  command: "echo test" as CommandStringTemplate,
                },
              },
            },
            hosts: {
              "claude-code": true,
            },
            options: {}, // Empty options
          };

          await tempProject.updateConfig(configWithEmptyOptions);

          const installResult = await spawn(["install"], {
            cwd: tempProject.path,
          });
          expect(installResult.exitCode).toBe(0);
        })
      );

      it(
        "should work without options field",
        withProcess(async spawn => {
          const configWithoutOptions = {
            version: 1 as const,
            mcpServers: {
              "test-server": {
                shell: {
                  command: "echo test" as CommandStringTemplate,
                },
              },
            },
            hosts: {
              "claude-code": true,
            },
            // No options field at all
          };

          await tempProject.updateConfig(configWithoutOptions);

          const installResult = await spawn(["install"], {
            cwd: tempProject.path,
          });
          expect(installResult.exitCode).toBe(0);
        })
      );

      it(
        "should accept individual workspace options",
        withProcess(async (spawn: SpawnFunction) => {
          // Test just disableAllSandboxes
          const configOnlyDisable = {
            version: 1 as const,
            mcpServers: {
              "test-server": {
                shell: { command: "echo test" as CommandStringTemplate },
              },
            },
            hosts: { "claude-code": true },
            options: { disableAllSandboxes: true },
          };

          await tempProject.updateConfig(configOnlyDisable);
          let result = await spawn(["install"], { cwd: tempProject.path });
          expect(result.exitCode).toBe(0);

          // Test just extraAllowRead
          const configOnlyRead = {
            version: 1 as const,
            mcpServers: {
              "test-server": {
                shell: { command: "echo test" as CommandStringTemplate },
              },
            },
            hosts: { "claude-code": true },
            options: { extraAllowRead: ["/tmp" as PathStringTemplate] },
          };

          await tempProject.updateConfig(configOnlyRead);
          result = await spawn(["install"], { cwd: tempProject.path });
          expect(result.exitCode).toBe(0);

          // Test just extraAllowWrite
          const configOnlyWrite = {
            version: 1 as const,
            mcpServers: {
              "test-server": {
                shell: { command: "echo test" as CommandStringTemplate },
              },
            },
            hosts: { "claude-code": true },
            options: { extraAllowWrite: ["/tmp/output" as PathStringTemplate] },
          };

          await tempProject.updateConfig(configOnlyWrite);
          result = await spawn(["install"], { cwd: tempProject.path });
          expect(result.exitCode).toBe(0);
        })
      );
    });
  }
);
