// pattern: Functional Core
// This file provides simplified helpers for spawning and interacting with the mcpadre CLI
// in integration tests, using execa's modern streaming capabilities.

import { execa } from "execa";
import { readFileSync } from "fs";
import { join } from "path";
import { setTimeout } from "timers/promises";

import { trackProcess } from "./process-tracker.js";
import { cleanupExecaStreams } from "./stream-cleanup.js";

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../test-utils/json-rpc/types.js";
import type { ResultPromise } from "execa";

/**
 * Type for the spawn function provided to withProcess test functions
 */
export type SpawnFunction = (
  args: string[],
  options?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    buffer?: boolean;
  }
) => ResultPromise;

/**
 * Find the workspace root by looking for pnpm-workspace.yaml
 * This is a pure function that traverses the directory tree
 */
function findWorkspaceRoot(): string {
  let workspaceRoot = process.cwd();

  while (workspaceRoot !== "/" && workspaceRoot !== ".") {
    try {
      const pnpmWorkspacePath = join(workspaceRoot, "pnpm-workspace.yaml");
      readFileSync(pnpmWorkspacePath, "utf8");
      return workspaceRoot;
    } catch {
      // pnpm-workspace.yaml not found, continue searching up
    }
    workspaceRoot = join(workspaceRoot, "..");
  }

  return process.cwd(); // Fallback to current directory
}

/**
 * Internal function to spawn the mcpadre CLI process
 *
 * This is a thin wrapper around execa that handles the pnpm workspace setup.
 * Returns the raw execa child process with streams attached.
 *
 * ⚠️  INTERNAL USE ONLY - Use withProcess() instead to ensure proper cleanup
 *
 * @param args Command line arguments to pass to mcpadre
 * @param options Configuration options
 * @returns ResultPromise with live streams
 */
function spawnCli(
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    buffer?: boolean; // Enable buffering for quick-exit processes
  } = {}
): ResultPromise {
  const { cwd = process.cwd(), env = {}, buffer = true } = options;
  const workspaceRoot = findWorkspaceRoot();

  // If cwd is provided and different from workspace root, prepend --dir
  let finalArgs = args;
  if (cwd !== workspaceRoot) {
    finalArgs = ["--dir", cwd, ...args];
  }

  // CRITICAL: DO NOT CHANGE THIS IMPLEMENTATION!
  // This MUST run pnpm from the CLI package directory, NOT using --filter from workspace root
  // Using --filter causes argument passing issues where CLI flags are not properly received
  // This was debugged and fixed - changing this will break all integration tests
  const cliPackageDir = join(workspaceRoot, "packages", "cli");
  const childProcess = execa("pnpm", ["run", "--silent", "dev", ...finalArgs], {
    cwd: cliPackageDir,
    env: { ...process.env, ...env },
    buffer, // Default to true for error cases, can be disabled for streaming
    reject: false, // Don't throw on non-zero exit codes
  }) as ResultPromise;

  // Track the process for automatic cleanup
  return trackProcess(childProcess);
}

/**
 * Wait for a specific pattern to appear in the process output
 *
 * Uses async iteration over stdout/stderr to monitor output in real-time.
 * This avoids the race conditions of event-based approaches.
 *
 * Example:
 * ```
 * const proc = spawnCli(["run", "my-server"]);
 * const output = await waitForPattern(proc, "Connected to my-server", 5000);
 * console.log("Found pattern in output:", output);
 * ```
 *
 * @param childProcess The spawned process to monitor
 * @param pattern String or RegExp to search for
 * @param timeoutMs Maximum time to wait (default 5000ms)
 * @param stream Which stream(s) to monitor
 * @returns The accumulated output when pattern is found
 */
