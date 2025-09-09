// pattern: Imperative Shell
// Integration tests for user mode directory path handling (without Docker operations)

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type SpawnFunction, withProcess } from "../helpers/spawn-cli-v2.js";
import {
  cleanupTestEnvironment,
  createTempProjectDir,
  createTempUserDir,
  createUserConfig,
  runUserModeCommand,
  TEST_NODE_SERVER_CONFIG,
} from "../helpers/user-mode-utils.js";

describe("User Mode Path Integration Tests", () => {
  let tempUserDir: string;
  let tempProjectDir: string;
  let cleanupPaths: string[];

  beforeEach(async () => {
    tempUserDir = await createTempUserDir();
    tempProjectDir = await createTempProjectDir();
    cleanupPaths = [tempUserDir, tempProjectDir];
  });

  afterEach(async () => {
    await cleanupTestEnvironment(cleanupPaths);
  });

  describe("Node Server User Mode", () => {
    it(
      "should attempt to install node server in user directory",
      withProcess(async (spawn: SpawnFunction) => {
        // Create user config with node server
        await createUserConfig(tempUserDir, TEST_NODE_SERVER_CONFIG);

        // Run install --user (should attempt npm install)
        const result = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );

        // Should succeed in user mode
        expect(result.exitCode).toBe(0);

        // Should indicate it's working in user mode
        const output = result.stdout + result.stderr;
        expect(output).toContain("user mode");
      })
    );

    it(
      "should load user config from user directory",
      withProcess(async (spawn: SpawnFunction) => {
        // Create user config
        await createUserConfig(tempUserDir, TEST_NODE_SERVER_CONFIG);

        // Any command that loads config should find the user config
        const result = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"] // This will fail but should load config first
        );

        // Should see evidence of config loading and user mode operation
        const output = result.stdout + result.stderr;
        expect(output).toContain("user mode");
      })
    );

    it(
      "should fail gracefully when user config is missing",
      withProcess(async (spawn: SpawnFunction) => {
        // Don't create any user config

        // Run command that requires user config
        const result = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );

        // Should fail with config-related error
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("config");
      })
    );
  });

  describe("User Directory Path Verification", () => {
    it(
      "should respect --user-dir flag consistently",
      withProcess(async (spawn: SpawnFunction) => {
        // Create config in user directory
        await createUserConfig(tempUserDir, TEST_NODE_SERVER_CONFIG);

        // Run install with --user-dir
        const installResult = await runUserModeCommand(
          spawn,
          tempUserDir,
          tempProjectDir,
          ["install", "--user"]
        );

        // Should load config and work in user mode
        const output = installResult.stdout + installResult.stderr;
        expect(output).toContain("user mode");
      })
    );
  });
});
