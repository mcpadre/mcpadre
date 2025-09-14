import fs from "fs";
import path from "path";
import { expect } from "vitest";

import { withProcess } from "./spawn-cli-v2.js";

import type { TempProject } from "../../test-utils/project/temp-project.js";

/**
 * Interface representing the context for a specific mode (user or project)
 */
export interface ModeContext {
  /**
   * The mode name: "user" or "project"
   */
  mode: "user" | "project";

  /**
   * CLI flags to add for this mode
   */
  flags: string[];

  /**
   * Environment variables to set for this mode
   */
  env: Record<string, string | undefined>;

  /**
   * Helper to get the config path for this mode
   */
  getConfigPath: () => string;

  /**
   * Helper to get the config directory for this mode
   */
  getConfigDir: () => string;

  /**
   * User-friendly label for error messages
   */
  modeLabel: string;

  /**
   * Expected success message templates for different commands
   */
  successMessages: {
    add?: string;
    remove?: string;
    [key: string]: string | undefined;
  };

  /**
   * Creates required directories and initial config for this mode
   */
  setup: () => Promise<void>;

  /**
   * Cleans up resources for this mode
   */
  cleanup: () => Promise<void>;

  /**
   * Write a config file with the given content
   */
  writeConfig: (content: string) => Promise<void>;
}

/**
 * Creates a user mode context with the necessary setup
 */
export function createUserModeContext(
  tempDir: string,
  initialConfig = ""
): ModeContext {
  const userDir = path.join(tempDir, ".mcpadre");
  const userConfigPath = path.join(userDir, "mcpadre.yaml");
  // Create a fake home directory within the temp directory to prevent
  // integration tests from creating files in the real user's home directory
  const fakeHomeDir = path.join(tempDir, "fake-home");

  return {
    mode: "user",
    flags: ["--user"],
    env: {
      MCPADRE_USER_DIR: userDir,
      HOME: fakeHomeDir,
      // Override Claude Code's user-level config to use test directory
      MCPADRE_CLAUDE_CODE_USER_FILE_PATH: path.join(
        fakeHomeDir,
        ".claude.json"
      ),
    },
    getConfigPath: () => userConfigPath,
    getConfigDir: () => userDir,
    modeLabel: "user configuration",
    successMessages: {
      add: "Added {} to user configuration",
      remove: "Removed {} from user configuration",
    },
    setup: async () => {
      await fs.promises.mkdir(userDir, { recursive: true });
      await fs.promises.mkdir(fakeHomeDir, { recursive: true });
      if (initialConfig) {
        await fs.promises.writeFile(userConfigPath, initialConfig, "utf8");
      }
    },
    cleanup: async () => {
      // Cleanup will be handled by the test's overall temp directory cleanup
    },
    writeConfig: async (content: string) => {
      await fs.promises.writeFile(userConfigPath, content, "utf8");
    },
  };
}

/**
 * Creates a project mode context with the necessary setup
 */
export function createProjectModeContext(
  tempProject: TempProject
): ModeContext {
  return {
    mode: "project",
    flags: [],
    env: {},
    getConfigPath: () => tempProject.configPath,
    getConfigDir: () => tempProject.path,
    modeLabel: "project configuration",
    successMessages: {
      add: "Added {} to project configuration",
      remove: "Removed {} from project configuration",
    },
    setup: async () => {
      // Project setup is already handled by the tempProject creation
    },
    cleanup: async () => {
      // Project cleanup is handled separately
    },
    writeConfig: async (content: string) => {
      await fs.promises.writeFile(tempProject.configPath, content, "utf8");
    },
  };
}

/**
 * Executes a command with mode-specific context using the withProcess helper
 */
export function executeCommandTest(
  modeContext: ModeContext,
  command: string[],
  options: { buffer?: boolean } = {}
): () => Promise<void> {
  return withProcess(async spawn => {
    const allArgs = [...command, ...modeContext.flags].filter(Boolean);
    await spawn(allArgs, {
      cwd: modeContext.getConfigDir(),
      env: { ...process.env, ...modeContext.env },
      buffer: options.buffer ?? true,
    });
    // No return value needed to match the withProcess signature
  });
}

/**
 * Verifies that a config file contains or doesn't contain specific content
 */
export async function verifyConfig(
  configPath: string,
  {
    shouldContain = [],
    shouldNotContain = [],
  }: {
    shouldContain?: string[];
    shouldNotContain?: string[];
  }
): Promise<void> {
  const content = await fs.promises.readFile(configPath, "utf8");

  for (const text of shouldContain) {
    expect(content).toContain(text);
  }

  for (const text of shouldNotContain) {
    expect(content).not.toContain(text);
  }
}

/**
 * Helper to verify command output contains expected text
 */
export function verifyOutput(
  result: {
    stdout?: string | Buffer;
    stderr?: string | Buffer;
    exitCode: number;
  },
  {
    expectedInStdout = [],
    expectedInStderr = [],
    expectedExitCode = 0,
  }: {
    expectedInStdout?: string[];
    expectedInStderr?: string[];
    expectedExitCode?: number;
  }
): void {
  expect(result.exitCode).toBe(expectedExitCode);

  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";

  for (const text of expectedInStdout) {
    expect(stdout).toContain(text);
  }

  for (const text of expectedInStderr) {
    expect(stderr).toContain(text);
  }
}

/**
 * Creates a parameterized test for adding a host
 */
export function createHostAddTest(hostName: string) {
  return (modeContext: ModeContext) => {
    return executeCommandTest(modeContext, ["host", "add", hostName]);
  };
}

/**
 * Creates a parameterized test for removing a host
 */
export function createHostRemoveTest(hostName: string) {
  return (modeContext: ModeContext) => {
    return executeCommandTest(modeContext, ["host", "remove", hostName]);
  };
}

/**
 * Creates a parameterized test for server operations
 */
export function createServerCommandTest(
  operation: "add" | "remove",
  serverName: string,
  options: { extraFlags?: string[] } = {}
) {
  const { extraFlags = [] } = options;

  return (modeContext: ModeContext) => {
    return executeCommandTest(modeContext, [
      "server",
      operation,
      serverName,
      ...extraFlags,
    ]);
  };
}

/**
 * Creates a parameterized test for outdated command
 */
export function createOutdatedCommandTest(
  options: { format?: "json" | "table"; extraFlags?: string[] } = {}
) {
  const { format = "table", extraFlags = [] } = options;
  const formatFlag = format === "json" ? ["--json"] : [];

  return (modeContext: ModeContext) => {
    return executeCommandTest(modeContext, [
      "outdated",
      ...formatFlag,
      ...extraFlags,
    ]);
  };
}
