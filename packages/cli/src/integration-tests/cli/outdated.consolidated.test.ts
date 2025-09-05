// pattern: Imperative Shell

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createTempProject,
  createTestProjectConfig,
  type TempProject,
  type TempProjectConfig,
} from "../../test-utils/project/temp-project.js";
import {
  createProjectModeContext,
  createUserModeContext,
  ModeContext,
} from "../helpers/mode-test-utils.js";
import { withProcess } from "../helpers/spawn-cli-v2.js";

import type { CommandStringTemplate } from "../../config/types/index.js";

// Helper to parse JSON output safely
function parseJsonOutput(stdout: unknown): any {
  expect(typeof stdout).toBe("string");
  return JSON.parse(stdout as string);
}

describe("mcpadre Outdated Command Integration (Consolidated)", () => {
  describe.each([
    {
      mode: "user",
      setupContext: async (_dirPath: string) => {
        // Create a project config
        const projectConfig = createTestProjectConfig(
          "project-server",
          "http://localhost:3000"
        );

        const tempProject = await createTempProject({
          config: projectConfig,
          format: "yaml",
          prefix: "outdated-user-",
        });

        // Create separate user directory and config with a simple server
        const userDir = join(tempProject.path, "user-home");
        await mkdir(userDir, { recursive: true });

        const userConfigContent = `
version: 1
mcpServers:
  user-server:
    shell:
      command: "echo hello"
`;

        const userConfigPath = join(userDir, "mcpadre.yaml");
        await writeFile(userConfigPath, userConfigContent);

        // Create a context with the user directory
        const context = createUserModeContext(tempProject.path);
        context.env = { ...context.env, MCPADRE_USER_DIR: userDir };

        return {
          context,
          tempProject,
          userDir,
        };
      },
      getCommand: (format = "json") =>
        format === "json"
          ? ["outdated", "--user", "--json"]
          : ["outdated", "--user"],
    },
    {
      mode: "project",
      setupContext: async () => {
        // Create project with known outdated packages
        const config: TempProjectConfig = {
          config: {
            version: 1,
            mcpServers: {
              "desktop-commander-outdated": {
                node: {
                  package: "@wonderwhy-er/desktop-commander",
                  version: "0.2.9", // 0.2.10 is available
                },
              },
              "mcp-sleep-outdated": {
                python: {
                  package: "mcp-sleep",
                  version: "0.1.0", // 0.1.1 is available
                },
              },
            },
            hosts: {
              "claude-code": true,
            },
          },
          format: "yaml",
          prefix: "mcpadre-outdated-project-",
        };

        const tempProject = await createTempProject(config);
        const context = createProjectModeContext(tempProject);

        return {
          context,
          tempProject,
        };
      },
      getCommand: (format = "json") =>
        format === "json" ? ["outdated", "--json"] : ["outdated"],
    },
  ])("$mode mode", ({ mode, setupContext, getCommand }) => {
    let setupResult: any;
    let modeContext: ModeContext;
    let tempProject: TempProject;
    let userDir: string | undefined;

    beforeEach(async () => {
      // Set up the appropriate context
      setupResult = await setupContext("");
      modeContext = setupResult.context;
      tempProject = setupResult.tempProject;
      userDir = setupResult.userDir;

      await modeContext.setup();
    });

    afterEach(async () => {
      await tempProject.cleanup();
    });

    it(
      `should check ${mode === "user" ? "user" : "project"} servers for updates`,
      withProcess(async spawn => {
        const result = await spawn(getCommand("json"), {
          cwd: tempProject.path,
          buffer: true,
          env: { ...process.env, ...modeContext.env },
        });

        // Should succeed with expected output
        expect(result.exitCode).toBe(mode === "user" ? 0 : 1); // Project mode has outdated packages

        // Parse JSON output
        expect(result.stdout).toBeTruthy();
        const output = parseJsonOutput(result.stdout);
        expect(output).toHaveProperty("servers");
        expect(output.servers).toBeInstanceOf(Array);

        if (mode === "user") {
          // Should find user servers, not project servers
          const serverNames = output.servers.map((s: any) => s.serverName);
          expect(serverNames).toContain("user-server");
          expect(serverNames).not.toContain("project-server");
        } else {
          // Project mode should find outdated packages
          expect(output.servers).toHaveLength(2);
          expect(output.summary.outdated).toBe(2);

          // Verify specific outdated packages
          const desktopCommander = output.servers.find(
            (s: any) => s.serverName === "desktop-commander-outdated"
          );
          expect(desktopCommander).toBeDefined();
          expect(desktopCommander.currentVersion).toBe("0.2.9");
          // Don't test for specific latest version, just that it's different and newer
          expect(desktopCommander.latestVersion).not.toBe(
            desktopCommander.currentVersion
          );
          expect(desktopCommander.isOutdated).toBe(true);

          const mcpSleep = output.servers.find(
            (s: any) => s.serverName === "mcp-sleep-outdated"
          );
          expect(mcpSleep).toBeDefined();
          expect(mcpSleep.currentVersion).toBe("0.1.0");
          // Don't test for specific latest version, just that it's different and newer
          expect(mcpSleep.latestVersion).not.toBe(mcpSleep.currentVersion);
          expect(mcpSleep.isOutdated).toBe(true);
        }
      })
    );

    it(
      `should use table format output by default in ${mode} mode`,
      withProcess(async spawn => {
        const result = await spawn(
          getCommand("table"), // Use table format
          {
            cwd: tempProject.path,
            buffer: true,
            env: { ...process.env, ...modeContext.env },
          }
        );

        // Should succeed and show table format
        expect(result.exitCode).toBe(mode === "user" ? 0 : 1);
        expect(result.stdout).toContain("Summary:");
        expect(result.stdout).toContain("servers checked");

        if (mode === "project") {
          // Strip ANSI escape codes for easier testing
          const ESC = "\u001b";
          const cleanOutput = (result.stdout as string).replace(
            new RegExp(`${ESC}\\[[0-9;]*[a-zA-Z]`, "g"),
            ""
          );

          // Should contain table output with the server names
          expect(cleanOutput).toMatch(/desktop-commander/);
          expect(cleanOutput).toContain("mcp-sleep-outdated");
          // Check that current versions are shown
          expect(cleanOutput).toContain("0.2.9");
          expect(cleanOutput).toContain("0.1.0");
          // Don't check for specific latest versions, just that the table has version info
          expect(cleanOutput).toMatch(/Current.*Latest/i);
        }
      })
    );

    // Add mode-specific tests
    if (mode === "user") {
      it(
        "should work without user servers (empty config)",
        withProcess(async spawn => {
          // Create empty user config for this test
          const emptyUserConfigContent = `
version: 1
mcpServers: {}
`;
          const userConfigPath = join(userDir!, "mcpadre.yaml");
          await writeFile(userConfigPath, emptyUserConfigContent);

          const result = await spawn(getCommand("json"), {
            cwd: tempProject.path,
            buffer: true,
            env: { ...process.env, ...modeContext.env },
          });

          // Should succeed with empty results
          expect(result.exitCode).toBe(0);

          // Parse JSON output
          expect(result.stdout).toBeTruthy();
          const output = parseJsonOutput(result.stdout);
          expect(output).toHaveProperty("servers");
          expect(output.servers).toEqual([]);
          expect(output.summary.total).toBe(0);
        })
      );
    } else {
      it(
        "should support --outdated-only filter",
        withProcess(async spawn => {
          const result = await spawn(
            ["outdated", "--outdated-only", "--json"],
            {
              cwd: tempProject.path,
              buffer: true,
              env: { ...process.env, ...modeContext.env },
            }
          );

          expect(result.exitCode).toBe(1); // Exit code 1 when outdated packages found

          // Verify we got output
          expect(typeof result.stdout).toBe("string");
          expect((result.stdout as string).length).toBeGreaterThan(0);

          const output = parseJsonOutput(result.stdout);
          // All 2 packages are outdated, so should show all 2
          expect(output.servers).toHaveLength(2);
          expect(output.servers.every((s: any) => s.isOutdated)).toBe(true);
        })
      );

      describe("up-to-date packages (project mode)", () => {
        let upToDateProject: TempProject;
        let upToDateContext: ModeContext;

        beforeEach(async () => {
          // Create project with a very old version that will always be outdated
          const config: TempProjectConfig = {
            config: {
              version: 1,
              mcpServers: {
                "desktop-commander-old": {
                  node: {
                    package: "@wonderwhy-er/desktop-commander",
                    version: "0.0.1", // Very old version that will always have updates available
                  },
                },
              },
              hosts: {
                "claude-code": true,
              },
            },
            format: "yaml",
            prefix: "mcpadre-uptodate-project-",
          };

          upToDateProject = await createTempProject(config);
          upToDateContext = createProjectModeContext(upToDateProject);
        });

        afterEach(async () => {
          await upToDateProject.cleanup();
        });

        it(
          "should detect outdated packages correctly",
          withProcess(async spawn => {
            const result = await spawn(["outdated", "--json"], {
              cwd: upToDateProject.path,
              buffer: true,
              env: { ...process.env, ...upToDateContext.env },
            });

            // Accept either 0 (no outdated packages) or 1 (some outdated packages)
            // The important part is that our test package reports as not outdated
            expect([0, 1]).toContain(result.exitCode);

            const output = parseJsonOutput(result.stdout);
            expect(output.summary.total).toBe(1);

            // Find our test server
            const server = output.servers.find(
              (s: any) => s.serverName === "desktop-commander-old"
            );
            expect(server).toBeDefined();

            // Check that the server has version information
            expect(server.currentVersion).toBe("0.0.1");
            expect(server.latestVersion).toBeDefined();

            // This old version should definitely be outdated
            expect(server.isOutdated).toBe(true);

            // The latest version should be different from current
            expect(server.latestVersion).not.toBe(server.currentVersion);
          })
        );

        it(
          "should show results with --outdated-only filter",
          withProcess(async spawn => {
            const result = await spawn(
              ["outdated", "--outdated-only", "--json"],
              {
                cwd: upToDateProject.path,
                buffer: true,
                env: { ...process.env, ...upToDateContext.env },
              }
            );

            // Since we're using a very old version, it should be outdated
            expect(result.exitCode).toBe(1);

            const output = parseJsonOutput(result.stdout);
            // Should show the outdated package
            expect(output.servers).toHaveLength(1);
            expect(output.servers[0].isOutdated).toBe(true);
          })
        );
      });
    }
  });

  // Test isolation between user and project modes
  describe("outdated command isolation", () => {
    it(
      "should check only user config with --user flag",
      withProcess(async spawn => {
        // Create temporary directory with both user and project configs
        const tempDir = await createTempProject({
          config: {
            version: 1,
            mcpServers: {
              "project-server": {
                shell: {
                  command: "echo project" as CommandStringTemplate,
                },
              },
            },
          },
          format: "yaml",
          prefix: "outdated-isolation-",
        });

        try {
          // Create user config directory
          const userDir = join(tempDir.path, ".mcpadre");
          await mkdir(userDir, { recursive: true });

          // Create user config with different server
          const userConfigContent = `
version: 1
mcpServers:
  user-server:
    shell:
      command: "echo"
      args: ["user"]
`;
          const userConfigPath = join(userDir, "mcpadre.yaml");
          await writeFile(userConfigPath, userConfigContent);

          // Run outdated command with --user flag
          const result = await spawn(["outdated", "--user", "--json"], {
            cwd: tempDir.path,
            buffer: true,
            env: {
              ...process.env,
              MCPADRE_USER_DIR: userDir,
            },
          });

          expect(result.exitCode).toBe(0);

          // Verify it only checked user servers
          const output = parseJsonOutput(result.stdout);
          const serverNames = output.servers.map((s: any) => s.serverName);
          expect(serverNames).toContain("user-server");
          expect(serverNames).not.toContain("project-server");
        } finally {
          await tempDir.cleanup();
        }
      })
    );

    it(
      "should check only project config without --user flag",
      withProcess(async spawn => {
        // Create temporary directory with both user and project configs
        const tempDir = await createTempProject({
          config: {
            version: 1,
            mcpServers: {
              "project-server": {
                shell: {
                  command: "echo project" as CommandStringTemplate,
                },
              },
            },
          },
          format: "yaml",
          prefix: "outdated-isolation-project-",
        });

        try {
          // Create user config directory
          const userDir = join(tempDir.path, ".mcpadre");
          await mkdir(userDir, { recursive: true });

          // Create user config with different server
          const userConfigContent = `
version: 1
mcpServers:
  user-server:
    shell:
      command: "echo"
      args: ["user"]
`;
          const userConfigPath = join(userDir, "mcpadre.yaml");
          await writeFile(userConfigPath, userConfigContent);

          // Run outdated command without --user flag (project mode)
          const result = await spawn(["outdated", "--json"], {
            cwd: tempDir.path,
            buffer: true,
            env: {
              ...process.env,
              MCPADRE_USER_DIR: userDir,
            },
          });

          expect(result.exitCode).toBe(0);

          // Verify it only checked project servers
          const output = parseJsonOutput(result.stdout);
          const serverNames = output.servers.map((s: any) => s.serverName);
          expect(serverNames).toContain("project-server");
          expect(serverNames).not.toContain("user-server");
        } finally {
          await tempDir.cleanup();
        }
      })
    );
  });
});
