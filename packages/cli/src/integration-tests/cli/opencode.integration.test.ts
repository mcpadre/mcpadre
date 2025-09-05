import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import { type SpawnFunction, withProcess } from "../helpers/spawn-cli-v2.js";

describe("OpenCode integration", () => {
  it(
    "should install config for opencode",
    withProcess(async (spawn: SpawnFunction) => {
      const tempProject = await createTempProject({
        config: {
          version: 1 as const,
          mcpServers: {
            "desktop-commander-test": {
              node: {
                package: "@wonderwhy-er/desktop-commander",
                version: "0.2.9",
              },
            },
          },
          hosts: {
            opencode: true,
          },
        },
        format: "yaml",
      });

      const result = await spawn(["install"], {
        cwd: tempProject.path,
      });

      expect(result.exitCode).toBe(0);

      // Verify config file was created
      const configPath = join(tempProject.path, "opencode.json");
      const configContent = readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);

      expect(config.mcp["desktop-commander-test"]).toEqual({
        type: "local",
        command: ["mcpadre", "run", "desktop-commander-test"],
        enabled: true,
      });
    })
  );

  it(
    "should preserve existing OpenCode settings when installing MCP servers",
    withProcess(async (spawn: SpawnFunction) => {
      const tempProject = await createTempProject({
        config: {
          version: 1 as const,
          mcpServers: {
            "desktop-commander-test": {
              node: {
                package: "@wonderwhy-er/desktop-commander",
                version: "0.2.9",
              },
            },
          },
          hosts: {
            opencode: true,
          },
        },
        format: "yaml",
      });

      // Create existing opencode.json file
      await tempProject.writeFile(
        "opencode.json",
        JSON.stringify(
          {
            $schema: "https://opencode.ai/config.json",
            model: "anthropic/claude-sonnet-4-20250514",
            theme: "opencode",
            mcp: {
              "existing-server": {
                type: "remote",
                url: "https://example.com/mcp",
                enabled: true,
              },
            },
          },
          null,
          2
        )
      );

      const result = await spawn(["install"], {
        cwd: tempProject.path,
      });

      expect(result.exitCode).toBe(0);

      const configPath = join(tempProject.path, "opencode.json");
      const configContent = readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Should preserve schema and other settings
      expect(config.$schema).toBe("https://opencode.ai/config.json");
      expect(config.model).toBe("anthropic/claude-sonnet-4-20250514");
      expect(config.theme).toBe("opencode");

      // Should preserve existing MCP server
      expect(config.mcp["existing-server"]).toEqual({
        type: "remote",
        url: "https://example.com/mcp",
        enabled: true,
      });

      // Should add new mcpadre server
      expect(config.mcp["desktop-commander-test"]).toEqual({
        type: "local",
        command: ["mcpadre", "run", "desktop-commander-test"],
        enabled: true,
      });
    })
  );

  it(
    "should preserve enabled states of existing mcpadre servers",
    withProcess(async (spawn: SpawnFunction) => {
      const tempProject = await createTempProject({
        config: {
          version: 1 as const,
          mcpServers: {
            "server-a": {
              node: {
                package: "@wonderwhy-er/desktop-commander",
                version: "0.2.9",
              },
            },
            "server-b": {
              node: {
                package: "@wonderwhy-er/desktop-commander",
                version: "0.2.9",
              },
            },
          },
          hosts: {
            opencode: true,
          },
        },
        format: "yaml",
      });

      // Create existing opencode.json with disabled server
      await tempProject.writeFile(
        "opencode.json",
        JSON.stringify({
          mcp: {
            "server-a": {
              type: "local",
              command: ["mcpadre", "run", "server-a"],
              enabled: false, // User disabled this one
            },
          },
        })
      );

      const result = await spawn(["install"], {
        cwd: tempProject.path,
      });

      expect(result.exitCode).toBe(0);

      const configPath = join(tempProject.path, "opencode.json");
      const configContent = readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Should preserve disabled state
      expect(config.mcp["server-a"].enabled).toBe(false);

      // New server should default to enabled
      expect(config.mcp["server-b"].enabled).toBe(true);
    })
  );

  it(
    "should remove orphaned mcpadre servers",
    withProcess(async (spawn: SpawnFunction) => {
      const tempProject = await createTempProject({
        config: {
          version: 1 as const,
          mcpServers: {
            "current-server": {
              node: {
                package: "@wonderwhy-er/desktop-commander",
                version: "0.2.9",
              },
            },
          },
          hosts: {
            opencode: true,
          },
        },
        format: "yaml",
      });

      // Create existing opencode.json with mixed server types
      await tempProject.writeFile(
        "opencode.json",
        JSON.stringify({
          mcp: {
            "orphaned-server": {
              type: "local",
              command: ["mcpadre", "run", "orphaned-server"],
              enabled: false, // Even disabled orphans should be removed
            },
            "current-server": {
              type: "local",
              command: ["mcpadre", "run", "current-server"],
              enabled: true,
            },
            "external-server": {
              type: "remote",
              url: "https://example.com",
              enabled: true,
            },
          },
        })
      );

      const result = await spawn(["install"], {
        cwd: tempProject.path,
      });

      expect(result.exitCode).toBe(0);

      const configPath = join(tempProject.path, "opencode.json");
      const configContent = readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Should remove orphaned mcpadre server
      expect(config.mcp["orphaned-server"]).toBeUndefined();

      // Should keep current mcpadre server
      expect(config.mcp["current-server"]).toBeDefined();

      // Should preserve external server
      expect(config.mcp["external-server"]).toBeDefined();
    })
  );

  it(
    "should not gitignore opencode.json (contains user settings)",
    withProcess(async (spawn: SpawnFunction) => {
      const tempProject = await createTempProject({
        config: {
          version: 1 as const,
          mcpServers: {
            "desktop-commander-test": {
              node: {
                package: "@wonderwhy-er/desktop-commander",
                version: "0.2.9",
              },
            },
          },
          hosts: {
            opencode: true,
            "claude-code": true, // Add other hosts to test gitignore behavior
            cursor: true,
            vscode: true,
          },
        },
        format: "yaml",
      });

      const result = await spawn(["install"], {
        cwd: tempProject.path,
      });

      expect(result.exitCode).toBe(0);

      // Check .gitignore content
      const gitignorePath = join(tempProject.path, ".gitignore");
      const gitignoreContent = readFileSync(gitignorePath, "utf-8");

      // opencode.json should NOT be in gitignore (contains user preferences)
      expect(gitignoreContent).not.toContain("opencode.json");

      // But other host configs should still be gitignored
      expect(gitignoreContent).toContain(".mcp.json");
      expect(gitignoreContent).toContain(".cursor/mcp.json");
      expect(gitignoreContent).toContain(".vscode/mcp.json");
      expect(gitignoreContent).not.toContain(".zed/settings.json");
    })
  );

  it(
    "should handle empty opencode.json file",
    withProcess(async (spawn: SpawnFunction) => {
      const tempProject = await createTempProject({
        config: {
          version: 1 as const,
          mcpServers: {
            "desktop-commander-test": {
              node: {
                package: "@wonderwhy-er/desktop-commander",
                version: "0.2.9",
              },
            },
          },
          hosts: {
            opencode: true,
          },
        },
        format: "yaml",
      });

      // Create empty opencode.json
      await tempProject.writeFile("opencode.json", "{}");

      const result = await spawn(["install"], {
        cwd: tempProject.path,
      });

      expect(result.exitCode).toBe(0);

      const configPath = join(tempProject.path, "opencode.json");
      const configContent = readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);

      expect(config.mcp["desktop-commander-test"]).toEqual({
        type: "local",
        command: ["mcpadre", "run", "desktop-commander-test"],
        enabled: true,
      });
    })
  );

  it(
    "should handle malformed opencode.json gracefully",
    withProcess(async (spawn: SpawnFunction) => {
      const tempProject = await createTempProject({
        config: {
          version: 1 as const,
          mcpServers: {
            "desktop-commander-test": {
              node: {
                package: "@wonderwhy-er/desktop-commander",
                version: "0.2.9",
              },
            },
          },
          hosts: {
            opencode: true,
          },
        },
        format: "yaml",
      });

      // Create malformed opencode.json
      await tempProject.writeFile("opencode.json", "{ invalid json }");

      const result = await spawn(["install"], {
        cwd: tempProject.path,
      });

      expect(result.exitCode).toBe(0);

      const configPath = join(tempProject.path, "opencode.json");
      const configContent = readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);

      expect(config.mcp["desktop-commander-test"]).toEqual({
        type: "local",
        command: ["mcpadre", "run", "desktop-commander-test"],
        enabled: true,
      });
    })
  );
});
