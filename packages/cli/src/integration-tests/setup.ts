// pattern: Imperative Shell
// Global test setup for integration tests - ensures process cleanup

import { afterAll, beforeAll } from "vitest";

import {
  getTrackedProcessCount,
  killAllTrackedProcesses,
} from "./helpers/process-tracker.js";

// Global flag to track if we're already cleaning up
let isCleaningUp = false;

/**
 * Emergency cleanup function - kills all tracked processes immediately
 * This is called by signal handlers and normal test cleanup
 */
async function emergencyCleanup(reason: string): Promise<void> {
  if (isCleaningUp) {
    return; // Already cleaning up, avoid recursion
  }

  isCleaningUp = true;

  try {
    const trackedCount = getTrackedProcessCount();
    if (trackedCount > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[TestSetup] ${reason}: Found ${trackedCount} tracked processes, force killing...`
      );
      await killAllTrackedProcesses();
    }

    // eslint-disable-next-line no-console
    console.log(`[TestSetup] ${reason}: Process cleanup completed`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[TestSetup] ${reason}: Cleanup error:`, error);
  }
}

// Global setup to track and cleanup processes
beforeAll(() => {
  // eslint-disable-next-line no-console
  console.log("[TestSetup] Integration test session started");

  // CRITICAL: Install signal handlers to catch external termination
  // This addresses the hanging process issue when Vitest is killed externally

  const cleanExit = async (signal: string): Promise<void> => {
    await emergencyCleanup(`Signal ${signal} received`);
    // Force exit immediately after cleanup
    process.exit(signal === "SIGTERM" ? 0 : 1);
  };

  // Handle Ctrl+C (SIGINT)
  process.on("SIGINT", () => {
    void cleanExit("SIGINT");
  });

  // Handle kill command (SIGTERM)
  process.on("SIGTERM", () => {
    void cleanExit("SIGTERM");
  });

  // Handle normal exit - this makes exit events fire for external kills
  process.on("exit", () => {
    if (!isCleaningUp) {
      // Synchronous cleanup only - we're already exiting
      const trackedCount = getTrackedProcessCount();
      if (trackedCount > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[TestSetup] Process exit: ${trackedCount} processes may remain`
        );
      }
    }
  });

  // Handle uncaught exceptions - cleanup before crash
  process.on("uncaughtException", async error => {
    // eslint-disable-next-line no-console
    console.error("[TestSetup] Uncaught exception:", error);
    await emergencyCleanup("Uncaught exception");
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", async reason => {
    // eslint-disable-next-line no-console
    console.error("[TestSetup] Unhandled rejection:", reason);
    await emergencyCleanup("Unhandled rejection");
    process.exit(1);
  });
});

// Global cleanup to kill any orphaned processes
afterAll(async () => {
  await emergencyCleanup("Test suite completed");

  // eslint-disable-next-line no-console
  console.log(
    "[TestSetup] Integration test session ended, all processes cleaned up"
  );

  // Force exit after a short delay to ensure cleanup completes
  // This is necessary because some spawned processes might have lingering handles
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.log("[TestSetup] Forcing process exit to prevent hanging");
    process.exit(0);
  }, 500);
}, 10000); // Give afterAll 10 seconds max
