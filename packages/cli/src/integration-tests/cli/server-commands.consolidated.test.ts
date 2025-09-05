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
import { withProcess } from "../helpers/spawn-cli-v2.js";

describe("Server Commands Integration (Consolidated)", () => {
  describe.each([
    {
      mode: "user",
      setupContext: async (dirPath: string) => {
        // Create user config directory
        const userDir = path.join(dirPath, ".mcpadre");
        await fs.promises.mkdir(userDir, { recursive: true });

        // Create initial user config with one server
        const initialUserConfig = `
version: 1
mcpServers:
  user-echo:
    node:
      package: "@test/user-echo-server"
      version: "1.0.0"
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
            echo: {
              node: {
                package: "@test/echo-server",
                version: "1.0.0",
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
    let serverSpecPath: string;

    beforeEach(async () => {
      baseTempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "mcpadre-test-")
      );

      // Create ServerSpec file with multiple servers
      serverSpecPath = path.join(baseTempDir, "servers.json");
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

    describe(`server remove (${mode} mode)`, () => {
      it(
        `should remove an existing server from ${mode} config with --yes flag`,
        withProcess(async spawn => {
          console.log(`=== DEBUG: Server remove test (${mode} mode) ===`);

          // Get the server name based on mode
          const serverName = mode === "user" ? "user-echo" : "echo";

          console.log("Test environment:");
          console.log("  GITHUB_ACTIONS:", process.env["GITHUB_ACTIONS"]);
          console.log("  CI:", process.env["CI"]);
          console.log("  Mode:", mode);
          console.log("  Server name:", serverName);
          console.log(
            "  modeContext.getConfigDir():",
            modeContext.getConfigDir()
          );
          console.log("  modeContext.env:", JSON.stringify(modeContext.env));

          const commandArgs = [
            "server",
            "remove",
            serverName,
            "--yes",
            ...(mode === "user" ? ["--user"] : []),
          ];
          console.log("  Command args:", commandArgs);

          const result = await spawn(commandArgs, {
            cwd: modeContext.getConfigDir(),
            buffer: true,
            env: { ...process.env, ...modeContext.env },
          });

          console.log("Command result:");
          console.log("  Exit code:", result.exitCode);
          console.log("  Stdout:", JSON.stringify(result.stdout));
          console.log("  Stderr:", JSON.stringify(result.stderr));
          console.log("  Stdout length:", result.stdout?.length ?? 0);
          console.log("  Stderr length:", result.stderr?.length ?? 0);

          const expectedMessage = `Successfully removed server: ${serverName}`;
          console.log("Expected vs Actual stdout content:");
          console.log(
            "  Expected to contain:",
            JSON.stringify(expectedMessage)
          );
          console.log(
            "  Actual stdout contains it:",
            (result.stdout as string | undefined)?.includes(expectedMessage)
          );

          expect(result.exitCode).toBe(0);

          // Verify server was actually removed from config
          const configContent = await fs.promises.readFile(
            modeContext.getConfigPath(),
            "utf8"
          );
          expect(configContent).not.toContain(`${serverName}:`);
        })
      );

      it(
        `should fail when trying to remove non-existent server from ${mode} config`,
        withProcess(async spawn => {
          const result = await spawn(
            [
              "server",
              "remove",
              "nonexistent",
              "--yes",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain("Server 'nonexistent' not found");
        })
      );

      it(
        `should require --yes flag in non-interactive ${mode} mode`,
        withProcess(async spawn => {
          // Get the server name based on mode
          const serverName = mode === "user" ? "user-echo" : "echo";

          const result = await spawn(
            [
              "server",
              "remove",
              serverName,
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: {
                ...process.env,
                ...modeContext.env,
                CI: "true", // Force non-interactive
              },
            }
          );

          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain(
            "Non-interactive mode requires --yes flag"
          );
        })
      );
    });

    describe(`server add (${mode} mode)`, () => {
      it(
        `should add single server to ${mode} config with --server-name flag`,
        withProcess(async spawn => {
          const result = await spawn(
            [
              "server",
              "add",
              serverSpecPath,
              "--server-name",
              "filesystem",
              "--yes",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain("Successfully added 1 server(s)");

          // Verify server was added to config
          const configContent = await fs.promises.readFile(
            modeContext.getConfigPath(),
            "utf8"
          );
          expect(configContent).toContain("filesystem:");
        })
      );

      it(
        `should add all servers to ${mode} config with --all flag`,
        withProcess(async spawn => {
          const result = await spawn(
            [
              "server",
              "add",
              serverSpecPath,
              "--all",
              "--yes",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain("Successfully added 3 server(s)");

          // Verify all servers were added to config
          const configContent = await fs.promises.readFile(
            modeContext.getConfigPath(),
            "utf8"
          );
          expect(configContent).toContain("filesystem:");
          expect(configContent).toContain("database:");
          expect(configContent).toContain("api:");
        })
      );

      it(
        `should auto-select single server from ServerSpec for ${mode} config`,
        withProcess(async spawn => {
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
          const singleSpecPath = path.join(baseTempDir, "single.json");
          await fs.promises.writeFile(
            singleSpecPath,
            JSON.stringify(singleServerSpec, null, 2)
          );

          const result = await spawn(
            [
              "server",
              "add",
              singleSpecPath,
              "--yes",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain("Auto-selected server: single");

          // Verify server was added to config
          const configContent = await fs.promises.readFile(
            modeContext.getConfigPath(),
            "utf8"
          );
          expect(configContent).toContain("single:");
        })
      );

      it(
        `should handle YAML ServerSpec files for ${mode} config`,
        withProcess(async spawn => {
          const yamlSpecPath = path.join(baseTempDir, "servers.yaml");
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
            [
              "server",
              "add",
              yamlSpecPath,
              "--yes",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain("Auto-selected server: yaml-server");

          // Verify server was added to config
          const configContent = await fs.promises.readFile(
            modeContext.getConfigPath(),
            "utf8"
          );
          expect(configContent).toContain("yaml-server:");
        })
      );

      it(
        `should fail when requesting non-existent server for ${mode} config`,
        withProcess(async spawn => {
          const result = await spawn(
            [
              "server",
              "add",
              serverSpecPath,
              "--server-name",
              "nonexistent",
              "--yes",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain(
            "Server 'nonexistent' not found in ServerSpec"
          );
        })
      );

      it(
        `should require selection method in non-interactive mode for multiple servers (${mode} mode)`,
        withProcess(async spawn => {
          const result = await spawn(
            [
              "server",
              "add",
              serverSpecPath,
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: {
                ...process.env,
                ...modeContext.env,
                CI: "true", // Force non-interactive
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
        `should handle existing server name conflicts in ${mode} config`,
        withProcess(async spawn => {
          // Get the server name based on mode
          const serverName = mode === "user" ? "user-echo" : "echo";

          // Try to add a server with same name as existing one
          const conflictSpec = {
            version: 1,
            mcpServers: {
              [serverName]: {
                // Same name as existing server
                python: {
                  package: "different-echo-server",
                  version: "2.0.0",
                },
              },
            },
          };
          const conflictSpecPath = path.join(baseTempDir, "conflict.json");
          await fs.promises.writeFile(
            conflictSpecPath,
            JSON.stringify(conflictSpec, null, 2)
          );

          const result = await spawn(
            [
              "server",
              "add",
              conflictSpecPath,
              "--yes",
              ...(mode === "user" ? ["--user"] : []),
            ],
            {
              cwd: modeContext.getConfigDir(),
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain("Successfully added 1 server(s)");

          // Should overwrite existing server
          const configContent = await fs.promises.readFile(
            modeContext.getConfigPath(),
            "utf8"
          );
          expect(configContent).toContain(`${serverName}:`);
          expect(configContent).toContain("python");
          expect(configContent).toContain("different-echo-server");
        })
      );
    });

    // Mode-specific tests
    if (mode === "user") {
      describe("user-specific tests", () => {
        it(
          "should fail when user config directory doesn't exist",
          withProcess(async spawn => {
            // Remove user config directory
            await fs.promises.rm(modeContext.getConfigDir(), {
              recursive: true,
              force: true,
            });

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
                cwd: baseTempDir,
                buffer: true,
                env: { ...process.env, ...modeContext.env },
              }
            );

            expect(result.exitCode).not.toBe(0);
            expect(result.stderr).toContain(
              "User configuration directory does not exist"
            );
          })
        );
      });
    } else {
      describe("project-specific tests", () => {
        it(
          "should work with TOML ServerSpec files",
          withProcess(async spawn => {
            const tomlSpecPath = path.join(baseTempDir, "servers.toml");
            const tomlContent = `
version = 1

[mcpServers.toml-server.node]
package = "@test/toml-server"
version = "1.2.3"
`;
            await fs.promises.writeFile(tomlSpecPath, tomlContent, "utf8");

            const result = await spawn(
              ["server", "add", tomlSpecPath, "--yes"],
              {
                cwd: modeContext.getConfigDir(),
                buffer: true,
                env: { ...process.env, ...modeContext.env },
              }
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
              "Auto-selected server: toml-server"
            );

            // Verify server was added
            const configContent = await fs.promises.readFile(
              modeContext.getConfigPath(),
              "utf8"
            );
            expect(configContent).toContain("toml-server:");
            expect(configContent).toContain("@test/toml-server");
          })
        );
      });
    }
  });

  // Test isolation between user and project modes
  describe("server commands isolation", () => {
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
  user-echo:
    node:
      package: "@test/user-echo-server"
      version: "1.0.0"
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
    node:
      package: "@test/project-server"
      version: "1.0.0"
`,
            "utf8"
          );

          // Create a server spec file
          const serverSpecPath = path.join(tempIsolationDir, "servers.json");
          const serverSpec = {
            version: 1,
            mcpServers: {
              filesystem: {
                node: {
                  package: "@test/filesystem-server",
                  version: "2.0.0",
                },
              },
            },
          };
          await fs.promises.writeFile(
            serverSpecPath,
            JSON.stringify(serverSpec, null, 2),
            "utf8"
          );

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
              cwd: tempIsolationDir,
              buffer: true,
              env: { ...process.env, MCPADRE_USER_DIR: userDir },
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
          const userContent = await fs.promises.readFile(
            userConfigPath,
            "utf8"
          );
          expect(userContent).toContain("filesystem:");
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

          // Create initial user config
          const userConfigPath = path.join(userDir, "mcpadre.yaml");
          await fs.promises.writeFile(
            userConfigPath,
            `
version: 1
mcpServers:
  user-echo:
    node:
      package: "@test/user-echo-server"
      version: "1.0.0"
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
    node:
      package: "@test/project-server"
      version: "1.0.0"
`,
            "utf8"
          );

          // Create a server spec file
          const serverSpecPath = path.join(tempIsolationDir, "servers.json");
          const serverSpec = {
            version: 1,
            mcpServers: {
              filesystem: {
                node: {
                  package: "@test/filesystem-server",
                  version: "2.0.0",
                },
              },
            },
          };
          await fs.promises.writeFile(
            serverSpecPath,
            JSON.stringify(serverSpec, null, 2),
            "utf8"
          );

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
              cwd: tempIsolationDir,
              buffer: true,
              env: { ...process.env, MCPADRE_USER_DIR: userDir },
            }
          );

          expect(result.exitCode).toBe(0);

          // Verify user config is unchanged
          const userContent = await fs.promises.readFile(
            userConfigPath,
            "utf8"
          );
          expect(userContent).toContain("user-echo:");
          expect(userContent).not.toContain("filesystem:");

          // Verify project config was updated
          const projectContent = await fs.promises.readFile(
            projectConfigPath,
            "utf8"
          );
          expect(projectContent).toContain("project-server:");
          expect(projectContent).toContain("filesystem:");
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