export async function waitForPattern(
  childProcess: ResultPromise,
  pattern: string | RegExp,
  timeoutMs = 5000,
  stream: "stdout" | "stderr" | "both" = "both"
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let accumulated = "";

  // Helper to check if pattern matches
  const matches = (text: string): boolean => {
    return pattern instanceof RegExp
      ? pattern.test(text)
      : text.includes(pattern);
  };

  // Set up timeout promise
  const timeoutPromise = setTimeout(timeoutMs).then(() => {
    throw new Error(
      `Timeout waiting for pattern "${pattern}" after ${timeoutMs}ms\n` +
        `Accumulated output: ${accumulated.slice(-500)}` // Last 500 chars
    );
  });

  // Set up pattern search promise with proper event listener cleanup
  const searchPromise = (async () => {
    // Create an async iterator that combines streams if needed
    const streams = [];
    if (stream === "stdout" || stream === "both") {
      streams.push(childProcess.stdout);
    }
    if (stream === "stderr" || stream === "both") {
      streams.push(childProcess.stderr);
    }

    // Store event handlers for cleanup
    const eventHandlers = new Map<
      NodeJS.ReadableStream,
      (chunk: Buffer) => void
    >();

    try {
      // Monitor the selected streams
      for (const streamToRead of streams) {
        if (!streamToRead) continue;

        const dataHandler = (chunk: Buffer): void => {
          const text = chunk.toString();
          accumulated += text;

          if (matches(accumulated)) {
            // Pattern found - we'll resolve via the check below
          }
        };

        // Store handler for cleanup
        eventHandlers.set(streamToRead, dataHandler);
        streamToRead.on("data", dataHandler);
      }

      // Poll for pattern match or timeout
      while (Date.now() < deadline) {
        if (matches(accumulated)) {
          return accumulated;
        }
        await setTimeout(100); // Check every 100ms
      }

      throw new Error(`Pattern "${pattern}" not found in output`);
    } finally {
      // CRITICAL: Clean up all event listeners to prevent memory leaks
      for (const [streamToRead, handler] of eventHandlers) {
        streamToRead.removeListener("data", handler);
      }
      eventHandlers.clear();
    }
  })();

  // Race between timeout and finding the pattern
  return Promise.race([timeoutPromise, searchPromise]);
}

/**
 * Send a JSON-RPC request and wait for a response
 *
 * Handles the common pattern of sending a JSON-RPC message via stdin
 * and waiting for a response with a matching ID on stdout.
 *
 * Example:
 * ```
 * const proc = spawnCli(["run", "test-server"]);
 * await waitForPattern(proc, "Connected");
 *
 * const response = await sendJsonRpc(proc, {
 *   jsonrpc: "2.0",
 *   method: "initialize",
 *   id: 1,
 *   params: { ... }
 * });
 *
 * expect(response.result).toBeDefined();
 * ```
 *
 * @param childProcess The spawned process
 * @param request The JSON-RPC request to send
 * @param timeoutMs Maximum time to wait for response
 * @returns The parsed JSON-RPC response
 */
export async function sendJsonRpc(
  childProcess: ResultPromise,
  request: JsonRpcRequest,
  timeoutMs = 5000
): Promise<JsonRpcResponse> {
  // Send the request
  const requestStr = `${JSON.stringify(request)}\n`;
  childProcess.stdin?.write(requestStr);

  // Wait for a response with matching ID
  const responsePattern = new RegExp(`"id"\\s*:\\s*${request.id}`);
  const output = await waitForPattern(
    childProcess,
    responsePattern,
    timeoutMs,
    "stdout"
  );

  // Extract and parse the JSON-RPC response
  // Split by newlines and find the line containing our response
  const lines = output.split("\n");
  const responseLine = lines.find(line => {
    try {
      const parsed = JSON.parse(line);
      return parsed.id === request.id;
    } catch {
      return false;
    }
  });

  if (!responseLine) {
    throw new Error(
      `No valid JSON-RPC response found for request ID ${request.id}`
    );
  }

  return JSON.parse(responseLine) as JsonRpcResponse;
}

/**
 * Gracefully terminate a CLI process
 *
 * Attempts SIGTERM first, then SIGKILL if needed.
 * This is automatically handled by the process tracker, but can be called explicitly.
 *
 * Example:
 * ```
 * const proc = spawnCli(["run", "test-server"]);
 * // ... do tests ...
 * await terminateProcess(proc);
 * ```
 *
 * @param childProcess The process to terminate
 * @param gracePeriodMs Time to wait for graceful shutdown before forcing
 */
