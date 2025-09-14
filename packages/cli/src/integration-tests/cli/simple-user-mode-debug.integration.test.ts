// pattern: Imperative Shell
// Simplified test to debug user mode CLI interaction

import { describe, expect, it } from "vitest";

import { type SpawnFunction, withProcess } from "../helpers/spawn-cli-v2.js";
import {
  createTempUserDir,
  runUserModeCommand,
} from "../helpers/user-mode-utils.js";

describe("Simple User Mode Debug", () => {
  it(
    "should run basic --help with --user-dir",
    withProcess(async (spawn: SpawnFunction) => {
      const tempUserDir = await createTempUserDir();

      // Just test that --user-dir + --help works without hanging
      const result = await spawn(["--user-dir", tempUserDir, "--help"], {
        buffer: true,
      });
      expect(result.exitCode).toBe(0);
    })
  );

  it(
    "should handle install --user with missing config gracefully",
    withProcess(async (spawn: SpawnFunction) => {
      const tempUserDir = await createTempUserDir();
      const tempProjectDir = await createTempUserDir(); // Use as project dir

      // This should fail gracefully, not hang
      const result = await runUserModeCommand(
        spawn,
        tempUserDir,
        tempProjectDir,
        ["install", "--user"]
      );

      // Should fail with config error, not hang
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("config");
    })
  );
});
