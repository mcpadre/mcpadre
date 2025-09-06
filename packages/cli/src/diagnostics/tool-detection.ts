// pattern: Functional Core
// Direct tool detection and version parsing for diagnostics

import { detectVersionManager } from "./version-manager-detection.js";

import type { ExecutionResult, ToolStatus } from "./types.js";

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

// Parse version from tool output using common patterns
function parseVersion(stdout: string, toolName: string): string | undefined {
  const output = stdout.trim();

  // Common version patterns
  const patterns = [
    // "v1.2.3" format
    /v(\d+\.\d+(?:\.\d+)?(?:-[\w.-]+)?)/i,
    // "1.2.3" at start of line
    /^(\d+\.\d+(?:\.\d+)?(?:-[\w.-]+)?)/m,
    // "tool 1.2.3" format
    new RegExp(
      `${toolName}[\\s:]+(\\d+\\.\\d+(?:\\.\\d+)?(?:-[\\w.-]+)?)`,
      "i"
    ),
    // "version 1.2.3" format
    /version[:\s]+(\d+\.\d+(?:\.\d+)?(?:-[\w.-]+)?)/i,
    // Extract any version-like string
    /(\d+\.\d+(?:\.\d+)?(?:-[\w.-]+)?)/,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

// Test a specific tool and return its status
async function testTool(
  toolName: string,
  versionArgs: string[] = ["--version"]
): Promise<ToolStatus> {
  const result = await executeCommand(toolName, versionArgs);

  if (result.success && result.stdout) {
    const version = parseVersion(result.stdout, toolName);
    return {
      name: toolName,
      available: true,
      ...(version && { version }),
    };
  }

  // Tool failed - check if it's due to version manager
  const errorOutput = result.stderr ?? result.error ?? "";
  const versionManager = await detectVersionManager(errorOutput, toolName);

  const errorMessage = errorOutput || result.error;
  return {
    name: toolName,
    available: false,
    ...(versionManager && { versionManager }),
    ...(errorMessage && { error: errorMessage }),
  };
}

// Test Node.js (should always be available since we're running in it)
async function testNode(): Promise<ToolStatus> {
  // We're running in Node.js, so it's definitely available
  const result = await executeCommand("node", ["--version"]);

  if (result.success && result.stdout) {
    const version = parseVersion(result.stdout, "node");
    return {
      name: "node",
      available: true,
      ...(version && { version }),
    };
  }

  // This shouldn't happen, but handle it gracefully
  return {
    name: "node",
    available: true,
    version: process.version.replace("v", ""), // Fallback to process.version
  };
}

// Test Python (try both python and python3)
async function testPython(): Promise<ToolStatus> {
  // Try python3 first (more common on modern systems)
  let result = await testTool("python3");
  if (result.available) {
    return { ...result, name: "python" }; // Normalize name
  }

  // Try python if python3 failed
  result = await testTool("python");
  return result;
}

// Test UV Python package manager
async function testUv(): Promise<ToolStatus> {
  return await testTool("uv");
}

// Test asdf version manager
async function testAsdf(): Promise<ToolStatus> {
  return await testTool("asdf");
}

// Test mise version manager
async function testMise(): Promise<ToolStatus> {
  return await testTool("mise");
}

// Main function to test all relevant tools
export async function detectTools(): Promise<ToolStatus[]> {
  const [nodeStatus, pythonStatus, uvStatus, asdfStatus, miseStatus] =
    await Promise.all([
      testNode(),
      testPython(),
      testUv(),
      testAsdf(),
      testMise(),
    ]);

  // Always include core tools (node, python, uv)
  const tools = [nodeStatus, pythonStatus, uvStatus];

  // Only include version managers if they are available
  if (asdfStatus.available) {
    tools.push(asdfStatus);
  }
  if (miseStatus.available) {
    tools.push(miseStatus);
  }

  return tools;
}
