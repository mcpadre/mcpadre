// pattern: Imperative Shell
// Minimal test to debug user mode integration issues

import { describe, expect, it } from "vitest";

import { type SpawnFunction, withProcess } from "../helpers/spawn-cli-v2.js";

describe("Debug User Mode", () => {
  it(
    "should run a simple command",
    withProcess(async (spawn: SpawnFunction) => {
      const result = await spawn(["--help"], { buffer: true });
      expect(result.exitCode).toBe(0);
    })
  );
});
