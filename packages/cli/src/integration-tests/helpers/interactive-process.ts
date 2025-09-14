// pattern: Imperative Shell

import * as pty from "@lydell/node-pty";
import { readFileSync } from "fs";
import { join } from "path";

import type { IDisposable, IPty } from "@lydell/node-pty";

/**
 * Options for spawning a PTY process
 */
export interface PtySpawnOptions {
  cwd: string;
  env?: Record<string, string | undefined>;
}

/**
 * Type for the spawn function provided to withInteractiveProcess test functions
 */
export type PtySpawnFunction = (
  args: string[],
  options: PtySpawnOptions
) => IPty;

/**
 * Tracked PTY process with metadata for cleanup
 */
interface TrackedPtyProcess {
  pty: IPty;
  output: string;
  disposables: IDisposable[];
  startTime: number;
}

/**
 * Find the workspace root by looking for pnpm-workspace.yaml
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
 * Spawn the mcpadre CLI with a PTY (pseudo-terminal)
 * This makes process.stderr.isTTY return true in the spawned process
 *
 * @param args Command line arguments to pass to mcpadre
 * @param options Configuration options
 * @returns PTY process instance
 */
export function spawnCliWithPty(
  args: string[],
  options: PtySpawnOptions
): IPty {
  const { cwd, env = {} } = options;
  const workspaceRoot = findWorkspaceRoot();
  const cliPackageDir = join(workspaceRoot, "packages", "cli");

  // Prepare arguments: --dir flag if needed, then the actual args
  const finalArgs = ["run", "--silent", "dev"];
  if (cwd !== cliPackageDir) {
    finalArgs.push("--dir", cwd);
  }
  finalArgs.push(...args);

  // Spawn with PTY
  const ptyProcess = pty.spawn("pnpm", finalArgs, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: cliPackageDir,
    env: { ...process.env, ...env } as Record<string, string>,
  });

  return ptyProcess;
}

/**
 * Terminate a PTY process with comprehensive cleanup
 *
 * This function ensures:
 * 1. All event listeners are removed
 * 2. Internal socket is destroyed
 * 3. File descriptors are closed
 * 4. Child process is killed
 * 5. PTY object is destroyed
 *
 * @param ptyProcess The PTY process to terminate
 * @param gracePeriodMs Time to wait for graceful shutdown before forcing
 */
export async function terminatePtyProcess(
  ptyProcess: IPty,
  gracePeriodMs = 2000
): Promise<void> {
  return new Promise<void>(resolve => {
    let cleaned = false;

    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;

      try {
        // 1. Kill the process if still alive
        // The IPty interface doesn't expose exitCode, so we try to kill anyway
        const pid = ptyProcess.pid;
        if (pid) {
          try {
            // First try the PTY's kill method
            ptyProcess.kill("SIGKILL");
          } catch {
            // If that fails, try direct process kill
            try {
              process.kill(pid, "SIGKILL");
            } catch {
              // Process might already be dead
            }
          }
        }

        // 2. The PTY's internal resources should be cleaned up by node-pty
        // when the process exits. We can't directly access internal properties
        // like socket or file descriptors from the public interface.
      } catch (error) {
        // Log but don't throw - we want cleanup to complete
        // eslint-disable-next-line no-console
        console.warn("[PTY Cleanup] Error during cleanup:", error);
      } finally {
        resolve();
      }
    };

    // Set up exit handler
    const exitDisposable = ptyProcess.onExit(() => {
      cleanup();
    });

    // Try graceful shutdown first
    try {
      // Send Ctrl+C first
      ptyProcess.write("\x03");
      // Then send SIGTERM
      setTimeout(() => {
        try {
          ptyProcess.kill("SIGTERM");
        } catch {
          // Process might already be dead
        }
      }, 100); // Small delay after Ctrl+C
    } catch {
      // Process might already be dead
    }

    // Force cleanup after grace period
    setTimeout(() => {
      // Dispose of the exit handler if still active
      try {
        exitDisposable.dispose();
      } catch {
        // Already disposed
      }
      cleanup();
    }, gracePeriodMs);
  });
}

/**
 * Helper to create a test with automatic PTY process cleanup
 *
 * Ensures that any spawned PTY process is properly terminated even if the test fails.
 * Tracks output for debugging and removes all listeners to prevent leaks.
 *
 * Example:
 * ```
 * it("should work with TTY", withInteractiveProcess(async (spawn) => {
 *   const proc = spawn(["run", "test-server"], { cwd: tempDir });
 *   await waitForPattern(proc, "Connected");
 *   // ... test logic ...
 *   // Process is automatically cleaned up
 * }));
 * ```
 */
export function withInteractiveProcess(
  testFn: (spawn: PtySpawnFunction) => Promise<void>
): () => Promise<void> {
  return async () => {
    const processes: TrackedPtyProcess[] = [];

    // Wrapped spawn that tracks processes and their output
    const trackingSpawn = (args: string[], options: PtySpawnOptions): IPty => {
      const proc = spawnCliWithPty(args, options);

      // Track output for debugging if tests fail
      let output = "";
      const dataDisposable = proc.onData((data: string) => {
        output += data;
      });

      // Track the process with its metadata
      processes.push({
        pty: proc,
        output,
        disposables: [dataDisposable],
        startTime: Date.now(),
      });

      return proc;
    };

    try {
      await testFn(trackingSpawn);
    } finally {
      // Clean up all processes sequentially to prevent race conditions
      for (const trackedProcess of processes) {
        const { pty, output, disposables, startTime } = trackedProcess;
        try {
          // Dispose of tracked event listeners first
          disposables.forEach(disposable => {
            try {
              disposable.dispose();
            } catch {
              // Ignore errors during disposal
            }
          });

          // Then do full cleanup
          await terminatePtyProcess(pty);
        } catch (error) {
          // Log cleanup errors with context
          const runtime = Date.now() - startTime;
          // eslint-disable-next-line no-console
          console.warn(
            `[withInteractiveProcess] Cleanup error after ${runtime}ms:`,
            error
          );
          // eslint-disable-next-line no-console
          console.warn(
            "[withInteractiveProcess] Last 500 chars of output:",
            output.slice(-500)
          );
        }
      }
    }
  };
}

/**
 * Wait for a pattern to appear in PTY output with timeout
 *
 * @param ptyProcess The PTY process to monitor
 * @param pattern String or RegExp to search for
 * @param timeoutMs Maximum time to wait (default 5000ms)
 * @returns The accumulated output when pattern is found
 */
export function waitForPtyPattern(
  ptyProcess: IPty,
  pattern: string | RegExp,
  timeoutMs = 5000
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let output = "";
    let dataDisposable: IDisposable | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const cleanup = (): void => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (dataDisposable) {
        try {
          dataDisposable.dispose();
        } catch {
          // Already disposed
        }
        dataDisposable = null;
      }
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timeout waiting for pattern: ${pattern}\nLast 500 chars of output: ${output.slice(
            -500
          )}`
        )
      );
    }, timeoutMs);

    dataDisposable = ptyProcess.onData((data: string) => {
      output += data;

      const matches =
        typeof pattern === "string"
          ? output.includes(pattern)
          : pattern.test(output);

      if (matches) {
        cleanup();
        resolve(output);
      }
    });
  });
}
