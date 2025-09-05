import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import { type SpawnFunction, withProcess } from "../helpers/spawn-cli-v2.js";

import type { TempProject } from "../../test-utils/project/temp-project.js";

describe("server add command - remote sources", () => {
  let tempProject: TempProject;

  beforeEach(async () => {
    tempProject = await createTempProject({
      config: {
        version: 1,
        mcpServers: {},
      },
      format: "yaml",
    });
  });

  afterEach(async () => {
    await tempProject.cleanup();
  });

  describe("direct URL fetching", () => {
    it(
      "should add server from direct GitHub raw URL",
      withProcess(async (spawn: SpawnFunction) => {
        const directUrl =
          "https://raw.githubusercontent.com/mcpadre-test/add-this-mcp-single-test/refs/heads/main/add_this_mcp.yml";

        const result = await spawn(["server", "add", directUrl, "--yes"], {
          cwd: tempProject.path,
          buffer: true,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/successfully added/i);

        // Verify server was added to config
        const config = await tempProject.readConfig();
        expect(config.mcpServers).toHaveProperty("mcp-sleep");
        expect(config.mcpServers["mcp-sleep"]).toEqual({
          python: {
            package: "mcp-sleep",
            version: "0.1.1",
          },
        });
      })
    );

    it(
      "should handle direct URL fetch errors gracefully",
      withProcess(async (spawn: SpawnFunction) => {
        const nonExistentUrl =
          "https://raw.githubusercontent.com/mcpadre-test/nonexistent/main/serverspec.yml";

        const result = await spawn(["server", "add", nonExistentUrl, "--yes"], {
          cwd: tempProject.path,
          buffer: true,
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(
          /failed to load serverspec from remote source/i
        );
        expect(result.stderr).toMatch(/404|not found/i);

        // Verify no servers were added
        const config = await tempProject.readConfig();
        expect(Object.keys(config.mcpServers)).toHaveLength(0);
      })
    );
  });

  describe("GitHub repository discovery", () => {
    it(
      "should add server from GitHub repository with single ServerSpec file",
      withProcess(async (spawn: SpawnFunction) => {
        const githubUrl =
          "https://github.com/mcpadre-test/add-this-mcp-single-test";

        const result = await spawn(["server", "add", githubUrl, "--yes"], {
          cwd: tempProject.path,
          buffer: true,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/successfully added/i);
        expect(result.stdout).toMatch(/mcp-sleep/);

        // Verify server was added to config
        const config = await tempProject.readConfig();
        expect(Object.keys(config.mcpServers).length).toBeGreaterThan(0);
        expect(config.mcpServers["mcp-sleep"]).toEqual({
          python: {
            package: "mcp-sleep",
            version: "0.1.1",
          },
        });
      })
    );

    it(
      "should handle GitHub repository not found",
      withProcess(async (spawn: SpawnFunction) => {
        const nonExistentRepo =
          "https://github.com/mcpadre-test/totally-nonexistent-repo";

        const result = await spawn(
          ["server", "add", nonExistentRepo, "--yes"],
          {
            cwd: tempProject.path,
            buffer: true,
          }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(
          /failed to load serverspec from remote source/i
        );
        expect(result.stderr).toMatch(/repository not found|404/i);

        // Verify no servers were added
        const config = await tempProject.readConfig();
        expect(Object.keys(config.mcpServers)).toHaveLength(0);
      })
    );

    it(
      "should handle repository with no ServerSpec file",
      withProcess(async (spawn: SpawnFunction) => {
        // Using a real repo that definitely won't have our ServerSpec files
        const noServerSpecRepo = "https://github.com/eropple/rx-mailer";

        const result = await spawn(
          ["server", "add", noServerSpecRepo, "--yes"],
          {
            cwd: tempProject.path,
            buffer: true,
          }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(
          /failed to load serverspec from remote source/i
        );
        expect(result.stderr).toMatch(/no serverspec file found/i);

        // Verify no servers were added
        const config = await tempProject.readConfig();
        expect(Object.keys(config.mcpServers)).toHaveLength(0);
      })
    );
  });

  describe("GitLab repository discovery", () => {
    it(
      "should add server from GitLab repository with ServerSpec file",
      withProcess(async (spawn: SpawnFunction) => {
        const gitlabUrl =
          "https://gitlab.com/mcpadre-test/add-this-mcp-multi-test";

        const result = await spawn(
          ["server", "add", gitlabUrl, "--all", "--yes"],
          {
            cwd: tempProject.path,
            buffer: true,
          }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/successfully added/i);

        // Verify server was added to config
        const config = await tempProject.readConfig();
        expect(Object.keys(config.mcpServers).length).toBeGreaterThan(0);
      })
    );

    it(
      "should handle GitLab repository not found",
      withProcess(async (spawn: SpawnFunction) => {
        const nonExistentRepo =
          "https://gitlab.com/mcpadre-test/totally-nonexistent-repo";

        const result = await spawn(
          ["server", "add", nonExistentRepo, "--yes"],
          {
            cwd: tempProject.path,
            buffer: true,
          }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(
          /failed to load serverspec from remote source/i
        );
        expect(result.stderr).toMatch(/repository not found|404/i);

        // Verify no servers were added
        const config = await tempProject.readConfig();
        expect(Object.keys(config.mcpServers)).toHaveLength(0);
      })
    );
  });

  describe("server selection with remote sources", () => {
    it(
      "should support --all flag with remote URLs",
      withProcess(async (spawn: SpawnFunction) => {
        const githubUrl =
          "https://github.com/mcpadre-test/add-this-mcp-single-test";

        const result = await spawn(
          ["server", "add", githubUrl, "--all", "--yes"],
          {
            cwd: tempProject.path,
            buffer: true,
          }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/successfully added/i);

        // Verify server was added to config
        const config = await tempProject.readConfig();
        expect(Object.keys(config.mcpServers).length).toBeGreaterThan(0);
      })
    );

    it(
      "should support --server-name flag with remote URLs",
      withProcess(async (spawn: SpawnFunction) => {
        const githubUrl =
          "https://github.com/mcpadre-test/add-this-mcp-single-test";

        const result = await spawn(
          ["server", "add", githubUrl, "--server-name", "mcp-sleep", "--yes"],
          {
            cwd: tempProject.path,
            buffer: true,
          }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/successfully added/i);

        // Verify server was added to config
        const config = await tempProject.readConfig();
        expect(Object.keys(config.mcpServers).length).toBeGreaterThan(0);
      })
    );

    it(
      "should fail gracefully when specified server name not found in remote ServerSpec",
      withProcess(async (spawn: SpawnFunction) => {
        const githubUrl =
          "https://github.com/mcpadre-test/add-this-mcp-single-test";

        const result = await spawn(
          [
            "server",
            "add",
            githubUrl,
            "--server-name",
            "nonexistent-server",
            "--yes",
          ],
          {
            cwd: tempProject.path,
            buffer: true,
          }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(/server.*not found/i);

        // Verify no servers were added
        const config = await tempProject.readConfig();
        expect(Object.keys(config.mcpServers)).toHaveLength(0);
      })
    );
  });

  describe("non-interactive mode", () => {
    it(
      "should require --yes flag for remote URLs in non-interactive mode",
      withProcess(async (spawn: SpawnFunction) => {
        const githubUrl =
          "https://github.com/mcpadre-test/add-this-mcp-single-test";

        const result = await spawn(["server", "add", githubUrl, "--all"], {
          cwd: tempProject.path,
          env: { ...process.env, MCPADRE_NON_INTERACTIVE: "1" },
          buffer: true,
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(/non-interactive.*requires.*--yes/i);

        // Verify no servers were added
        const config = await tempProject.readConfig();
        expect(Object.keys(config.mcpServers)).toHaveLength(0);
      })
    );

    it(
      "should work with --yes flag in non-interactive mode",
      withProcess(async (spawn: SpawnFunction) => {
        const githubUrl =
          "https://github.com/mcpadre-test/add-this-mcp-single-test";

        const result = await spawn(
          ["server", "add", githubUrl, "--all", "--yes"],
          {
            cwd: tempProject.path,
            env: { ...process.env, MCPADRE_NON_INTERACTIVE: "1" },
            buffer: true,
          }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/successfully added/i);

        // Verify server was added to config
        const config = await tempProject.readConfig();
        expect(Object.keys(config.mcpServers).length).toBeGreaterThan(0);
      })
    );
  });
});
