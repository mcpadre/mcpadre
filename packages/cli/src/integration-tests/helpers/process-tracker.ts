// pattern: Functional Core
// Global process tracker to prevent orphaned test processes

import treeKill from "tree-kill";

import {
  cleanupChildProcessStreams,
  cleanupExecaStreams,
} from "./stream-cleanup.js";

import type { ChildProcess } from "child_process";
import type { ResultPromise } from "execa";

/**
 * Global registry of all spawned test processes
 * This ensures cleanup even if tests fail or timeout
 */
class ProcessTracker {
  private processes = new Set<ResultPromise>();
  private rawProcesses = new Set<ChildProcess>();

  /**
   * Register a process for tracking and automatic cleanup
   */
  track(process: ResultPromise): ResultPromise {
    this.processes.add(process);

    // Remove from tracking when process exits naturally
    process
      .finally(() => {
        this.processes.delete(process);
      })
      .catch(() => {
        // Ignore errors in cleanup
      });

    return process;
  }

  /**
   * Track a raw child process for cleanup
   */
  trackRaw(process: ChildProcess): ChildProcess {
    this.rawProcesses.add(process);

    // Remove from tracking when process exits naturally
    process.on("exit", () => {
      this.rawProcesses.delete(process);
    });

    return process;
  }

  /**
   * Kill all tracked processes immediately with timeout
   * Enhanced with safe tree-kill to terminate entire process trees
   */
  async killAll(): Promise<void> {
    const totalCount = this.processes.size + this.rawProcesses.size;
    if (totalCount === 0) return;

    // eslint-disable-next-line no-console
    console.log(
      `[ProcessTracker] Cleaning up ${totalCount} spawned processes...`
    );

    const killPromises: Promise<void>[] = [];

    // Kill execa processes (these are our main CLI spawns)
    for (const process of this.processes) {
      killPromises.push(this.forceKillProcess(process));
    }

    // Kill raw child processes
    for (const process of this.rawProcesses) {
      killPromises.push(this.forceKillRaw(process));
    }

    // Note: tree-kill now handles child process cleanup automatically
    // No need for dangerous system-wide process killing

    // Add timeout to prevent hanging - this is critical!
    const cleanupPromise = Promise.allSettled(killPromises);
    const timeoutPromise = new Promise<void>(resolve => {
      setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn(
          "[ProcessTracker] Cleanup timeout reached, forcing completion..."
        );
        resolve();
      }, 1000); // 1 second max cleanup time - more aggressive
    });

    await Promise.race([cleanupPromise, timeoutPromise]);

    // Force clear the sets regardless
    this.processes.clear();
    this.rawProcesses.clear();

    // eslint-disable-next-line no-console
    console.log(`[ProcessTracker] Process cleanup completed`);
  }

  /**
   * Force kill a single process with tree-kill for safe cleanup
   * Enhanced with tree killing to ensure all child processes are terminated
   */
  private async forceKillProcess(process: ResultPromise): Promise<void> {
    try {
      // CRITICAL: Clean up streams first to prevent file handle leaks
      await cleanupExecaStreams(process);

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (process.exitCode !== undefined && process.exitCode !== null) {
        return; // Already exited
      }

      // Get the process PID if available
      const pid = process.pid;
      if (pid) {
        // Use tree-kill to safely kill the entire process tree
        await new Promise<void>(resolve => {
          treeKill(pid, "SIGKILL", () => {
            // Callback fired when kill is attempted (success or failure)
            resolve();
          });

          // Timeout after 200ms to prevent hanging
          setTimeout(resolve, 200);
        });
      } else {
        // Fallback to direct kill if no PID available
        process.kill("SIGKILL");
      }

      // Give it a very short time to die, then move on
      await Promise.race([
        process.catch(() => {
          /* Process exited, that's what we wanted */
        }),
        new Promise(resolve => setTimeout(resolve, 100)), // Only 0.1 second
      ]);
    } catch {
      // Ignore ALL errors during forced cleanup - processes may already be dead
      // This is expected and not a problem
    }
  }

  /**
   * Force kill a raw child process with tree-kill for safe cleanup
   * Enhanced with tree killing to ensure all child processes are terminated
   */
  private async forceKillRaw(process: ChildProcess): Promise<void> {
    try {
      // CRITICAL: Clean up streams first to prevent file handle leaks
      await cleanupChildProcessStreams(process);

      if (process.exitCode !== null || process.killed) {
        return; // Already exited
      }

      // Get the process PID
      const pid = process.pid;
      if (pid) {
        // Use tree-kill to safely kill the entire process tree
        await new Promise<void>(resolve => {
          treeKill(pid, "SIGKILL", () => {
            // Callback fired when kill is attempted (success or failure)
            resolve();
          });

          // Timeout after 200ms to prevent hanging
          setTimeout(resolve, 200);
        });
      } else {
        // Fallback to direct kill if no PID available
        process.kill("SIGKILL");
      }

      // Brief wait then move on regardless
      await new Promise<void>(resolve => {
        const timeout = setTimeout(() => resolve(), 100); // Only 0.1 second
        process.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } catch {
      // Ignore ALL errors during forced cleanup
      // Processes may already be dead, PIDs may be reused, etc.
    }
  }

  /**
   * Get count of tracked processes (for debugging)
   */
  getTrackedCount(): number {
    return this.processes.size + this.rawProcesses.size;
  }
}

// Global singleton instance
const globalTracker = new ProcessTracker();

/**
 * Track a process globally to ensure cleanup
 * This should be used by all test process spawning
 */
export function trackProcess<T extends ResultPromise>(process: T): T {
  return globalTracker.track(process) as T;
}

/**
 * Track a raw child process globally to ensure cleanup
 */
export function trackRawProcess<T extends ChildProcess>(process: T): T {
  return globalTracker.trackRaw(process) as T;
}

/**
 * Kill all tracked processes immediately
 * For use in global test teardown
 */
export async function killAllTrackedProcesses(): Promise<void> {
  await globalTracker.killAll();
}

/**
 * Get count of currently tracked processes
 */
export function getTrackedProcessCount(): number {
  return globalTracker.getTrackedCount();
}
