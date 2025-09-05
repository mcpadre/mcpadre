// pattern: Testing Infrastructure

import fs from "fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import { type SpawnFunction, withProcess } from "../helpers/spawn-cli-v2.js";

import type { TempProject } from "../../test-utils/project/temp-project.js";

describe("Escape Navigation Integration", () => {
  let tempProject: TempProject;

  beforeEach(async () => {
    const baseConfig = {
      version: 1 as const,
      mcpServers: {},
    };

    tempProject = await createTempProject({
      config: baseConfig,
      format: "yaml",
    });
  });

  afterEach(async () => {
    await tempProject.cleanup();
  });

  describe("Server Add Command", () => {
    it(
      "should handle non-interactive mode with flags (no escape behavior)",
      withProcess(async (spawn: SpawnFunction) => {
        // Create a ServerSpec file with multiple servers
        const serverSpecContent = JSON.stringify(
          {
            version: 1,
            mcpServers: {
              server1: {
                python: {
                  package: "test-package1",
                  version: "1.0.0",
                },
              },
              server2: {
                python: {
                  package: "test-package2",
                  version: "2.0.0",
                },
              },
            },
          },
          null,
          2
        );

        const specPath = `${tempProject.path}/test-servers.json`;
        await tempProject.writeFile("test-servers.json", serverSpecContent);

        // Test non-interactive with --yes flag (should work without prompts)
        const result = await spawn(
          ["server", "add", specPath, "--all", "--yes"],
          {
            cwd: tempProject.path,
          }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Successfully added");
      })
    );

    it(
      "should handle single server auto-selection (no escape behavior needed)",
      withProcess(async (spawn: SpawnFunction) => {
        // Create a ServerSpec file with single server
        const serverSpecContent = JSON.stringify(
          {
            version: 1,
            mcpServers: {
              "single-server": {
                python: {
                  package: "single-package",
                  version: "1.0.0",
                },
              },
            },
          },
          null,
          2
        );

        const specPath = `${tempProject.path}/single-server.json`;
        await tempProject.writeFile("single-server.json", serverSpecContent);

        // Single server should auto-select and only need confirmation
        const result = await spawn(["server", "add", specPath, "--yes"], {
          cwd: tempProject.path,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Auto-selected server");
      })
    );

    it(
      "should require selection method when multiple servers are available",
      withProcess(async (spawn: SpawnFunction) => {
        // This test validates that proper error message is shown when no selection method is specified

        const serverSpecContent = JSON.stringify(
          {
            version: 1,
            mcpServers: {
              server1: { python: { package: "pkg1", version: "1.0.0" } },
              server2: { python: { package: "pkg2", version: "2.0.0" } },
            },
          },
          null,
          2
        );

        const specPath = `${tempProject.path}/multi-servers.json`;
        await tempProject.writeFile("multi-servers.json", serverSpecContent);

        // In non-TTY environment, should require selection method
        const result = await spawn(["server", "add", specPath], {
          cwd: tempProject.path,
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          "Multiple servers available but no selection method specified"
        );
      })
    );
  });

  describe("Server Remove Command", () => {
    beforeEach(async () => {
      // Add a server to remove
      const configWithServer = {
        version: 1 as const,
        mcpServers: {
          "test-server": {
            python: {
              package: "test-package",
              version: "1.0.0",
            },
          },
        },
      };

      await tempProject.updateConfig(configWithServer);
    });

    it(
      "should handle non-interactive removal with --yes flag",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(
          ["server", "remove", "test-server", "--yes"],
          {
            cwd: tempProject.path,
          }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Successfully removed server");
      })
    );

    it(
      "should require --yes flag in non-interactive mode",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(["server", "remove", "test-server"], {
          cwd: tempProject.path,
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          "Non-interactive mode requires --yes flag"
        );
      })
    );

    it(
      "should handle removal of non-existent server",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(
          ["server", "remove", "non-existent", "--yes"],
          {
            cwd: tempProject.path,
          }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("not found in configuration");
      })
    );
  });

  describe("State Machine Validation", () => {
    it(
      "should maintain configuration integrity across operations",
      withProcess(async (spawn: SpawnFunction) => {
        // Add servers
        const serverSpecContent = JSON.stringify(
          {
            version: 1,
            mcpServers: {
              server1: { python: { package: "pkg1", version: "1.0.0" } },
              server2: { python: { package: "pkg2", version: "2.0.0" } },
            },
          },
          null,
          2
        );

        const specPath = `${tempProject.path}/test-servers.json`;
        await tempProject.writeFile("test-servers.json", serverSpecContent);

        // Add all servers
        const addResult = await spawn(
          ["server", "add", specPath, "--all", "--yes"],
          {
            cwd: tempProject.path,
          }
        );

        expect(addResult.exitCode).toBe(0);

        // Verify both servers were added
        const configContent = await fs.promises.readFile(
          tempProject.configPath,
          "utf8"
        );
        expect(configContent).toContain("server1:");
        expect(configContent).toContain("server2:");

        // Remove one server
        const removeResult = await spawn(
          ["server", "remove", "server1", "--yes"],
          {
            cwd: tempProject.path,
          }
        );

        expect(removeResult.exitCode).toBe(0);

        // Verify only server2 remains
        const updatedConfigContent = await fs.promises.readFile(
          tempProject.configPath,
          "utf8"
        );
        expect(updatedConfigContent).not.toContain("server1:");
        expect(updatedConfigContent).toContain("server2:");
      })
    );
  });

  describe("Error Handling", () => {
    it(
      "should handle invalid ServerSpec files gracefully",
      withProcess(async (spawn: SpawnFunction) => {
        await tempProject.writeFile("invalid-spec.json", "{ invalid json");

        const result = await spawn(
          ["server", "add", `${tempProject.path}/invalid-spec.json`],
          {
            cwd: tempProject.path,
          }
        );

        expect(result.exitCode).toBe(1);
        // Should show a proper error message, not crash
        expect(result.stderr).toBeTruthy();
      })
    );

    it(
      "should handle missing ServerSpec files gracefully",
      withProcess(async (spawn: SpawnFunction) => {
        const result = await spawn(
          ["server", "add", `${tempProject.path}/missing-file.json`],
          {
            cwd: tempProject.path,
          }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("ServerSpec file not found:");
        expect(result.stderr).toContain("missing-file.json");
        expect(result.stderr).toContain(
          "Please check that the file path is correct"
        );
      })
    );
  });
});
