// Unit tests for ContainerLockManager trust-on-first-use logic

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ContainerLock, ContainerLockManager } from "./container-lock.js";

// Mock Docker client for testing
class MockDocker {
  private imageData: Record<string, any> = {};

  setImageData(imageRef: string, data: any): void {
    this.imageData[imageRef] = data;
  }

  getImage(imageRef: string): { inspect: () => Promise<any> } {
    return {
      inspect: async (): Promise<any> => {
        const data = this.imageData[imageRef];
        if (!data) {
          const error = new Error(`Image ${imageRef} not found`) as any;
          error.statusCode = 404;
          throw error;
        }
        return data;
      },
    };
  }
}

describe("ContainerLockManager", () => {
  let tempDir: string;
  let serverDir: string;
  let mockDocker: MockDocker;
  let lockManager: ContainerLockManager;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "container-lock-test-"));
    serverDir = path.join(tempDir, "servers", "test-server");
    await fs.mkdir(serverDir, { recursive: true });

    // Create mock Docker client
    mockDocker = new MockDocker();
    lockManager = new ContainerLockManager(serverDir, mockDocker as any);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("readLock", () => {
    it("returns null when no lock file exists", async () => {
      const result = await lockManager.readLock();
      expect(result).toBeNull();
    });

    it("reads existing lock file correctly", async () => {
      const lock: ContainerLock = {
        tag: "v1.0.0",
        digest: "sha256:abc123",
        pulledAt: "2025-01-25T10:00:00.000Z",
      };

      const lockPath = path.join(serverDir, "container.lock");
      await fs.writeFile(lockPath, JSON.stringify(lock));

      const result = await lockManager.readLock();
      expect(result).toEqual(lock);
    });

    it("throws error for malformed lock file", async () => {
      const lockPath = path.join(serverDir, "container.lock");
      await fs.writeFile(lockPath, "invalid json");

      await expect(lockManager.readLock()).rejects.toThrow(
        "Failed to read container lock file"
      );
    });
  });

  describe("writeLock", () => {
    it("creates server directory and writes lock file", async () => {
      const newServerDir = path.join(tempDir, "servers", "new-server");
      const newLockManager = new ContainerLockManager(
        newServerDir,
        mockDocker as any
      );

      const lock: ContainerLock = {
        tag: "latest",
        digest: "sha256:def456",
        pulledAt: "2025-01-25T11:00:00.000Z",
      };

      await newLockManager.writeLock(lock);

      const lockPath = path.join(newServerDir, "container.lock");
      const content = await fs.readFile(lockPath, "utf8");
      expect(JSON.parse(content)).toEqual(lock);
    });
  });

  describe.skip("getRemoteDigest (requires network/registry API mocking)", () => {
    it("extracts digest from RepoDigests", async () => {
      mockDocker.setImageData("myimage:latest", {
        RepoDigests: ["docker.io/myimage@sha256:abcdef123456"],
      });

      const digest = await lockManager.getRemoteDigest("myimage", "latest");
      expect(digest).toBe("sha256:abcdef123456");
    });

    it("throws error when image not found", async () => {
      await expect(
        lockManager.getRemoteDigest("nonexistent", "latest")
      ).rejects.toThrow("Image nonexistent:latest not found");
    });

    it("throws error when no RepoDigests available", async () => {
      mockDocker.setImageData("myimage:latest", {
        RepoDigests: [],
      });

      await expect(
        lockManager.getRemoteDigest("myimage", "latest")
      ).rejects.toThrow("No digest available for myimage:latest");
    });
  });

  describe.skip("shouldPullImage (requires network/registry API mocking)", () => {
    const image = "myimage";
    const digest1 = "sha256:abc123";
    const digest2 = "sha256:def456";

    beforeEach(() => {
      // Set up mock to return digest1 by default
      mockDocker.setImageData("myimage:v1.0.0", {
        RepoDigests: [`docker.io/myimage@${digest1}`],
      });
      mockDocker.setImageData("myimage:v2.0.0", {
        RepoDigests: [`docker.io/myimage@${digest2}`],
      });
    });

    it("should pull when no lock exists (first time)", async () => {
      const decision = await lockManager.shouldPullImage(image, {
        tag: "v1.0.0",
        pullWhenDigestChanges: false,
      });

      expect(decision).toEqual({
        shouldPull: true,
        reason: "First time pulling image, creating trust anchor",
        isError: false,
      });
    });

    it("should pull when tag changes", async () => {
      // Create existing lock
      const existingLock: ContainerLock = {
        tag: "v1.0.0",
        digest: digest1,
        pulledAt: "2025-01-25T10:00:00.000Z",
      };
      await lockManager.writeLock(existingLock);

      const decision = await lockManager.shouldPullImage(image, {
        tag: "v2.0.0",
        pullWhenDigestChanges: false,
      });

      expect(decision).toEqual({
        shouldPull: true,
        reason: "Tag changed from v1.0.0 to v2.0.0",
        isError: false,
      });
    });

    it("should skip pull when tag and digest unchanged", async () => {
      // Create existing lock
      const existingLock: ContainerLock = {
        tag: "v1.0.0",
        digest: digest1,
        pulledAt: "2025-01-25T10:00:00.000Z",
      };
      await lockManager.writeLock(existingLock);

      const decision = await lockManager.shouldPullImage(image, {
        tag: "v1.0.0",
        pullWhenDigestChanges: false,
      });

      expect(decision).toEqual({
        shouldPull: false,
        reason: "Image digest matches lock file, no pull needed",
        isError: false,
      });
    });

    it("should error when digest changes but pullWhenDigestChanges=false", async () => {
      // Create existing lock with digest1
      const existingLock: ContainerLock = {
        tag: "v1.0.0",
        digest: digest1,
        pulledAt: "2025-01-25T10:00:00.000Z",
      };
      await lockManager.writeLock(existingLock);

      // Mock returns digest2 for same tag
      mockDocker.setImageData("myimage:v1.0.0", {
        RepoDigests: [`docker.io/myimage@${digest2}`],
      });

      const decision = await lockManager.shouldPullImage(image, {
        tag: "v1.0.0",
        pullWhenDigestChanges: false,
      });

      expect(decision).toEqual({
        shouldPull: false,
        reason: `Digest changed (${digest1} → ${digest2}) but pullWhenDigestChanges=false`,
        isError: true,
      });
    });

    it("should pull when digest changes and pullWhenDigestChanges=true", async () => {
      // Create existing lock with digest1
      const existingLock: ContainerLock = {
        tag: "v1.0.0",
        digest: digest1,
        pulledAt: "2025-01-25T10:00:00.000Z",
      };
      await lockManager.writeLock(existingLock);

      // Mock returns digest2 for same tag
      mockDocker.setImageData("myimage:v1.0.0", {
        RepoDigests: [`docker.io/myimage@${digest2}`],
      });

      const decision = await lockManager.shouldPullImage(image, {
        tag: "v1.0.0",
        pullWhenDigestChanges: true,
      });

      expect(decision).toEqual({
        shouldPull: true,
        reason: `Digest changed (${digest1} → ${digest2}), updating with pullWhenDigestChanges=true`,
        isError: false,
      });
    });

    it("should skip pull when remote digest check fails", async () => {
      // Create existing lock
      const existingLock: ContainerLock = {
        tag: "v1.0.0",
        digest: digest1,
        pulledAt: "2025-01-25T10:00:00.000Z",
      };
      await lockManager.writeLock(existingLock);

      // No mock data set up, so remote check will fail
      const decision = await lockManager.shouldPullImage("unknown", {
        tag: "v1.0.0",
        pullWhenDigestChanges: false,
      });

      expect(decision.shouldPull).toBe(false);
      expect(decision.reason).toContain("Cannot check remote digest");
      expect(decision.isError).toBe(false);
    });
  });

  describe("updateLockAfterPull", () => {
    it("creates new lock file with current timestamp", async () => {
      const beforeTime = new Date();

      await lockManager.updateLockAfterPull(
        "myimage",
        "v1.0.0",
        "sha256:abc123"
      );

      const afterTime = new Date();
      const lock = await lockManager.readLock();

      expect(lock).not.toBeNull();
      expect(lock!.tag).toBe("v1.0.0");
      expect(lock!.digest).toBe("sha256:abc123");
      expect(new Date(lock!.pulledAt).getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime()
      );
      expect(new Date(lock!.pulledAt).getTime()).toBeLessThanOrEqual(
        afterTime.getTime()
      );
    });
  });
});
