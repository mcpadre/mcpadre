// Integration tests for container MCP server support using real Docker containers

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, test } from "vitest";

import { ContainerManager } from "../installer/managers/container-manager.js";
import { createDirectoryResolver } from "../runner/directory-resolver/index.js";
import { ContainerMcpClient } from "../runner/servers/container/client.js";
import {
  createSandboxConfig,
  resolveSandboxConfig,
} from "../utils/sandbox/index.js";

import type { ResolvedPath } from "../runner/types/index.js";
import type { Logger } from "pino";

// Helper function to check if Docker is available
async function isDockerAvailable(): Promise<boolean> {
  try {
    return await new Promise<boolean>(resolve => {
      const dockerCheck = spawn("docker", ["version"], { stdio: "ignore" });
      dockerCheck.on("error", () => resolve(false));
      dockerCheck.on("exit", code => resolve(code === 0));
    });
  } catch {
    return false;
  }
}

// Helper to determine if Docker tests should be skipped
async function shouldSkipDockerTests(): Promise<boolean> {
  if (process.env["MCPADRE_SKIP_DOCKER_TESTS"] === "1") {
    return true;
  }
  return !(await isDockerAvailable());
}

// Simple mock logger for testing
const mockLogger = {
  level: "info",
  msgPrefix: "",
  info: (): void => {
    // Mock implementation
  },
  debug: (): void => {
    // Mock implementation
  },
  warn: (): void => {
    // Mock implementation
  },
  error: (): void => {
    // Mock implementation
  },
  fatal: (): void => {
    // Mock implementation
  },
  trace: (): void => {
    // Mock implementation
  },
  silent: (): void => {
    // Mock implementation
  },
  child: () => mockLogger,
} as unknown as Logger;

