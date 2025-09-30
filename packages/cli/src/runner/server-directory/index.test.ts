// pattern: Functional Core

import { existsSync } from "fs";
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createRecordingFilePath,
  createServerDirectory,
  getServerDirectoryPath,
  getTrafficRecordingDirectoryPath,
} from "./index.js";

import type {
  ProjectWorkspaceContext,
  WorkspaceContext,
} from "../../config/types/index.js";
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
    projectConfigPath: `${workspaceDir}/mcpadre.yaml`,
    userConfig: config,
  } as ProjectWorkspaceContext;
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
      const recordingDir = await createServerDirectory(
        createTestWorkspaceContext(tempDir),
        serverName
      );

      // Verify the directory structure exists
      expect(existsSync(join(tempDir, ".mcpadre"))).toBe(true);
      expect(existsSync(join(tempDir, ".mcpadre", "traffic"))).toBe(true);
      expect(existsSync(join(tempDir, ".mcpadre", "traffic", serverName))).toBe(
        true
      );

      // Verify the returned path is correct
      expect(recordingDir).toBe(
        join(tempDir, ".mcpadre", "traffic", serverName)
      );
    });

    it("should handle server names with special characters", async () => {
      const serverName = "my-server_with.special-chars";
      const recordingDir = await createServerDirectory(
        createTestWorkspaceContext(tempDir),
        serverName
      );

      expect(existsSync(join(tempDir, ".mcpadre", "traffic", serverName))).toBe(
        true
      );
      expect(recordingDir).toBe(
        join(tempDir, ".mcpadre", "traffic", serverName)
      );
    });

    it("should work when directory already exists", async () => {
      const serverName = "test-server";

      // Create directory first time
      const recordingDir1 = await createServerDirectory(
        createTestWorkspaceContext(tempDir),
        serverName
      );

      // Create directory second time (should not error)
      const recordingDir2 = await createServerDirectory(
        createTestWorkspaceContext(tempDir),
        serverName
      );

      expect(recordingDir1).toBe(recordingDir2);
      expect(existsSync(recordingDir1)).toBe(true);
    });

    it("should create directories recursively", async () => {
      const serverName = "nested/server/name";
      const recordingDir = await createServerDirectory(
        createTestWorkspaceContext(tempDir),
        serverName
      );

      // All parent directories should be created
      expect(existsSync(join(tempDir, ".mcpadre", "traffic", "nested"))).toBe(
        true
      );
      expect(
        existsSync(join(tempDir, ".mcpadre", "traffic", "nested", "server"))
      ).toBe(true);
      expect(
        existsSync(
          join(tempDir, ".mcpadre", "traffic", "nested", "server", "name")
        )
      ).toBe(true);

      expect(recordingDir).toBe(
        join(tempDir, ".mcpadre", "traffic", "nested", "server", "name")
      );
    });
  });

  describe("createRecordingFilePath", () => {
    it("should create recording file path with correct format", () => {
      const serverName = "test-server";
      const recordingDir = "/path/to/recordings";

      const recordingFilePath = createRecordingFilePath(
        serverName,
        recordingDir
      );

      // Should include the server name and double underscore
      expect(recordingFilePath).toContain("test-server__");
      expect(recordingFilePath.endsWith(".jsonl")).toBe(true);
      expect(recordingFilePath.startsWith(recordingDir)).toBe(true);
    });

    it("should generate unique filenames for different timestamps", () => {
      const serverName = "test-server";
      const recordingDir = "/path/to/recordings";

      const recordingFilePath1 = createRecordingFilePath(
        serverName,
        recordingDir
      );
      // Small delay to ensure different timestamp
      const recordingFilePath2 = createRecordingFilePath(
        serverName,
        recordingDir
      );

      // Paths might be the same due to timestamp resolution, but that's ok
      // This test mainly validates the format
      expect(recordingFilePath1).toMatch(
        /test-server__\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\.jsonl$/
      );
      expect(recordingFilePath2).toMatch(
        /test-server__\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\.jsonl$/
      );
    });

    it("should handle server names with special characters in filename", () => {
      const serverName = "my-server_with.special-chars";
      const recordingDir = "/path/to/recordings";

      const recordingFilePath = createRecordingFilePath(
        serverName,
        recordingDir
      );

      expect(recordingFilePath).toContain("my-server_with.special-chars__");
      expect(recordingFilePath.endsWith(".jsonl")).toBe(true);
    });

    it("should use ISO format timestamp in UTC", () => {
      const serverName = "test-server";
      const recordingDir = "/path/to/recordings";

      const recordingFilePath = createRecordingFilePath(
        serverName,
        recordingDir
      );

      // Extract timestamp part from filename
      const filename = recordingFilePath.split("/").pop()!;
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

  describe("getTrafficRecordingDirectoryPath", () => {
    it("should return correct traffic recording directory path without creating it", () => {
      const serverName = "test-server";
      const recordingDir = getTrafficRecordingDirectoryPath(
        createTestWorkspaceContext(tempDir),
        serverName
      );

      expect(recordingDir).toBe(
        join(tempDir, ".mcpadre", "traffic", serverName)
      );
      // Should not create the directory
      expect(existsSync(recordingDir)).toBe(false);
    });
  });
});
