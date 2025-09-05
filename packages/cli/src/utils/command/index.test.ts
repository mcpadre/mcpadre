// pattern: Imperative Shell
import pino from "pino";
import { describe, expect, it } from "vitest";

import { CommandBuilder, createCommand } from "./index.js";

describe("CommandBuilder", () => {
  const logger = pino({ level: "silent" });

  it("should execute simple commands using builder pattern", async () => {
    const result = await createCommand("echo", logger)
      .arg("hello")
      .arg("world")
      .output();

    expect(result).toBe("hello world");
  });

  it("should execute commands with multiple args", async () => {
    const result = await createCommand("echo", logger)
      .addArgs(["hello", "from", "builder"])
      .output();

    expect(result).toBe("hello from builder");
  });

  it("should execute commands with environment variables", async () => {
    const result = await createCommand("echo", logger)
      .arg("$TEST_VAR")
      .envs({ TEST_VAR: "test-value" })
      .useShell(true)
      .output();

    expect(result).toBe("test-value");
  });

  it("should extract process name correctly for logger", async () => {
    // Test with path
    let builder = new CommandBuilder("/usr/bin/echo", logger);
    expect((builder as any).childLogger.bindings().process).toBe("echo");

    // Test with extension
    builder = new CommandBuilder("node.exe", logger);
    expect((builder as any).childLogger.bindings().process).toBe("node");

    // Test with simple command
    builder = new CommandBuilder("grep", logger);
    expect((builder as any).childLogger.bindings().process).toBe("grep");
  });

  it("should handle command failures", async () => {
    await expect(
      createCommand("exit", logger).arg("1").useShell(true).output()
    ).rejects.toThrow();
  });
});
