// pattern: Functional Core
// Functional testing of sandbox capabilities (bubblewrap, sandbox-exec)

import * as os from "node:os";

import type { ExecutionResult, SandboxCapabilities } from "./types.js";

// Execute a command with timeout and capture output
async function executeCommand(
  command: string,
  args: string[] = [],
  timeoutMs = 10000
): Promise<ExecutionResult> {
  try {
    const { execa } = await import("execa");
    const result = await execa(command, args, {
      timeout: timeoutMs,
      reject: false, // Don't throw on non-zero exit codes
    });

    return {
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      ...(result.exitCode !== 0 && { error: `Exit code: ${result.exitCode}` }),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Test bubblewrap availability and functionality on Linux
async function testBubblewrap(): Promise<SandboxCapabilities["bubblewrap"]> {
  // First check if bubblewrap is available
  const versionResult = await executeCommand("bwrap", ["--version"]);

  if (!versionResult.success) {
    return {
      available: false,
      functionalTest: {
        passed: false,
        error: versionResult.error ?? "bwrap not found",
      },
    };
  }

  // Parse version if available
  let version: string | undefined;
  if (versionResult.stdout) {
    const versionMatch = versionResult.stdout.match(/bwrap\s+(\d+\.\d+\.\d+)/i);
    if (versionMatch) {
      version = versionMatch[1];
    }
  }

  // Functional test: run a simple sandboxed command
  // Use a minimal sandbox that binds the root filesystem read-only
  // and runs /bin/echo with a test message
  const testMessage = "mcpadre-sandbox-test";
  const functionalResult = await executeCommand("bwrap", [
    "--ro-bind",
    "/",
    "/",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    "/bin/echo",
    testMessage,
  ]);

  const functionalTestPassed =
    functionalResult.success && functionalResult.stdout?.trim() === testMessage;

  return {
    available: true,
    ...(version && { version }),
    functionalTest: {
      passed: functionalTestPassed,
      ...(!functionalTestPassed && {
        error:
          functionalResult.error ??
          `Expected "${testMessage}", got "${functionalResult.stdout?.trim()}"`,
      }),
    },
  };
}

// Test sandbox-exec availability and functionality on macOS
async function testSandboxExec(): Promise<SandboxCapabilities["sandboxExec"]> {
  // sandbox-exec doesn't have a --version flag, so test availability differently
  // Try to run sandbox-exec with invalid args to see if it exists
  const availabilityResult = await executeCommand("sandbox-exec", ["-h"], 5000);

  // sandbox-exec exists if we get either success or a specific error about usage
  const isAvailable =
    availabilityResult.success || availabilityResult.stderr?.includes("usage:");

  if (!isAvailable) {
    return {
      available: false,
      functionalTest: {
        passed: false,
        error: availabilityResult.error ?? "sandbox-exec not found",
      },
    };
  }

  // Functional test: run a simple sandboxed command
  // Use a basic sandbox profile that allows basic operations
  const testMessage = "mcpadre-sandbox-test";
  const sandboxProfile = "(version 1)(allow default)"; // Minimal permissive profile

  const functionalResult = await executeCommand("sandbox-exec", [
    "-p",
    sandboxProfile,
    "/bin/echo",
    testMessage,
  ]);

  const functionalTestPassed =
    functionalResult.success && functionalResult.stdout?.trim() === testMessage;

  return {
    available: true,
    functionalTest: {
      passed: functionalTestPassed,
      ...(!functionalTestPassed && {
        error:
          functionalResult.error ??
          `Expected "${testMessage}", got "${functionalResult.stdout?.trim()}"`,
      }),
    },
  };
}

// Main function to test sandbox capabilities based on platform
export async function testSandboxCapabilities(): Promise<SandboxCapabilities> {
  const platform = os.platform();
  const result: SandboxCapabilities = {
    platform,
  };

  if (platform === "linux") {
    // Test bubblewrap on Linux
    const bubblewrapResult = await testBubblewrap();
    if (bubblewrapResult) {
      result.bubblewrap = bubblewrapResult;
    }
  } else if (platform === "darwin") {
    // Test sandbox-exec on macOS
    const sandboxExecResult = await testSandboxExec();
    if (sandboxExecResult) {
      result.sandboxExec = sandboxExecResult;
    }
  }
  // On other platforms (Windows, etc.), we don't test sandbox capabilities

  return result;
}
