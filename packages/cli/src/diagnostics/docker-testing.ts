// pattern: Functional Core
// Docker connectivity and availability testing for diagnostics

import type { DockerStatus, ExecutionResult } from "./types.js";

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

// Parse Docker version from version output
function parseDockerVersion(stdout: string): string | undefined {
  // Docker version output typically contains:
  // "Docker version 20.10.17, build 100c701"
  const versionMatch = stdout.match(/Docker version\s+(\d+\.\d+\.\d+)/i);
  if (versionMatch) {
    return versionMatch[1];
  }

  // Try other patterns
  const altVersionMatch = stdout.match(/version[:\s]+(\d+\.\d+\.\d+)/i);
  if (altVersionMatch) {
    return altVersionMatch[1];
  }

  return undefined;
}

// Test Docker CLI availability and get version
async function testDockerCLI(): Promise<{
  available: boolean;
  version?: string;
  error?: string;
}> {
  const result = await executeCommand("docker", ["--version"]);

  if (result.success && result.stdout) {
    const version = parseDockerVersion(result.stdout);
    return {
      available: true,
      ...(version && { version }),
    };
  }

  return {
    available: false,
    error: result.error ?? result.stderr ?? "Docker CLI not found",
  };
}

// Test Docker daemon connectivity
async function testDockerDaemon(): Promise<{
  running: boolean;
  error?: string;
}> {
  // Try to connect to Docker daemon with a simple command
  const result = await executeCommand("docker", ["version"], 15000);

  if (result.success) {
    return { running: true };
  }

  // Check if it's a daemon connection issue vs CLI issue
  let error = result.error ?? result.stderr ?? "Unknown Docker daemon error";

  // Common Docker daemon error patterns
  if (result.stderr) {
    if (result.stderr.includes("Cannot connect to the Docker daemon")) {
      error = "Docker daemon not running or not accessible";
    } else if (result.stderr.includes("permission denied")) {
      error = "Docker daemon connection denied - check user permissions";
    } else if (
      result.stderr.includes("dial unix") &&
      result.stderr.includes("connect: no such file or directory")
    ) {
      error = "Docker daemon socket not found - daemon not running";
    } else if (
      result.stderr.includes("dial unix") &&
      result.stderr.includes("connect: permission denied")
    ) {
      error = "Docker daemon socket permission denied";
    }
  }

  return {
    running: false,
    ...(error && { error }),
  };
}

// Alternative daemon test using docker info (lighter than docker version)
async function testDockerInfo(): Promise<{ running: boolean; error?: string }> {
  const result = await executeCommand("docker", ["info"], 10000);

  if (result.success) {
    return { running: true };
  }

  const error = result.error ?? result.stderr ?? "Docker daemon info failed";
  return {
    running: false,
    ...(error && { error }),
  };
}

// Main function to test Docker status
export async function testDockerStatus(): Promise<DockerStatus> {
  // First test if Docker CLI is available
  const cliTest = await testDockerCLI();

  if (!cliTest.available) {
    return {
      available: false,
      daemon: {
        running: false,
        ...(cliTest.error && { error: cliTest.error }),
      },
    };
  }

  // CLI is available, now test daemon connectivity
  // Try both docker version and docker info to get comprehensive status
  const [daemonTest, infoTest] = await Promise.all([
    testDockerDaemon(),
    testDockerInfo(),
  ]);

  // If either test passes, daemon is running
  const daemonRunning = daemonTest.running || infoTest.running;

  // Use the more specific error if available
  const daemonError = daemonRunning
    ? undefined
    : (daemonTest.error ?? infoTest.error);

  return {
    available: true,
    ...(cliTest.version && { version: cliTest.version }),
    daemon: {
      running: daemonRunning,
      ...(daemonError && { error: daemonError }),
    },
  };
}