export async function terminateProcess(
  childProcess: ResultPromise,
  gracePeriodMs = 2000
): Promise<void> {
  // If process already exited, nothing to do except clean up streams
  if (childProcess.exitCode !== null) {
    await cleanupExecaStreams(childProcess);
    return;
  }

  try {
    // CRITICAL: Close streams first to prevent handle leaks
    await cleanupExecaStreams(childProcess);

    // Try graceful termination first
    childProcess.kill("SIGTERM");

    // Set up a race between graceful exit and timeout
    const gracefulExit = childProcess.catch(() => {
      // Process exited (possibly with error), that's fine
    });

    const forceKill = new Promise<void>(resolve => {
      const timer = globalThis.setTimeout(() => {
        if (childProcess.exitCode === null) {
          childProcess.kill("SIGKILL");
        }
        resolve();
      }, gracePeriodMs);

      // Clear timer if graceful exit happens first
      gracefulExit.finally(() => globalThis.clearTimeout(timer));
    });

    await Promise.race([gracefulExit, forceKill]);
  } catch (error) {
    // Process might already be dead, that's okay
    // eslint-disable-next-line no-console
    console.warn("[terminateProcess] Error terminating process:", error);
  }
}

/**
 * Helper to create a test with automatic process cleanup
 *
 * Ensures that any spawned process is properly terminated even if the test fails.
 * Uses sequential cleanup to prevent race conditions and ensure proper stream cleanup.
 *
 * Example:
 * ```
 * it("should do something", withProcess(async (spawn) => {
 *   const proc = await spawn(["run", "test-server"]);
 *   await waitForPattern(proc, "Connected");
 *   // ... test logic ...
 *   // Process is automatically cleaned up
 * }));
 * ```
 */
export function withProcess(
  testFn: (spawn: SpawnFunction) => Promise<void>
): () => Promise<void> {
  return async () => {
    const processes: ResultPromise[] = [];

    // Wrapped spawn that tracks processes
    const trackingSpawn = (
      ...args: Parameters<typeof spawnCli>
    ): ResultPromise => {
      const proc = spawnCli(...args);
      processes.push(proc);
      return proc;
    };

    try {
      await testFn(trackingSpawn);
    } finally {
      // CRITICAL: Clean up processes sequentially to prevent race conditions
      // Parallel cleanup can cause stream cleanup to interfere with each other
      for (const proc of processes) {
        try {
          await terminateProcess(proc);
        } catch (error) {
          // Log cleanup errors but don't fail the test
          // eslint-disable-next-line no-console
          console.warn("[withProcess] Error cleaning up process:", error);
        }
      }
    }
  };
}

// Usage examples in comments:

/*
// Example 1: Testing an error case (process exits quickly)
it("should handle invalid server name", withProcess(async (spawn) => {
  const proc = spawn(["run", "non-existent"], { cwd: projectDir });
  const result = await proc;  // Wait for exit
  
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("Server 'non-existent' not found");
}));

// Example 2: Testing successful connection (long-running process)
it("should connect successfully", withProcess(async (spawn) => {
  const proc = spawn(["run", "test-server"], { cwd: projectDir });
  
  await waitForPattern(proc, "Connected to test-server");
  
  const initResponse = await sendJsonRpc(proc, {
    jsonrpc: "2.0",
    method: "initialize",
    id: 1,
    params: { protocolVersion: "2024-11-05" }
  });
  
  expect(initResponse.result).toBeDefined();
  // Process automatically cleaned up when test ends
}));

// Example 3: Using the withProcess helper for multiple operations
it("should handle multiple operations", withProcess(async (spawn) => {
  const proc = spawn(["run", "test-server"]);
  await waitForPattern(proc, "Connected");
  
  // Do multiple JSON-RPC calls
  const response1 = await sendJsonRpc(proc, { ... });
  const response2 = await sendJsonRpc(proc, { ... });
  
  expect(response1.result).toBeDefined();
  expect(response2.result).toBeDefined();
  // Process automatically cleaned up when test ends
}));
*/
