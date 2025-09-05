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

import type { HostConfigSpec } from "../updaters/generic-updater.js";

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

    it("identifies orphaned directories", async () => {
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

      const result = await analyzeServerDirectories(
        tempDir,
        mcpadreServerNames
      );

      expect(result.orphanedDirectories).toEqual(
        expect.arrayContaining(["orphaned-server1", "orphaned-server2"])
      );
      expect(result.orphanedDirectories).toHaveLength(2);
    });

    it("handles missing .mcpadre/servers directory", async () => {
      const result = await analyzeServerDirectories(
        tempDir,
        new Set(["some-server"])
      );

      expect(result.orphanedDirectories).toEqual([]);
    });

    it("handles empty servers directory", async () => {
      const serversDir = join(tempDir, ".mcpadre", "servers");
      await mkdir(serversDir, { recursive: true });

      const result = await analyzeServerDirectories(
        tempDir,
        new Set(["some-server"])
      );

      expect(result.orphanedDirectories).toEqual([]);
    });

    it("only reports directories, not files", async () => {
      const serversDir = join(tempDir, ".mcpadre", "servers");
      await mkdir(serversDir, { recursive: true });

      // Create a file in the servers directory (should be ignored)
      await writeFile(join(serversDir, "not-a-directory.txt"), "content");

      // Create a directory that should be reported as orphaned
      await mkdir(join(serversDir, "orphaned-directory"));

      const result = await analyzeServerDirectories(tempDir, new Set());

      expect(result.orphanedDirectories).toEqual(["orphaned-directory"]);
    });
  });
});
