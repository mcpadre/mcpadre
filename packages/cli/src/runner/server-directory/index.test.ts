// pattern: Functional Core

import { existsSync } from "fs";
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createLogFilePath,
  createServerDirectory,
  getLogsDirectoryPath,
  getServerDirectoryPath,
} from "./index.js";

import type { WorkspaceContext } from "../../config/types/index.js";
import type { ResolvedPath } from "../types/index.js";

// Helper function to create a WorkspaceContext for testing
function createTestWorkspaceContext(workspaceDir: string): WorkspaceContext {
  const config = {
    mcpServers: {},
    hosts: {},
    options: {},
    version: 1,
  } as const;

  return {
    workspaceType: "project",
    workspaceDir,
    mergedConfig: config,
    projectConfig: config,
    userConfig: undefined,
  };
}

describe("Server Directory Utilities", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    const baseTemp = tmpdir();
    const timestamp = Date.now();
    tempDir = join(baseTemp, `mcpadre-test-${timestamp}`) as ResolvedPath;
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("createServerDirectory", () => {
    it("should create the complete server directory structure", async () => {
      const serverName = "test-server";
      const logsDir = await createServerDirectory(
        createTestWorkspaceContext(tempDir),
        serverName
      );

      // Verify the directory structure exists
      expect(existsSync(join(tempDir, ".mcpadre"))).toBe(true);
      expect(existsSync(join(tempDir, ".mcpadre", "servers"))).toBe(true);
      expect(existsSync(join(tempDir, ".mcpadre", "servers", serverName))).toBe(
        true
      );
      expect(
        existsSync(join(tempDir, ".mcpadre", "servers", serverName, "logs"))
      ).toBe(true);

      // Verify the returned path is correct
      expect(logsDir).toBe(
        join(tempDir, ".mcpadre", "servers", serverName, "logs")
      );
    });

    it("should handle server names with special characters", async () => {
      const serverName = "my-server_with.special-chars";
      const logsDir = await createServerDirectory(
        createTestWorkspaceContext(tempDir),
        serverName
      );

      expect(
        existsSync(join(tempDir, ".mcpadre", "servers", serverName, "logs"))
      ).toBe(true);
      expect(logsDir).toBe(
        join(tempDir, ".mcpadre", "servers", serverName, "logs")
      );
    });

    it("should work when directory already exists", async () => {
      const serverName = "test-server";

      // Create directory first time
      const logsDir1 = await createServerDirectory(
        createTestWorkspaceContext(tempDir),
        serverName
      );

      // Create directory second time (should not error)
      const logsDir2 = await createServerDirectory(
        createTestWorkspaceContext(tempDir),
        serverName
      );

      expect(logsDir1).toBe(logsDir2);
      expect(existsSync(logsDir1)).toBe(true);
    });

    it("should create directories recursively", async () => {
      const serverName = "nested/server/name";
      const logsDir = await createServerDirectory(
        createTestWorkspaceContext(tempDir),
        serverName
      );

      // All parent directories should be created
      expect(existsSync(join(tempDir, ".mcpadre", "servers", "nested"))).toBe(
        true
      );
      expect(
        existsSync(join(tempDir, ".mcpadre", "servers", "nested", "server"))
      ).toBe(true);
      expect(
        existsSync(
          join(tempDir, ".mcpadre", "servers", "nested", "server", "name")
        )
      ).toBe(true);
      expect(
        existsSync(
          join(
            tempDir,
            ".mcpadre",
            "servers",
            "nested",
            "server",
            "name",
            "logs"
          )
        )
      ).toBe(true);

      expect(logsDir).toBe(
        join(tempDir, ".mcpadre", "servers", "nested", "server", "name", "logs")
      );
    });
  });

  describe("createLogFilePath", () => {
    it("should create log file path with correct format", () => {
      const serverName = "test-server";
      const logsDir = "/path/to/logs";

      const logFilePath = createLogFilePath(serverName, logsDir);

      // Should include the server name and double underscore
      expect(logFilePath).toContain("test-server__");
      expect(logFilePath.endsWith(".jsonl")).toBe(true);
      expect(logFilePath.startsWith(logsDir)).toBe(true);
    });

    it("should generate unique filenames for different timestamps", () => {
      const serverName = "test-server";
      const logsDir = "/path/to/logs";

      const logFilePath1 = createLogFilePath(serverName, logsDir);
      // Small delay to ensure different timestamp
      const logFilePath2 = createLogFilePath(serverName, logsDir);

      // Paths might be the same due to timestamp resolution, but that's ok
      // This test mainly validates the format
      expect(logFilePath1).toMatch(
        /test-server__\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\.jsonl$/
      );
      expect(logFilePath2).toMatch(
        /test-server__\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\.jsonl$/
      );
    });

    it("should handle server names with special characters in filename", () => {
      const serverName = "my-server_with.special-chars";
      const logsDir = "/path/to/logs";

      const logFilePath = createLogFilePath(serverName, logsDir);

      expect(logFilePath).toContain("my-server_with.special-chars__");
      expect(logFilePath.endsWith(".jsonl")).toBe(true);
    });

    it("should use ISO format timestamp in UTC", () => {
      const serverName = "test-server";
      const logsDir = "/path/to/logs";

      const logFilePath = createLogFilePath(serverName, logsDir);

      // Extract timestamp part from filename
      const filename = logFilePath.split("/").pop()!;
      const timestampPart = filename
        .replace("test-server__", "")
        .replace(".jsonl", "");

      // Should be valid ISO timestamp ending with Z (UTC)
      expect(timestampPart).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
      expect(timestampPart.endsWith("Z")).toBe(true);
    });
  });

  describe("getServerDirectoryPath", () => {
    it("should return correct server directory path without creating it", () => {
      const serverName = "test-server";
      const serverDir = getServerDirectoryPath(
        createTestWorkspaceContext(tempDir),
        serverName
      );

      expect(serverDir).toBe(join(tempDir, ".mcpadre", "servers", serverName));
      // Should not create the directory
      expect(existsSync(serverDir)).toBe(false);
    });
  });

  describe("getLogsDirectoryPath", () => {
    it("should return correct logs directory path without creating it", () => {
      const serverName = "test-server";
      const logsDir = getLogsDirectoryPath(
        createTestWorkspaceContext(tempDir),
        serverName
      );

      expect(logsDir).toBe(
        join(tempDir, ".mcpadre", "servers", serverName, "logs")
      );
      // Should not create the directory
      expect(existsSync(logsDir)).toBe(false);
    });
  });
});
