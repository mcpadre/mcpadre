// pattern: Imperative Shell
import { spawn } from "child_process";
import { setTimeout as setTimeoutPromise } from "timers/promises";
import { afterAll, describe, expect, it } from "vitest";

import { cleanupChildProcessStreams } from "../helpers/stream-cleanup.js";

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../test-utils/json-rpc/types.js";

// Direct echo server process management for MCP testing
// Note: This file tests the echo server directly, not through the CLI,
// so it doesn't use spawn-cli-v2 helpers which are for CLI integration testing

describe("McpEchoServer Integration Tests", () => {
  // Track spawned processes for cleanup
  const spawnedProcesses = new Set<ReturnType<typeof spawn>>();

  afterAll(async () => {
    // Clean up any remaining processes with proper stream cleanup
    for (const proc of spawnedProcesses) {
      try {
        // CRITICAL: Clean up streams first to prevent file handle leaks
        await cleanupChildProcessStreams(proc);

        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      } catch {
        // Process might already be dead
      }
    }
    spawnedProcesses.clear();
  });

  // Helper function to spawn the echo server process using tsx
  async function spawnEchoServer(): Promise<{
    process: ReturnType<typeof spawn>;
    sendJsonRpc: (
      message: JsonRpcRequest,
      timeoutMs?: number
    ) => Promise<JsonRpcResponse>;
    cleanup: () => Promise<void>;
  }> {
    const childProcess = spawn(
      "npx",
      ["tsx", "src/test-utils/mcp/echo-server.ts"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd(),
      }
    );

    // Track process for cleanup
    spawnedProcesses.add(childProcess);

    // Give the process time to start
    await setTimeoutPromise(100);

    const sendJsonRpc = async (
      message: JsonRpcRequest,
      timeoutMs = 5000
    ): Promise<JsonRpcResponse> => {
      return new Promise((resolve, reject) => {
        let responseReceived = false;
        const timeoutId = setTimeout(() => {
          if (!responseReceived) {
            reject(
              new Error(`Timeout waiting for response after ${timeoutMs}ms`)
            );
          }
        }, timeoutMs);

        // Listen for response
        childProcess.stdout.once("data", data => {
          responseReceived = true;
          clearTimeout(timeoutId);

          try {
            const response = JSON.parse(
              data.toString().trim()
            ) as JsonRpcResponse;
            resolve(response);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error}`));
          }
        });

        // Send request
        const messageStr = `${JSON.stringify(message)}\n`;
        childProcess.stdin.write(messageStr);
      });
    };

    const cleanup = async (): Promise<void> => {
      try {
        // CRITICAL: Clean up streams first to prevent file handle leaks
        await cleanupChildProcessStreams(childProcess);

        childProcess.kill("SIGTERM");
        // Give process time to exit gracefully, then force kill
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill("SIGKILL");
          }
        }, 2000);
      } catch {
        // Process might already be dead
      } finally {
        spawnedProcesses.delete(childProcess);
      }
    };

    return {
      process: childProcess,
      sendJsonRpc,
      cleanup,
    };
  }

  it("should handle complete MCP initialization sequence", async () => {
    const server = await spawnEchoServer();

    try {
      // Send MCP initialize request
      const initializeRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            resources: {},
          },
          clientInfo: {
            name: "integration-test-client",
            version: "1.0.0",
          },
        },
      };

      const initResponse = await server.sendJsonRpc(initializeRequest);

      // Validate initialize response
      expect(initResponse).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocol_version: "2024-11-05",
          capabilities: {
            tools: {},
            resources: {},
          },
          server_info: {
            name: "mcp-echo-server",
            version: "1.0.0",
          },
        },
      });

      // Test tools/list after initialization
      const toolsRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      };

      const toolsResponse = await server.sendJsonRpc(toolsRequest);
      expect(toolsResponse).toMatchObject({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [],
        },
      });

      // Test resources/list after initialization
      const resourcesRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 3,
        method: "resources/list",
        params: {},
      };

      const resourcesResponse = await server.sendJsonRpc(resourcesRequest);
      expect(resourcesResponse).toMatchObject({
        jsonrpc: "2.0",
        id: 3,
        result: {
          resources: [],
        },
      });
    } finally {
      await server.cleanup();
    }
  });

  it("should handle echo behavior for non-protocol methods", async () => {
    const server = await spawnEchoServer();

    try {
      // Test echo without initialization (should work)
      const echoRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 5,
        method: "custom/test/method",
        params: { test: "data" },
      };

      const echoResponse = await server.sendJsonRpc(echoRequest);
      expect(echoResponse).toMatchObject({
        jsonrpc: "2.0",
        id: 5,
        result: {
          method: "custom/test/method",
        },
      });

      // Test different method name
      const anotherEchoRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 6,
        method: "foobar",
        params: null,
      };

      const anotherEchoResponse = await server.sendJsonRpc(anotherEchoRequest);
      expect(anotherEchoResponse).toMatchObject({
        jsonrpc: "2.0",
        id: 6,
        result: {
          method: "foobar",
        },
      });
    } finally {
      await server.cleanup();
    }
  });

  it("should handle malformed JSON with parse errors", async () => {
    const server = await spawnEchoServer();

    try {
      // Send malformed JSON directly to stdin
      const malformedJson = '{"invalid": json}\n';

      const response = await new Promise<JsonRpcResponse>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("Timeout waiting for error response"));
        }, 5000);

        server.process.stdout?.once("data", data => {
          clearTimeout(timeoutId);
          try {
            const response = JSON.parse(
              data.toString().trim()
            ) as JsonRpcResponse;
            resolve(response);
          } catch (error) {
            reject(new Error(`Failed to parse error response: ${error}`));
          }
        });

        server.process.stdin?.write(malformedJson);
      });

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700, // Parse error
          message: expect.stringContaining("Parse error"),
        },
      });
    } finally {
      await server.cleanup();
    }
  });

  it("should handle multiple rapid requests correctly", async () => {
    const server = await spawnEchoServer();

    try {
      // Send multiple echo requests sequentially to avoid race conditions
      const requests: JsonRpcRequest[] = [
        { jsonrpc: "2.0", id: 1, method: "echo1" },
        { jsonrpc: "2.0", id: 2, method: "echo2" },
        { jsonrpc: "2.0", id: 3, method: "echo3" },
      ];

      const responses: JsonRpcResponse[] = [];

      // Send requests one by one to ensure proper ordering
      for (const request of requests) {
        const response = await server.sendJsonRpc(request, 3000);
        responses.push(response);
      }

      // Verify all responses
      expect(responses).toHaveLength(3);

      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        const expectedId = i + 1;
        const expectedMethod = `echo${expectedId}`;

        expect(response).toMatchObject({
          jsonrpc: "2.0",
          id: expectedId,
          result: {
            method: expectedMethod,
          },
        });
      }
    } finally {
      await server.cleanup();
    }
  });

  it("should handle SIGTERM gracefully", async () => {
    const server = await spawnEchoServer();

    // Send SIGTERM signal
    const exitPromise = new Promise<{
      code: number | null;
      signal: string | null;
    }>(resolve => {
      server.process.on("exit", (code, signal) => {
        resolve({ code, signal });
      });
    });

    // Give server a moment to fully start
    await setTimeoutPromise(200);

    server.process.kill("SIGTERM");

    // Wait for graceful shutdown
    const exitResult = await Promise.race([
      exitPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Server did not shut down within 3 seconds"));
        }, 3000);
      }),
    ]);

    // Process should terminate either gracefully (with numeric exit code) or via signal (code=null, signal=SIGTERM)
    const isGracefulExit =
      typeof exitResult.code === "number" && exitResult.signal === null;
    const isSignalTermination =
      exitResult.code === null && exitResult.signal === "SIGTERM";

    expect(isGracefulExit || isSignalTermination).toBe(true);
  });

  it("should handle stdin close gracefully", async () => {
    const server = await spawnEchoServer();

    // Close stdin to simulate client disconnect
    const exitPromise = new Promise<number | null>(resolve => {
      server.process.on("exit", code => {
        resolve(code);
      });
    });

    // Give server a moment to fully start
    await setTimeoutPromise(200);

    server.process.stdin?.end();

    // Wait for graceful shutdown
    const exitCode = await Promise.race([
      exitPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Server did not shut down within 3 seconds"));
        }, 3000);
      }),
    ]);

    // Accept various exit codes as long as server shuts down
    expect(typeof exitCode).toBe("number");
  });

  it("should handle protocol violations correctly", async () => {
    const server = await spawnEchoServer();

    try {
      // Try tools/list before initialization
      const prematureToolsRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 10,
        method: "tools/list",
      };

      const errorResponse = await server.sendJsonRpc(prematureToolsRequest);

      expect(errorResponse).toMatchObject({
        jsonrpc: "2.0",
        id: 10,
        error: {
          code: -32600, // Invalid request
          message: "Server not initialized",
        },
      });

      // Now initialize
      const initRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 11,
        method: "initialize",
        params: {},
      };
      await server.sendJsonRpc(initRequest);

      // Try to initialize again (should fail)
      const doubleInitRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 12,
        method: "initialize",
        params: {},
      };

      const doubleInitResponse = await server.sendJsonRpc(doubleInitRequest);

      expect(doubleInitResponse).toMatchObject({
        jsonrpc: "2.0",
        id: 12,
        error: {
          code: -32600, // Invalid request
          message: expect.stringContaining("already initialized"),
        },
      });
    } finally {
      await server.cleanup();
    }
  });
});
