import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createTempProject,
  type TempProject,
} from "../../test-utils/project/temp-project.js";
import {
  createProjectModeContext,
  createUserModeContext,
  ModeContext,
} from "../helpers/mode-test-utils.js";
import { findLogMessageInJSONL, withProcess } from "../helpers/spawn-cli-v2.js";

describe("Host Commands Integration (Consolidated)", () => {
  describe.each([
    {
      mode: "user",
      setupContext: async (dirPath: string) => {
        // Create user config directory
        const userDir = path.join(dirPath, ".mcpadre");
        await fs.promises.mkdir(userDir, { recursive: true });

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
        const userConfigPath = path.join(userDir, "mcpadre.yaml");
        await fs.promises.writeFile(userConfigPath, initialUserConfig, "utf8");

        return createUserModeContext(dirPath);
      },
    },
    {
      mode: "project",
      setupContext: async (_dirPath: string) => {
        // Create temp project with initial config
        const projectConfig = {
          version: 1 as const,
          mcpServers: {
            "test-server": {
              http: {
                url: "http://example.com",
                headers: {},
              },
            },
          },
        };

        const tempProject = await createTempProject({
          config: projectConfig,
          format: "yaml",
        });

        return {
          context: createProjectModeContext(tempProject),
          tempProject,
        };
      },
    },
  ])("$mode mode", ({ mode, setupContext }) => {
    let baseTempDir: string;
    let modeContext: ModeContext;
    let tempProject: TempProject | undefined;

    beforeEach(async () => {
      baseTempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "mcpadre-test-")
      );

      // Set up mode-specific context
      const setupResult = await setupContext(baseTempDir);

      if ("context" in setupResult && "tempProject" in setupResult) {
        // Project mode setup returns both context and tempProject
        modeContext = setupResult.context;
        tempProject = setupResult.tempProject;
      } else {
        // User mode setup returns just the context
        modeContext = setupResult;
      }

      await modeContext.setup();
    });

    afterEach(async () => {
      if (tempProject) {
        await tempProject.cleanup();
      } else if (baseTempDir) {
        await fs.promises.rm(baseTempDir, { recursive: true, force: true });
      }
    });

    describe(`host add (${mode} mode)`, () => {
      it(
        `should add ${mode === "user" ? "user-capable " : ""}host to ${mode} configuration`,
        withProcess(async spawn => {
          // Use claude-code as it works in both user and project modes
          const result = await spawn(
            [
              "host",
              "add",
              "claude-code",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).toBe(0);
          expect(result.stderr).toContain(
            `Added host 'claude-code' to ${mode} configuration`
          );

          // Verify host was added to config
          const configContent = await fs.promises.readFile(
            modeContext.getConfigPath(),
            "utf8"
          );
          expect(configContent).toContain("claude-code: true");
          // No need to check for cursor in project mode
          if (mode === "user") {
            expect(configContent).toContain("cursor: true"); // Original should remain
          }
        })
      );

      it(
        `should handle already enabled host in ${mode} configuration`,
        withProcess(async spawn => {
          // First add the host to ensure it exists (for project mode)
          await spawn(
            ["host", "add", "cursor", ...(mode === "user" ? ["--user"] : [])],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          // Then try to add it again
          const result = await spawn(
            ["host", "add", "cursor", ...(mode === "user" ? ["--user"] : [])],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).toBe(0);
          expect(result.stderr).toContain(
            `Host 'cursor' is already enabled in ${mode} configuration`
          );

          expect(result.exitCode).toBe(0);
          expect(result.stderr).toContain(
            `Host 'cursor' is already enabled in ${mode} configuration`
          );

          // Config should remain unchanged
          const configContent = await fs.promises.readFile(
            modeContext.getConfigPath(),
            "utf8"
          );
          expect(configContent).toContain("cursor: true");
        })
      );

      it(
        `should handle invalid host name for ${mode} configuration`,
        withProcess(async spawn => {
          const result = await spawn(
            [
              "host",
              "add",
              "invalid-host",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain("Unsupported host: invalid-host");
          expect(result.stderr).toContain("Supported hosts:");
        })
      );

      it(
        `should suggest similar host names for typos in ${mode} mode`,
        withProcess(async spawn => {
          const result = await spawn(
            ["host", "add", "cursur", ...(mode === "user" ? ["--user"] : [])],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain("Unsupported host: cursur");
          expect(result.stderr).toContain("Did you mean: cursor");
        })
      );
    });

    describe(`host remove (${mode} mode)`, () => {
      it(
        `should remove host from ${mode} configuration`,
        withProcess(async spawn => {
          // First ensure the host exists
          await spawn(
            ["host", "add", "cursor", ...(mode === "user" ? ["--user"] : [])],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          // Then remove it
          const result = await spawn(
            [
              "host",
              "remove",
              "cursor",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).toBe(0);
          expect(
            findLogMessageInJSONL(
              String(result.stderr ?? ""),
              `Removed host 'cursor' from ${mode} configuration`
            )
          ).toBe(true);

          expect(result.exitCode).toBe(0);
          expect(
            findLogMessageInJSONL(
              String(result.stderr ?? ""),
              `Removed host 'cursor' from ${mode} configuration`
            )
          ).toBe(true);

          // Verify host was removed from config
          const configContent = await fs.promises.readFile(
            modeContext.getConfigPath(),
            "utf8"
          );
          expect(configContent).not.toContain("cursor: true");
        })
      );

      it(
        `should handle already removed host in ${mode} configuration`,
        withProcess(async spawn => {
          // First remove the host
          await spawn(
            [
              "host",
              "remove",
              "cursor",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          // Try to remove again
          const result = await spawn(
            [
              "host",
              "remove",
              "cursor",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).toBe(0);
          expect(result.stderr).toContain(
            `Host 'cursor' is not enabled in ${mode} configuration (or already removed)`
          );
        })
      );

      it(
        `should handle invalid host name for ${mode} configuration`,
        withProcess(async spawn => {
          const result = await spawn(
            [
              "host",
              "remove",
              "invalid-host",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain("Unsupported host: invalid-host");
        })
      );

      it(
        `should suggest similar host names for typos in ${mode} mode`,
        withProcess(async spawn => {
          const result = await spawn(
            [
              "host",
              "remove",
              "cursur",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain("Unsupported host: cursur");
          expect(result.stderr).toContain("Did you mean: cursor");
        })
      );
    });

    // Mode-specific tests
    if (mode === "user") {
      describe("user-specific host commands", () => {
        it(
          "should add claude-desktop to user configuration",
          withProcess(async spawn => {
            const result = await spawn(
              ["host", "add", "claude-desktop", "--user"],
              {
                cwd: modeContext.getConfigDir(),
                buffer: true,
                env: { ...process.env, ...modeContext.env },
              }
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toContain(
              "Added host 'claude-desktop' to user configuration"
            );

            // Verify host was added to user config
            const configContent = await fs.promises.readFile(
              modeContext.getConfigPath(),
              "utf8"
            );
            expect(configContent).toContain("claude-desktop: true");
          })
        );

        it(
          "should add opencode to user configuration",
          withProcess(async spawn => {
            const result = await spawn(["host", "add", "opencode", "--user"], {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toContain(
              "Added host 'opencode' to user configuration"
            );

            // Verify host was added to user config
            const configContent = await fs.promises.readFile(
              modeContext.getConfigPath(),
              "utf8"
            );
            expect(configContent).toContain("opencode: true");
          })
        );

        it(
          "should reject project-only host zed for user configuration",
          withProcess(async spawn => {
            const result = await spawn(["host", "add", "zed", "--user"], {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            });

            expect(result.exitCode).not.toBe(0);
            expect(result.stderr).toContain(
              "Host 'zed' cannot be added to user configuration"
            );
            expect(result.stderr).toContain(
              "Host 'zed' only supports project-level configuration"
            );

            // Verify host was NOT added to user config
            const configContent = await fs.promises.readFile(
              modeContext.getConfigPath(),
              "utf8"
            );
            expect(configContent).not.toContain("zed: true");
          })
        );

        it(
          "should reject project-only host vscode for user configuration",
          withProcess(async spawn => {
            const result = await spawn(["host", "add", "vscode", "--user"], {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
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
              modeContext.getConfigPath(),
              "utf8"
            );
            expect(configContent).not.toContain("vscode: true");
          })
        );

        it(
          "should display host management message for user configuration",
          withProcess(async spawn => {
            // Note: We can't fully test interactive prompts in an automated test
            // but we can verify the command starts correctly
            const result = await spawn(["host", "manage", "--user"], {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: {
                ...process.env,
                ...modeContext.env,
                // Force non-interactive mode to get predictable output
                CI: "true",
              },
            });

            // In CI mode it will fail but we can see the start of the command
            expect(result.stderr).toContain(
              "Starting interactive host management"
            );
          })
        );

        it(
          "should fail when user config directory doesn't exist",
          withProcess(async spawn => {
            // Remove user config directory
            await fs.promises.rm(modeContext.getConfigDir(), {
              recursive: true,
              force: true,
            });

            const result = await spawn(
              ["host", "add", "claude-code", "--user"],
              {
                cwd: baseTempDir,
                buffer: true,
                env: { ...process.env, ...modeContext.env },
              }
            );

            expect(result.exitCode).not.toBe(0);
            const stderr = String(result.stderr ?? "");

            // When user directory doesn't exist, it shows "No mcpadre user configuration file found"
            expect(
              findLogMessageInJSONL(
                stderr,
                "No mcpadre user configuration file found"
              )
            ).toBe(true);
          })
        );
      });
    } else {
      describe("project-specific host commands", () => {
        it(
          "should add zed to project configuration",
          withProcess(async spawn => {
            const result = await spawn(["host", "add", "zed"], {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toContain(
              "Added host 'zed' to project configuration"
            );

            // Verify host was added
            const updatedConfig = await fs.promises.readFile(
              modeContext.getConfigPath(),
              "utf8"
            );
            expect(updatedConfig).toContain("zed: true");
          })
        );

        it(
          "should add host to existing hosts configuration",
          withProcess(async spawn => {
            // First add one host
            await spawn(["host", "add", "zed"], {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            });

            // Then add another
            const result = await spawn(["host", "add", "cursor"], {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toContain(
              "Added host 'cursor' to project configuration"
            );
            expect(result.stderr).toContain(
              "Run 'mcpadre install' to generate MCP configuration files for enabled hosts"
            );

            // Verify both hosts are present
            const updatedConfig = await fs.promises.readFile(
              modeContext.getConfigPath(),
              "utf8"
            );
            expect(updatedConfig).toContain("zed: true");
            expect(updatedConfig).toContain("cursor: true");
          })
        );

        it(
          "should remove hosts field when removing last host",
          withProcess(async spawn => {
            // First add one host to ensure we have it
            await spawn(["host", "add", "cursor"], {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            });

            // Then remove cursor, which should be the last host
            const result = await spawn(["host", "remove", "cursor"], {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toContain(
              "Removed host 'cursor' from project configuration"
            );
            expect(result.stderr).toContain(
              "mcpadre will no longer manage '.cursor/mcp.json' for cursor"
            );

            // Verify hosts field is gone entirely or empty
            const updatedConfig = await fs.promises.readFile(
              modeContext.getConfigPath(),
              "utf8"
            );

            // Either the hosts field is completely gone, or it's empty
            const noHostsField = !updatedConfig.includes("hosts:");
            const emptyHostsField =
              updatedConfig.includes("hosts:") &&
              !updatedConfig.includes("cursor: true");

            expect(noHostsField || emptyHostsField).toBe(true);
          })
        );

        it(
          "should work with JSON config",
          withProcess(async spawn => {
            // Create a project with JSON config
            const jsonProject = await createTempProject({
              config: {
                version: 1 as const,
                mcpServers: {
                  "test-server": {
                    http: {
                      url: "http://example.com",
                      headers: {},
                    },
                  },
                },
              },
              format: "json",
            });

            try {
              // Add a host
              const result = await spawn(["host", "add", "cursor"], {
                cwd: jsonProject.path,
                buffer: true,
              });

              expect(result.exitCode).toBe(0);
              expect(result.stderr).toContain(
                "Added host 'cursor' to project configuration"
              );

              // Verify config was updated and still in JSON format
              const updatedConfig = await fs.promises.readFile(
                jsonProject.configPath,
                "utf8"
              );
              const parsedConfig = JSON.parse(updatedConfig);
              expect(parsedConfig.hosts).toEqual({ cursor: true });
              expect(jsonProject.configPath.endsWith(".json")).toBe(true);
            } finally {
              await jsonProject.cleanup();
            }
          })
        );
      });
    }
  });

  // Test isolation between user and project modes
  describe("host commands isolation", () => {
    it(
      "should not affect project config when using --user flag",
      withProcess(async spawn => {
        // Create temporary directory
        const tempIsolationDir = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), "mcpadre-isolation-test-")
        );

        try {
          // Create user config directory
          const userDir = path.join(tempIsolationDir, ".mcpadre");
          await fs.promises.mkdir(userDir, { recursive: true });

          // Create initial user config
          const userConfigPath = path.join(userDir, "mcpadre.yaml");
          await fs.promises.writeFile(
            userConfigPath,
            `
version: 1
mcpServers:
  test-server:
    http:
      url: "http://example.com"
hosts:
  cursor: true
`,
            "utf8"
          );

          // Create project config
          const projectConfigPath = path.join(tempIsolationDir, "mcpadre.yaml");
          await fs.promises.writeFile(
            projectConfigPath,
            `
version: 1
mcpServers:
  project-server:
    http:
      url: "http://project.example.com"
hosts:
  zed: true
`,
            "utf8"
          );

          // Add host to user config
          const result = await spawn(["host", "add", "claude-code", "--user"], {
            cwd: tempIsolationDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userDir },
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
          const userContent = await fs.promises.readFile(
            userConfigPath,
            "utf8"
          );
          expect(userContent).toContain("claude-code: true");
          expect(userContent).toContain("cursor: true"); // Original user host
          expect(userContent).not.toContain("zed: true");
        } finally {
          await fs.promises.rm(tempIsolationDir, {
            recursive: true,
            force: true,
          });
        }
      })
    );

    it(
      "should not affect user config when using project mode",
      withProcess(async spawn => {
        // Create temporary directory
        const tempIsolationDir = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), "mcpadre-isolation-test-")
        );

        try {
          // Create user config directory
          const userDir = path.join(tempIsolationDir, ".mcpadre");
          await fs.promises.mkdir(userDir, { recursive: true });

          // Create initial user config with cursor host
          const userConfigPath = path.join(userDir, "mcpadre.yaml");
          await fs.promises.writeFile(
            userConfigPath,
            `
version: 1
mcpServers:
  test-server:
    http:
      url: "http://example.com"
hosts:
  cursor: true
`,
            "utf8"
          );

          // Create empty project config
          const projectConfigPath = path.join(tempIsolationDir, "mcpadre.yaml");
          await fs.promises.writeFile(
            projectConfigPath,
            `
version: 1
mcpServers:
  project-server:
    http:
      url: "http://project.example.com"
`,
            "utf8"
          );

          // Add host to project config (without --user flag)
          const result = await spawn(["host", "add", "zed"], {
            cwd: tempIsolationDir,
            buffer: true,
            env: { ...process.env, MCPADRE_USER_DIR: userDir },
          });

          expect(result.exitCode).toBe(0);

          // Verify user config is unchanged
          const userContent = await fs.promises.readFile(
            userConfigPath,
            "utf8"
          );
          expect(userContent).toContain("cursor: true");
          expect(userContent).not.toContain("zed: true");

          // Verify project config was updated
          const projectContent = await fs.promises.readFile(
            projectConfigPath,
            "utf8"
          );
          expect(projectContent).toContain("zed: true");
          expect(projectContent).not.toContain("cursor: true");
        } finally {
          await fs.promises.rm(tempIsolationDir, {
            recursive: true,
            force: true,
          });
        }
      })
    );
  });
});
