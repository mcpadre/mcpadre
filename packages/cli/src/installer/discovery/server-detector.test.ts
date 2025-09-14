// pattern: Functional Core

import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  analyzeServerDirectories,
  classifyServers,
  extractMcpadreServerName,
  isMcpadreServer,
} from "./server-detector.js";

import type { WorkspaceContext } from "../../config/types/index.js";
import type { HostConfigSpec } from "../updaters/generic-updater.js";

/**
 * Helper function to create a WorkspaceContext for testing
 */
function createTestWorkspaceContext(
  workspaceDir: string,
  isUserMode: boolean
): WorkspaceContext {
  const baseConfig = {
    mcpServers: {},
    hosts: {},
    options: {},
    version: 1,
  } as const;

  if (isUserMode) {
    return {
      workspaceType: "user",
      workspaceDir,
      userConfigPath: `${workspaceDir}/mcpadre.yaml`,
      mergedConfig: baseConfig,
      userConfig: baseConfig,
    };
  } else {
    return {
      workspaceType: "project",
      workspaceDir,
      mergedConfig: baseConfig,
      projectConfig: baseConfig,
      projectConfigPath: `${workspaceDir}/mcpadre.yaml`,
      userConfig: baseConfig,
    };
  }
}

describe("server-detector", () => {
  describe("isMcpadreServer", () => {
    describe("simple format", () => {
      it("detects valid mcpadre server entries", () => {
        const validServer = {
          command: "mcpadre",
          args: ["run", "test-server"],
        };

        expect(isMcpadreServer(validServer, "simple")).toBe(true);
      });

      it("rejects non-mcpadre server entries", () => {
        const externalServer = {
          command: "node",
          args: ["server.js"],
        };

        expect(isMcpadreServer(externalServer, "simple")).toBe(false);
      });

      it("rejects malformed entries", () => {
        expect(isMcpadreServer({}, "simple")).toBe(false);
        expect(isMcpadreServer({ command: "mcpadre" }, "simple")).toBe(false);
        expect(isMcpadreServer({ args: ["run"] }, "simple")).toBe(false);
        expect(
          isMcpadreServer({ command: "mcpadre", args: "invalid" }, "simple")
        ).toBe(false);
        expect(
          isMcpadreServer({ command: "mcpadre", args: [] }, "simple")
        ).toBe(false);
        expect(
          isMcpadreServer({ command: "mcpadre", args: ["invalid"] }, "simple")
        ).toBe(false);
      });
    });

    describe("stdio format", () => {
      it("detects valid mcpadre server entries", () => {
        const validServer = {
          type: "stdio",
          command: "mcpadre",
          args: ["run", "test-server"],
        };

        expect(isMcpadreServer(validServer, "stdio")).toBe(true);
      });

      it("rejects entries without type field", () => {
        const serverWithoutType = {
          command: "mcpadre",
          args: ["run", "test-server"],
        };

        expect(isMcpadreServer(serverWithoutType, "stdio")).toBe(false);
      });

      it("rejects entries with wrong type", () => {
        const serverWithWrongType = {
          type: "websocket",
          command: "mcpadre",
          args: ["run", "test-server"],
        };

        expect(isMcpadreServer(serverWithWrongType, "stdio")).toBe(false);
      });
    });

    describe("zed format", () => {
      it("detects valid mcpadre server entries", () => {
        const validServer = {
          command: {
            path: "mcpadre",
            args: ["run", "test-server"],
          },
        };

        expect(isMcpadreServer(validServer, "zed")).toBe(true);
      });

      it("rejects non-nested command structure", () => {
        const flatServer = {
          command: "mcpadre",
          args: ["run", "test-server"],
        };

        expect(isMcpadreServer(flatServer, "zed")).toBe(false);
      });

      it("rejects malformed nested structure", () => {
        const malformedServer = {
          command: {
            path: "mcpadre",
            // missing args
          },
        };

        expect(isMcpadreServer(malformedServer, "zed")).toBe(false);
      });
    });
  });

  describe("extractMcpadreServerName", () => {
    it("extracts server name from simple format", () => {
      const server = {
        command: "mcpadre",
        args: ["run", "my-server"],
      };

      expect(extractMcpadreServerName(server, "simple")).toBe("my-server");
    });

    it("extracts server name from stdio format", () => {
      const server = {
        type: "stdio",
        command: "mcpadre",
        args: ["run", "my-server"],
      };

      expect(extractMcpadreServerName(server, "stdio")).toBe("my-server");
    });

    it("extracts server name from zed format", () => {
      const server = {
        command: {
          path: "mcpadre",
          args: ["run", "my-server"],
        },
      };

      expect(extractMcpadreServerName(server, "zed")).toBe("my-server");
    });

    it("returns null for non-mcpadre servers", () => {
      const externalServer = {
        command: "node",
        args: ["server.js"],
      };

      expect(extractMcpadreServerName(externalServer, "simple")).toBe(null);
    });

    it("returns null for mcpadre servers without server name", () => {
      const incompleteServer = {
        command: "mcpadre",
        args: ["run"], // Missing server name
      };

      expect(extractMcpadreServerName(incompleteServer, "simple")).toBe(null);
    });
  });

  describe("classifyServers", () => {
    const spec: HostConfigSpec = {
      serversKey: "mcpServers",
      serverFormat: "simple",
    };

    it("classifies mixed server configurations correctly", () => {
      const hostConfig = {
        mcpServers: {
          "current-server": {
            command: "mcpadre",
            args: ["run", "current-server"],
          },
          "orphaned-server": {
            command: "mcpadre",
            args: ["run", "orphaned-server"],
          },
          "external-server": {
            command: "node",
            args: ["server.js"],
          },
          "another-external": {
            command: "python",
            args: ["-m", "server"],
          },
        },
      };

      const mcpadreServerNames = new Set(["current-server"]);

      const result = classifyServers(hostConfig, spec, mcpadreServerNames);

      expect(result.mcpadreManaged).toEqual(["current-server"]);
      expect(result.mcpadreOrphaned).toEqual(["orphaned-server"]);
      expect(result.external).toEqual(["external-server", "another-external"]);
    });

    it("handles empty server section", () => {
      const hostConfig = {};

      const result = classifyServers(hostConfig, spec, new Set());

      expect(result.mcpadreManaged).toEqual([]);
      expect(result.mcpadreOrphaned).toEqual([]);
      expect(result.external).toEqual([]);
    });

    it("handles all mcpadre-managed servers", () => {
      const hostConfig = {
        mcpServers: {
          server1: {
            command: "mcpadre",
            args: ["run", "server1"],
          },
          server2: {
            command: "mcpadre",
            args: ["run", "server2"],
          },
        },
      };

      const mcpadreServerNames = new Set(["server1", "server2"]);

      const result = classifyServers(hostConfig, spec, mcpadreServerNames);

      expect(result.mcpadreManaged).toEqual(["server1", "server2"]);
      expect(result.mcpadreOrphaned).toEqual([]);
      expect(result.external).toEqual([]);
    });

    it("handles stdio format with type field", () => {
      const stdioSpec: HostConfigSpec = {
        serversKey: "servers",
        serverFormat: "stdio",
      };

      const hostConfig = {
        servers: {
          "managed-server": {
            type: "stdio",
            command: "mcpadre",
            args: ["run", "managed-server"],
          },
          "external-server": {
            type: "stdio",
            command: "node",
            args: ["server.js"],
          },
        },
      };

      const result = classifyServers(
        hostConfig,
        stdioSpec,
        new Set(["managed-server"])
      );

      expect(result.mcpadreManaged).toEqual(["managed-server"]);
      expect(result.external).toEqual(["external-server"]);
    });

    it("uses extracted server name when different from key", () => {
      const hostConfig = {
        mcpServers: {
          "alias-name": {
            command: "mcpadre",
            args: ["run", "actual-server-name"],
          },
        },
      };

      // The actual server name is in mcpadre.yaml as "actual-server-name"
      const mcpadreServerNames = new Set(["actual-server-name"]);

      const result = classifyServers(hostConfig, spec, mcpadreServerNames);

      // Should detect that "alias-name" key maps to "actual-server-name" and is managed
      expect(result.mcpadreManaged).toEqual(["alias-name"]);
      expect(result.mcpadreOrphaned).toEqual([]);
    });
  });

  describe("analyzeServerDirectories", () => {
    let tempDir: string;

    beforeEach(async () => {
      // Create a unique temporary directory for testing
      tempDir = join(
        tmpdir(),
        `mcpadre-test-${Date.now()}-${Math.random().toString(36).substring(2)}`
      );
      await mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
      // Clean up temp directory
      await rm(tempDir, { recursive: true, force: true });
    });

    describe("project mode (isUserMode: false)", () => {
      it("identifies orphaned directories in .mcpadre/servers", async () => {
        // Create .mcpadre/servers directory structure
        const serversDir = join(tempDir, ".mcpadre", "servers");
        await mkdir(serversDir, { recursive: true });

        // Create some server directories
        await mkdir(join(serversDir, "current-server"));
        await mkdir(join(serversDir, "orphaned-server1"));
        await mkdir(join(serversDir, "orphaned-server2"));

        // Add some files to make them real directories
        await writeFile(
          join(serversDir, "current-server", "package.json"),
          "{}"
        );
        await writeFile(
          join(serversDir, "orphaned-server1", "package.json"),
          "{}"
        );
        await writeFile(
          join(serversDir, "orphaned-server2", "requirements.txt"),
          ""
        );

        const mcpadreServerNames = new Set(["current-server"]);

        const context = createTestWorkspaceContext(tempDir, false);
        const result = await analyzeServerDirectories(
          context,
          mcpadreServerNames
        );

        expect(result.orphanedDirectories).toEqual(
          expect.arrayContaining(["orphaned-server1", "orphaned-server2"])
        );
        expect(result.orphanedDirectories).toHaveLength(2);
      });

      it("handles missing .mcpadre/servers directory", async () => {
        const context = createTestWorkspaceContext(tempDir, false);
        const result = await analyzeServerDirectories(
          context,
          new Set(["some-server"])
        );

        expect(result.orphanedDirectories).toEqual([]);
      });

      it("handles empty .mcpadre/servers directory", async () => {
        const serversDir = join(tempDir, ".mcpadre", "servers");
        await mkdir(serversDir, { recursive: true });

        const context = createTestWorkspaceContext(tempDir, false);
        const result = await analyzeServerDirectories(
          context,
          new Set(["some-server"])
        );

        expect(result.orphanedDirectories).toEqual([]);
      });

      it("only reports directories, not files in .mcpadre/servers", async () => {
        const serversDir = join(tempDir, ".mcpadre", "servers");
        await mkdir(serversDir, { recursive: true });

        // Create a file in the servers directory (should be ignored)
        await writeFile(join(serversDir, "not-a-directory.txt"), "content");

        // Create a directory that should be reported as orphaned
        await mkdir(join(serversDir, "orphaned-directory"));

        const context = createTestWorkspaceContext(tempDir, false);
        const result = await analyzeServerDirectories(context, new Set());

        expect(result.orphanedDirectories).toEqual(["orphaned-directory"]);
      });
    });

    describe("user mode (isUserMode: true)", () => {
      it("analyzes .mcpadre/servers/ directory when isUserMode=true", async () => {
        // Create servers directory structure (unified approach for user mode)
        const userServersDir = join(tempDir, ".mcpadre", "servers");
        await mkdir(userServersDir, { recursive: true });

        // Create server directories in unified location
        await mkdir(join(userServersDir, "user-current-server"));
        await mkdir(join(userServersDir, "user-orphaned-server1"));
        await mkdir(join(userServersDir, "user-orphaned-server2"));

        // Add files to make them real directories
        await writeFile(
          join(userServersDir, "user-current-server", "package.json"),
          "{}"
        );
        await writeFile(
          join(userServersDir, "user-orphaned-server1", "package.json"),
          "{}"
        );
        await writeFile(
          join(userServersDir, "user-orphaned-server2", "requirements.txt"),
          ""
        );

        const mcpadreServerNames = new Set(["user-current-server"]);

        const context = createTestWorkspaceContext(tempDir, true);
        const result = await analyzeServerDirectories(
          context,
          mcpadreServerNames
        );

        expect(result.orphanedDirectories).toEqual(
          expect.arrayContaining([
            "user-orphaned-server1",
            "user-orphaned-server2",
          ])
        );
        expect(result.orphanedDirectories).toHaveLength(2);
      });

      it("finds orphaned directories in userDir/.mcpadre/servers/", async () => {
        // Create user mode servers directory with orphaned content (unified approach)
        const userServersDir = join(tempDir, ".mcpadre", "servers");
        await mkdir(userServersDir, { recursive: true });

        await mkdir(join(userServersDir, "orphan-alpha"));
        await mkdir(join(userServersDir, "orphan-beta"));
        await writeFile(
          join(userServersDir, "orphan-alpha", "config.json"),
          "{}"
        );
        await writeFile(join(userServersDir, "orphan-beta", "setup.py"), "");

        // Empty server names set - all should be orphans
        const context = createTestWorkspaceContext(tempDir, true);
        const result = await analyzeServerDirectories(context, new Set());

        expect(result.orphanedDirectories).toEqual(
          expect.arrayContaining(["orphan-alpha", "orphan-beta"])
        );
        expect(result.orphanedDirectories).toHaveLength(2);
      });

      it("handles missing userDir/servers/ gracefully", async () => {
        // Don't create the servers directory at all
        const context = createTestWorkspaceContext(tempDir, true);
        const result = await analyzeServerDirectories(
          context,
          new Set(["some-server"])
        );

        expect(result.orphanedDirectories).toEqual([]);
      });

      it("should look in .mcpadre/servers for user mode (unified approach)", async () => {
        // With unified approach, user mode also uses .mcpadre/servers
        const userServersDir = join(tempDir, ".mcpadre", "servers");
        await mkdir(userServersDir, { recursive: true });

        // Add orphaned server to user workspace
        await mkdir(join(userServersDir, "user-orphan"));
        await writeFile(
          join(userServersDir, "user-orphan", "package.json"),
          "{}"
        );

        const context = createTestWorkspaceContext(tempDir, true);
        const result = await analyzeServerDirectories(
          context,
          new Set() // No current servers
        );

        // Should find the orphan in .mcpadre/servers
        expect(result.orphanedDirectories).toEqual(["user-orphan"]);
      });
    });

    describe("mode comparison", () => {
      it("should find different orphans in project vs user workspaces", async () => {
        // Create separate workspace directories for project and user modes
        const projectDir = join(tempDir, "project-workspace");
        const userDir = join(tempDir, "user-workspace");

        // Create project mode servers directory with orphan
        const projectServersDir = join(projectDir, ".mcpadre", "servers");
        await mkdir(projectServersDir, { recursive: true });
        await mkdir(join(projectServersDir, "project-server-orphan"));
        await writeFile(
          join(projectServersDir, "project-server-orphan", "package.json"),
          "{}"
        );

        // Create user mode servers directory with orphan
        const userServersDir = join(userDir, ".mcpadre", "servers");
        await mkdir(userServersDir, { recursive: true });
        await mkdir(join(userServersDir, "user-server-orphan"));
        await writeFile(
          join(userServersDir, "user-server-orphan", "requirements.txt"),
          ""
        );

        // Test project mode
        const projectContext = createTestWorkspaceContext(projectDir, false);
        const projectResult = await analyzeServerDirectories(
          projectContext,
          new Set()
        );

        // Test user mode
        const userContext = createTestWorkspaceContext(userDir, true);
        const userResult = await analyzeServerDirectories(
          userContext,
          new Set()
        );

        expect(projectResult.orphanedDirectories).toEqual([
          "project-server-orphan",
        ]);
        expect(userResult.orphanedDirectories).toEqual(["user-server-orphan"]);
        expect(projectResult.orphanedDirectories).not.toEqual(
          userResult.orphanedDirectories
        );
      });

      it("should handle unified directory structure for both modes", async () => {
        // Create unified .mcpadre/servers directory
        const serversDir = join(tempDir, ".mcpadre", "servers");
        await mkdir(serversDir, { recursive: true });

        // Create a server that's in the current config
        await mkdir(join(serversDir, "current-server"));
        await writeFile(
          join(serversDir, "current-server", "package.json"),
          "{}"
        );

        const currentServers = new Set(["current-server"]);

        // Test both modes - both should use the same directory and find no orphans
        const projectContext = createTestWorkspaceContext(tempDir, false);
        const projectResult = await analyzeServerDirectories(
          projectContext,
          currentServers
        );
        const userContext = createTestWorkspaceContext(tempDir, true);
        const userResult = await analyzeServerDirectories(
          userContext,
          currentServers
        );

        expect(projectResult.orphanedDirectories).toEqual([]);
        expect(userResult.orphanedDirectories).toEqual([]);
      });
    });

    // Keep backward compatibility test (default isUserMode parameter)
    it("identifies orphaned directories (backward compatibility)", async () => {
      // Create .mcpadre/servers directory structure
      const serversDir = join(tempDir, ".mcpadre", "servers");
      await mkdir(serversDir, { recursive: true });

      // Create some server directories
      await mkdir(join(serversDir, "current-server"));
      await mkdir(join(serversDir, "orphaned-server1"));
      await mkdir(join(serversDir, "orphaned-server2"));

      // Add some files to make them real directories
      await writeFile(join(serversDir, "current-server", "package.json"), "{}");
      await writeFile(
        join(serversDir, "orphaned-server1", "package.json"),
        "{}"
      );
      await writeFile(
        join(serversDir, "orphaned-server2", "requirements.txt"),
        ""
      );

      const mcpadreServerNames = new Set(["current-server"]);

      // Call with project context (default behavior)
      const context = createTestWorkspaceContext(tempDir, false);
      const result = await analyzeServerDirectories(
        context,
        mcpadreServerNames
      );

      expect(result.orphanedDirectories).toEqual(
        expect.arrayContaining(["orphaned-server1", "orphaned-server2"])
      );
      expect(result.orphanedDirectories).toHaveLength(2);
    });
  });
});
