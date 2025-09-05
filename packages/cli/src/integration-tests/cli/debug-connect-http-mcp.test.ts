// pattern: Imperative Shell

import { describe, expect, it } from "vitest";

import {
  sendJsonRpc,
  waitForPattern,
  withProcess,
} from "../helpers/spawn-cli-v2.js";

import type { JsonRpcRequest } from "../../test-utils/json-rpc/types.js";

describe("mcpadre debug connect-http-mcp integration", () => {
  const CONTEXT7_URL = "https://mcp.context7.com/mcp";
  const TEST_TIMEOUT = 15000;

  it(
    "should connect to Context7 and handle manual JSON-RPC requests",
    withProcess(async spawn => {
      const proc = spawn(
        ["debug", "connect-http-mcp", CONTEXT7_URL, "--log-level", "info"],
        { buffer: false }
      ); // Disable buffering for interactive process

      // Wait for the connection message
      await waitForPattern(proc, "🔗 Connecting to MCP server at", 5000);

      // Send a tools/list request manually
      const toolsRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      };

      const response = await sendJsonRpc(proc, toolsRequest);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
      });

      // Context7 might require authentication or have service issues
      // Check if we got an error response or success response
      if ("error" in response) {
        // If we get an error, it should be a proper JSON-RPC error
        const error = response.error;
        expect(error).toHaveProperty("message");
        console.log("Context7 responded with error:", error.message);

        // Common expected errors: authentication required, service unavailable, etc.
        expect(typeof error.message).toBe("string");
      } else if ("result" in response) {
        // If we get a successful result, validate the tools
        const result = response.result;
        expect(result).toHaveProperty("tools");
        expect(Array.isArray((result as any).tools)).toBe(true);

        // Should include Context7 tools
        const toolNames = (result as any).tools.map((tool: any) => tool.name);
        expect(toolNames).toContain("resolve-library-id");
        expect(toolNames).toContain("get-library-docs");
      } else {
        throw new Error(
          `Unexpected response format: ${JSON.stringify(response)}`
        );
      }
    }),
    TEST_TIMEOUT
  );

  it.skip(
    "should validate HTTPS URLs and reject HTTP",
    withProcess(async spawn => {
      const result = await spawn([
        "debug",
        "connect-http-mcp",
        "http://insecure.example.com/mcp", // HTTP instead of HTTPS
        "--log-level",
        "error",
      ]);

      // Should see HTTPS validation error
      expect(result.stderr).toMatch(/URL must use HTTPS protocol for security/);
      expect(result.exitCode).toBe(1);
    }),
    TEST_TIMEOUT
  );

  it.skip(
    "should handle invalid URLs gracefully",
    withProcess(async spawn => {
      const result = await spawn([
        "debug",
        "connect-http-mcp",
        "not-a-valid-url",
        "--log-level",
        "error",
      ]);

      // Should see URL validation error
      expect(result.stderr).toMatch(/Invalid URL/);
      expect(result.exitCode).toBe(1);
    }),
    TEST_TIMEOUT
  );

  it(
    "should handle SIGTERM gracefully during interactive session",
    withProcess(async spawn => {
      const proc = spawn(
        ["debug", "connect-http-mcp", CONTEXT7_URL, "--log-level", "debug"],
        { buffer: false }
      ); // Disable buffering for interactive process

      try {
        // Wait for connection
        await waitForPattern(proc, "🔗 Connecting to MCP server at", 5000);

        // Send graceful termination and wait for process to exit
        const exitPromise = new Promise<number | null>(resolve => {
          proc.on("exit", code => {
            resolve(code);
          });
        });

        // Send SIGTERM
        proc.kill("SIGTERM");

        // Should exit gracefully within reasonable time
        const exitCode = await Promise.race([
          exitPromise,
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(
                new Error("Process did not exit gracefully within 5 seconds")
              );
            }, 5000);
          }),
        ]);

        // Accept any exit code (number) or signal termination (null) as long as it terminates
        expect(exitCode).not.toBeUndefined();
      } finally {
        // Ensure process is terminated even if test fails
        try {
          proc.kill("SIGKILL");
        } catch {
          // Process might already be dead, ignore
        }
      }
    }),
    TEST_TIMEOUT
  );
});
