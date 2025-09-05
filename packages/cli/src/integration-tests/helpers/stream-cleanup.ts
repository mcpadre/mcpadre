// pattern: Functional Core
// Stream cleanup utilities for preventing file handle leaks in integration tests

import type { ChildProcess } from "child_process";
import type { ResultPromise } from "execa";

/**
 * Clean up all streams associated with an execa process to prevent file handle leaks
 *
 * This function closes stdin, stdout, and stderr streams and removes all event listeners.
 * Must be called before process termination to prevent the 107+ file handle leaks
 * that were plaguing our integration tests.
 *
 * @param process The execa ResultPromise process to clean up
 */
export async function cleanupExecaStreams(
  process: ResultPromise
): Promise<void> {
  try {
    // Close stdin if it's writable and not already closed
    if (process.stdin && !process.stdin.destroyed) {
      process.stdin.removeAllListeners();
      if (process.stdin.writable) {
        process.stdin.end();
      }
      process.stdin.destroy();
    }

    // Clean up stdout
    if (process.stdout && !process.stdout.destroyed) {
      process.stdout.removeAllListeners();
      process.stdout.destroy();
    }

    // Clean up stderr
    if (process.stderr && !process.stderr.destroyed) {
      process.stderr.removeAllListeners();
      process.stderr.destroy();
    }

    // Give a brief moment for streams to close
    await new Promise(resolve => setTimeout(resolve, 25));
  } catch {
    // Ignore stream cleanup errors - streams might already be closed
    // This is expected during cleanup and not a problem
  }
}

/**
 * Clean up all streams associated with a raw child process to prevent file handle leaks
 *
 * @param process The raw ChildProcess to clean up
 */
export async function cleanupChildProcessStreams(
  process: ChildProcess
): Promise<void> {
  try {
    // Close stdin if it's writable and not already closed
    if (process.stdin && !process.stdin.destroyed) {
      process.stdin.removeAllListeners();
      if (process.stdin.writable) {
        process.stdin.end();
      }
      process.stdin.destroy();
    }

    // Clean up stdout
    if (process.stdout && !process.stdout.destroyed) {
      process.stdout.removeAllListeners();
      process.stdout.destroy();
    }

    // Clean up stderr
    if (process.stderr && !process.stderr.destroyed) {
      process.stderr.removeAllListeners();
      process.stderr.destroy();
    }

    // Give a brief moment for streams to close
    await new Promise(resolve => setTimeout(resolve, 25));
  } catch {
    // Ignore stream cleanup errors - streams might already be closed
  }
}
