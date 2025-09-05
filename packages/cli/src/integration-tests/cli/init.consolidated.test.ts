// pattern: Imperative Shell

import { existsSync } from "fs";
import fs from "fs";
import { readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import {
  createProjectModeContext,
  createUserModeContext,
  ModeContext,
} from "../helpers/mode-test-utils.js";
import { withProcess } from "../helpers/spawn-cli-v2.js";

import type { TempProject } from "../../test-utils/project/temp-project.js";

interface ModeConfig {
  mode: string;
  setupContext: (
    dirPath: string
  ) => Promise<
    ModeContext | { context: ModeContext; tempProject: TempProject }
  >;
  getInitCommand: (hostName: string) => string[];
  getConfigPath: (dirPath: string) => string;
  getSuccessMessage: () => string;
  getValidHosts: () => string[];
  getInvalidHosts: () => string[];
}

describe("mcpadre Init Command Integration (Consolidated)", () => {
  describe.each<ModeConfig>([
    {
      mode: "user",
      setupContext: async (dirPath: string) => {
        // Create user config directory
        const userDir = path.join(dirPath, ".mcpadre");
        await fs.promises.mkdir(userDir, { recursive: true });

        return createUserModeContext(dirPath);
      },
      getInitCommand: (hostName: string) => [
        "init",
        "--user",
        "--host",
        hostName,
      ],
      getConfigPath: (dirPath: string) =>
        path.join(dirPath, ".mcpadre", "mcpadre.yaml"),
      getSuccessMessage: () => "Created mcpadre user configuration:",
      getValidHosts: () => [
        "claude-code",
        "claude-desktop",
        "cursor",
        "opencode",
      ],
      getInvalidHosts: () => ["zed", "vscode"],
    },
    {
      mode: "project",
      setupContext: async (_dirPath: string) => {
        // Create minimal temp directory for init tests (without mcpadre config)
        const tempProject = await createTempProject({
          config: {
            version: 1,
            env: {},
            mcpServers: {},
            hosts: {},
          },
          format: "yaml",
        });

        // Remove the config file since we want to test init from scratch
        const configPath = path.join(tempProject.path, "mcpadre.yaml");
        if (existsSync(configPath)) {
          await fs.promises.unlink(configPath);
        }

        return {
          context: createProjectModeContext(tempProject),
          tempProject,
        };
      },
      getInitCommand: (hostName: string) => ["init", "--host", hostName],
      getConfigPath: (dirPath: string) => path.join(dirPath, "mcpadre.yaml"),
      getSuccessMessage: () => "Created mcpadre project configuration:",
      getValidHosts: () => [
        "claude-code",
        "cursor",
        "opencode",
        "zed",
        "vscode",
      ],
      getInvalidHosts: () => [],
    },
  ])(
    "$mode mode",
    ({
      mode,
      setupContext,
      getInitCommand,
      getConfigPath,
      getSuccessMessage,
      getValidHosts,
      getInvalidHosts,
    }) => {
      let baseTempDir: string;
      let modeContext: ModeContext;
      let tempProject: TempProject | undefined;
      let configDir!: string;

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
          configDir = tempProject.path;
        } else {
          // User mode setup returns just the context
          modeContext = setupResult;
          configDir = baseTempDir;
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

      it(
        `should create ${mode} config with valid host`,
        withProcess(async spawn => {
          // Choose the first valid host for the current mode
          const validHost = getValidHosts()[0]!;

          const result = await spawn(getInitCommand(validHost), {
            cwd: configDir as string,
            buffer: true,
            env: {
              ...process.env,
              ...modeContext.env,
              CI: "true", // Non-interactive mode
            },
          });

          expect(result.exitCode).toBe(0);
          expect(result.stderr).toContain(getSuccessMessage());
          expect(result.stderr).toContain(
            `"msg":"Enabled hosts: ${validHost}"`
          );

          // Verify config file was created
          const configPath = getConfigPath(configDir);
          const configContent = await readFile(configPath, "utf-8");

          expect(configContent).toContain("version: 1");
          expect(configContent).toContain(`${validHost}: true`);
        })
      );

      if (getInvalidHosts().length > 0) {
        it(
          `should reject incompatible hosts in ${mode} mode`,
          withProcess(async spawn => {
            // Choose the first invalid host for the current mode
            const invalidHost = getInvalidHosts()[0]!;

            const result = await spawn(getInitCommand(invalidHost), {
              cwd: configDir as string,
              buffer: true,
              env: {
                ...process.env,
                ...modeContext.env,
                CI: "true", // Non-interactive mode
              },
            });

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("not supported in user mode");
            expect(result.stderr).toContain(invalidHost);
          })
        );
      }

      it(
        `should fail when no hosts specified in ${mode} mode`,
        withProcess(async spawn => {
          // Remove the --host parameter from the command
          const baseCommand = mode === "user" ? ["init", "--user"] : ["init"];

          const result = await spawn(baseCommand, {
            cwd: configDir,
            buffer: true,
            env: {
              ...process.env,
              ...modeContext.env,
              CI: "true", // Non-interactive mode
            },
          });

          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain("at least one --host flag");

          // Verify that valid hosts for this mode are shown in the error message
          for (const validHost of getValidHosts()) {
            expect(result.stderr).toContain(validHost);
          }
        })
      );

      it(
        `should handle typos in host names in ${mode} mode`,
        withProcess(async spawn => {
          // Use a misspelled host name
          const typoHost = "cursur"; // Typo for "cursor"

          const command =
            mode === "user"
              ? ["init", "--user", "--host", typoHost]
              : ["init", "--host", typoHost];

          const result = await spawn(command, {
            cwd: configDir,
            buffer: true,
            env: {
              ...process.env,
              ...modeContext.env,
              CI: "true", // Non-interactive mode
            },
          });

          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain("Invalid host");
          expect(result.stderr).toContain("Did you mean: cursor");
        })
      );

      // Add mode-specific tests
      if (mode === "project") {
        describe("project-specific tests", () => {
          it(
            "should create config with multiple hosts",
            withProcess(async spawn => {
              const result = await spawn(
                [
                  "init",
                  "--host",
                  "cursor",
                  "--host",
                  "zed",
                  "--host",
                  "vscode",
                ],
                {
                  cwd: configDir,
                  buffer: true,
                  env: {
                    ...process.env,
                    ...modeContext.env,
                    CI: "true", // Non-interactive mode
                  },
                }
              );

              expect(result.exitCode).toBe(0);
              expect(result.stderr).toContain(getSuccessMessage());
              expect(result.stderr).toContain(
                '"msg":"Enabled hosts: cursor, zed, vscode"'
              );

              // Verify config content
              const configPath = getConfigPath(configDir);
              const configContent = await readFile(configPath, "utf-8");
              expect(configContent).toContain("cursor: true");
              expect(configContent).toContain("zed: true");
              expect(configContent).toContain("vscode: true");
            })
          );

          it(
            "should detect existing config and fail without --force",
            withProcess(async spawn => {
              // First, create a config
              await spawn(["init", "--host", "cursor"], {
                cwd: configDir,
                buffer: true,
                env: {
                  ...process.env,
                  ...modeContext.env,
                  CI: "true", // Non-interactive mode
                },
              });

              // Try to init again without --force
              const result = await spawn(["init", "--host", "zed"], {
                cwd: configDir,
                buffer: true,
                env: {
                  ...process.env,
                  ...modeContext.env,
                  CI: "true", // Non-interactive mode
                },
              });

              expect(result.exitCode).toBe(1);
              expect(result.stderr).toContain(
                '"msg":"Configuration file already exists:'
              );
              expect(result.stderr).toContain(
                '"msg":"Use --force to overwrite the existing configuration"'
              );
            })
          );

          it(
            "should overwrite existing config with --force",
            withProcess(async spawn => {
              // First, create a config with cursor
              await spawn(["init", "--host", "cursor"], {
                cwd: configDir,
                buffer: true,
                env: {
                  ...process.env,
                  ...modeContext.env,
                  CI: "true", // Non-interactive mode
                },
              });

              // Verify initial config
              const configPath = getConfigPath(configDir);
              let configContent = await readFile(configPath, "utf-8");
              expect(configContent).toContain("cursor: true");
              expect(configContent).not.toContain("zed: true");

              // Overwrite with --force
              const result = await spawn(["init", "--host", "zed", "--force"], {
                cwd: configDir,
                buffer: true,
                env: {
                  ...process.env,
                  ...modeContext.env,
                  CI: "true", // Non-interactive mode
                },
              });

              expect(result.exitCode).toBe(0);
              expect(result.stderr).toContain(
                '"msg":"Overwrote existing configuration:'
              );
              expect(result.stderr).toContain('"msg":"Enabled hosts: zed"');

              // Verify config was overwritten
              configContent = await readFile(configPath, "utf-8");
              expect(configContent).toContain("zed: true");
              expect(configContent).not.toContain("cursor: true");
            })
          );

          it(
            "should create config in custom directory",
            withProcess(async spawn => {
              const result = await spawn(
                ["init", "--target", "custom-dir", "--host", "cursor"],
                {
                  cwd: configDir,
                  buffer: true,
                  env: {
                    ...process.env,
                    ...modeContext.env,
                    CI: "true", // Non-interactive mode
                  },
                }
              );

              expect(result.exitCode).toBe(0);
              expect(result.stderr).toContain(getSuccessMessage());
              expect(result.stderr).toContain("custom-dir/mcpadre.yaml");

              // Check that config file was created in custom directory
              const customConfigPath = path.join(
                configDir,
                "custom-dir",
                "mcpadre.yaml"
              );
              expect(existsSync(customConfigPath)).toBe(true);
            })
          );

          it(
            "should detect existing mcpadre.json",
            withProcess(async spawn => {
              // Create a JSON config file manually
              const jsonConfigPath = path.join(configDir, "mcpadre.json");
              await writeFile(jsonConfigPath, JSON.stringify({ version: 1 }));

              const result = await spawn(["init", "--host", "cursor"], {
                cwd: configDir,
                buffer: true,
                env: {
                  ...process.env,
                  ...modeContext.env,
                  CI: "true", // Non-interactive mode
                },
              });

              expect(result.exitCode).toBe(1);
              expect(result.stderr).toContain(
                '"msg":"Configuration file already exists:'
              );
              expect(result.stderr).toContain("mcpadre.json");
            })
          );
        });
      }
    }
  );

  // Test isolation between user and project modes
  describe("init command isolation", () => {
    it(
      "should create user config without affecting project directory",
      withProcess(async spawn => {
        // Create temporary directory
        const tempIsolationDir = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), "mcpadre-isolation-test-")
        );

        try {
          // Create user config directory
          const userDir = path.join(tempIsolationDir, ".mcpadre");
          await fs.promises.mkdir(userDir, { recursive: true });

          // Run user init
          const result = await spawn(
            ["init", "--user", "--host", "claude-code"],
            {
              cwd: tempIsolationDir,
              buffer: true,
              env: {
                ...process.env,
                MCPADRE_USER_DIR: userDir,
                CI: "true", // Non-interactive mode
              },
            }
          );

          expect(result.exitCode).toBe(0);
          expect(result.stderr).toContain(
            "Created mcpadre user configuration:"
          );

          // Verify user config was created
          const userConfigPath = path.join(userDir, "mcpadre.yaml");
          const userConfigExists = await fs.promises
            .access(userConfigPath)
            .then(() => true)
            .catch(() => false);
          expect(userConfigExists).toBe(true);

          // Verify no project config was created
          const projectConfigPath = path.join(tempIsolationDir, "mcpadre.yaml");
          const projectConfigExists = await fs.promises
            .access(projectConfigPath)
            .then(() => true)
            .catch(() => false);
          expect(projectConfigExists).toBe(false);
        } finally {
          await fs.promises.rm(tempIsolationDir, {
            recursive: true,
            force: true,
          });
        }
      })
    );

    it(
      "should create project config without affecting user directory",
      withProcess(async spawn => {
        // Create temporary directory
        const tempIsolationDir = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), "mcpadre-isolation-test-")
        );

        try {
          // Create user config directory
          const userDir = path.join(tempIsolationDir, ".mcpadre");
          await fs.promises.mkdir(userDir, { recursive: true });

          // Run project init
          const result = await spawn(["init", "--host", "zed"], {
            cwd: tempIsolationDir,
            buffer: true,
            env: {
              ...process.env,
              MCPADRE_USER_DIR: userDir,
              CI: "true", // Non-interactive mode
            },
          });

          expect(result.exitCode).toBe(0);
          expect(result.stderr).toContain(
            "Created mcpadre project configuration:"
          );

          // Verify project config was created
          const projectConfigPath = path.join(tempIsolationDir, "mcpadre.yaml");
          const projectConfigExists = await fs.promises
            .access(projectConfigPath)
            .then(() => true)
            .catch(() => false);
          expect(projectConfigExists).toBe(true);

          // Verify no user config was created
          const userConfigPath = path.join(userDir, "mcpadre.yaml");
          const userConfigExists = await fs.promises
            .access(userConfigPath)
            .then(() => true)
            .catch(() => false);
          expect(userConfigExists).toBe(false);
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