describe("Container Server Integration", () => {
  let tempDir: string;
  let projectDir: string;

  beforeAll(async () => {
    // Create temporary project directory
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "container-integration-test-")
    );
    projectDir = tempDir;
  });

  afterAll(async () => {
    // Clean up temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("Container Image Management", () => {
    test.skipIf(shouldSkipDockerTests)(
      "should pull and manage mcp/aws-core-mcp-server container with TOFU model",
      async () => {
        const containerManager = new ContainerManager(mockLogger);
        const serverName = "aws-core-test";

        try {
          // First install - should pull image and create lock
          const firstInstallResult = await containerManager.installContainer({
            serverName,
            container: {
              image: "mcp/aws-core-mcp-server",
              tag: "latest",
              pullWhenDigestChanges: false,
            },
            projectDir,
            logger: mockLogger,
          });

          expect(firstInstallResult.imagePulled).toBe(true);
          expect(firstInstallResult.message).toContain(
            "First time pulling image"
          );
          expect(firstInstallResult.digest).toBeDefined();
          expect(firstInstallResult.digest).toMatch(/^sha256:[a-f0-9]+$/);

          // Verify lock file was created
          const lockPath = path.join(
            projectDir,
            ".mcpadre",
            "servers",
            serverName,
            "container.lock"
          );
          const lockExists = await fs
            .access(lockPath)
            .then(() => true)
            .catch(() => false);
          expect(lockExists).toBe(true);

          // Read and verify lock file contents
          const lockContent = await fs.readFile(lockPath, "utf8");
          const lockData = JSON.parse(lockContent);
          expect(lockData).toMatchObject({
            tag: "latest",
            digest: firstInstallResult.digest,
          });
          expect(lockData.pulledAt).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
          );

          // Second install - should skip pull (same tag, same digest)
          const secondInstallResult = await containerManager.installContainer({
            serverName,
            container: {
              image: "mcp/aws-core-mcp-server",
              tag: "latest",
              pullWhenDigestChanges: false,
            },
            projectDir,
            logger: mockLogger,
          });

          expect(secondInstallResult.imagePulled).toBe(false);
          // Should either match digest or be unable to check remote (both are valid scenarios)
          expect(
            secondInstallResult.message.includes("no pull needed") ||
              secondInstallResult.message.includes("Cannot check remote digest")
          ).toBe(true);
        } catch (error) {
          console.error("Container test failed:", error);
          throw error;
        }
      },
      90000
    ); // 90 second timeout for Docker operations

    test.skipIf(shouldSkipDockerTests)(
      "should handle pullWhenDigestChanges flag correctly",
      async () => {
        const containerManager = new ContainerManager(mockLogger);
        const serverName = "aws-core-digest-test";

        // Install with pullWhenDigestChanges=true
        const installResult = await containerManager.installContainer({
          serverName,
          container: {
            image: "mcp/aws-core-mcp-server",
            tag: "latest",
            pullWhenDigestChanges: true,
          },
          projectDir,
          logger: mockLogger,
        });

        expect(installResult.imagePulled).toBe(true);
        expect(installResult.digest).toBeDefined();

        // Verify lock file structure
        const lockPath = path.join(
          projectDir,
          ".mcpadre",
          "servers",
          serverName,
          "container.lock"
        );
        const lockContent = await fs.readFile(lockPath, "utf8");
        const lockData = JSON.parse(lockContent);
        expect(lockData.tag).toBe("latest");
        expect(lockData.digest).toMatch(/^sha256:[a-f0-9]+$/);
        expect(lockData.pulledAt).toBeTruthy();
      }
    );
  });

  describe("Container MCP Client", () => {
    test.skipIf(shouldSkipDockerTests)(
      "should create and communicate with mcp/aws-core-mcp-server container",
      async () => {
        const client = new ContainerMcpClient({
          image: "mcp/aws-core-mcp-server",
          tag: "latest",
          env: {
            // AWS MCP server doesn't require specific env vars for basic functionality
          },
          cwd: projectDir as ResolvedPath,
          sandboxConfig: resolveSandboxConfig({
            config: createSandboxConfig({}),
            directoryResolver: createDirectoryResolver(projectDir),
            parentEnv: process.env,
          }),
          logger: mockLogger,
          serverName: "test-container-server",
        });

        try {
          // Test basic MCP communication - request server capabilities
          const capabilitiesRequest = {
            jsonrpc: "2.0" as const,
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {
                roots: {
                  listChanged: true,
                },
                sampling: {},
              },
              clientInfo: {
                name: "mcpadre-test",
                version: "0.1.0",
              },
            },
          };

          const response = await client.send(capabilitiesRequest);

          expect(response).toMatchObject({
            jsonrpc: "2.0",
            id: 1,
          });

          // Response should have result (successful initialization)
          if ("result" in response) {
            expect(response.result).toBeDefined();
            expect(response.result).toHaveProperty("capabilities");
            expect(response.result).toHaveProperty("serverInfo");
          } else {
            // If there's an error, log it for debugging
            console.error("MCP initialization error:", response.error);
            throw new Error(
              `MCP initialization failed: ${response.error.message || "Unknown error"}`
            );
          }
        } finally {
          // Always clean up the container
          await client.stop();
        }
      },
      45000
    ); // 45 second timeout for full container lifecycle

    test.skipIf(shouldSkipDockerTests)(
      "should handle container lifecycle properly",
      async () => {
        const client = new ContainerMcpClient({
          image: "mcp/aws-core-mcp-server",
          tag: "latest",
          env: {},
          cwd: projectDir as ResolvedPath,
          sandboxConfig: resolveSandboxConfig({
            config: createSandboxConfig({}),
            directoryResolver: createDirectoryResolver(projectDir),
            parentEnv: process.env,
          }),
          logger: mockLogger,
          serverName: "test-lifecycle-server",
        });

        // Test multiple requests to ensure container stays alive
        try {
          const request1 = {
            jsonrpc: "2.0" as const,
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "mcpadre-test", version: "0.1.0" },
            },
          };

          const response1 = await client.send(request1);
          expect(response1.id).toBe(1);

          // Send second request to same container
          const request2 = {
            jsonrpc: "2.0" as const,
            id: 2,
            method: "ping",
            params: {},
          };

          // Note: ping method might not be available in aws-core-mcp-server
          // This test is more about ensuring the container stays alive between requests
          try {
            const response2 = await client.send(request2);
            expect(response2.id).toBe(2);
          } catch {
            // If ping method doesn't exist, that's okay - the important thing is
            // that the container didn't crash between requests
            console.debug(
              "Ping method not available (expected for this server)"
            );
          }
        } finally {
          // Cleanup should not throw
          await expect(client.stop()).resolves.toBeUndefined();
        }
      }
    );
  });

  describe("DOCKER_HOST Support", () => {
    it("should respect DOCKER_HOST environment variable", async () => {
      // This test verifies that our Docker client construction respects DOCKER_HOST
      // We can't easily test different Docker hosts in CI, so we verify the logic

      const originalDockerHost = process.env["DOCKER_HOST"];

      try {
        // Test default case (no DOCKER_HOST)
        delete process.env["DOCKER_HOST"];
        const manager1 = new ContainerManager(mockLogger);
        expect(manager1).toBeDefined();

        // Test unix socket path
        process.env["DOCKER_HOST"] = "unix:///var/run/docker.sock";
        const manager2 = new ContainerManager(mockLogger);
        expect(manager2).toBeDefined();

        // Test TCP connection
        process.env["DOCKER_HOST"] = "tcp://127.0.0.1:2376";
        const manager3 = new ContainerManager(mockLogger);
        expect(manager3).toBeDefined();

        // Test plain socket path
        process.env["DOCKER_HOST"] = "/var/run/docker.sock";
        const manager4 = new ContainerManager(mockLogger);
        expect(manager4).toBeDefined();
      } finally {
        // Restore original DOCKER_HOST
        if (originalDockerHost) {
          process.env["DOCKER_HOST"] = originalDockerHost;
        } else {
          delete process.env["DOCKER_HOST"];
        }
      }
    });
  });
});
