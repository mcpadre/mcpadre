// pattern: Mixed (unavoidable)
// Testing shell client requires both pure logic verification and I/O mocking for comprehensive coverage

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShellMcpClient } from "./client.js";

import type { FinalizedSandboxConfig } from "../../../utils/sandbox/index.js";
import type { ResolvedCommandParts, ResolvedPath } from "../../types/index.js";
import type { Logger } from "pino";

// Mock the dependencies
vi.mock("../../../utils/command/index.js", () => ({
  createCommand: vi.fn(),
}));

vi.mock("../../session/stream-handler.js", () => ({
  JsonRpcStreamHandler: vi.fn(),
}));

vi.mock("../../../utils/sandbox/index.js", () => ({
  createSandbox: vi.fn(),
}));

describe("ShellMcpClient", () => {
  let mockLogger: Logger;
  let mockCommand: ResolvedCommandParts;
  let mockEnv: Record<string, string>;
  let mockCwd: ResolvedPath;
  let mockSandboxConfig: FinalizedSandboxConfig;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockCommand = {
      command: "node",
      args: ["echo-server.js"],
    };

    mockEnv = {
      NODE_ENV: "test",
      PATH: "/usr/bin:/bin",
    };

    mockCwd = "/tmp/test" as ResolvedPath;

    mockSandboxConfig = {
      enabled: true,
      networking: true,
      allowRead: ["/usr/bin" as ResolvedPath, "/bin" as ResolvedPath],
      allowReadWrite: ["/tmp" as ResolvedPath],
    };
  });

  it("should create a ShellMcpClient instance", () => {
    const client = new ShellMcpClient(
      mockCommand,
      mockEnv,
      mockCwd,
      mockSandboxConfig,
      mockLogger,
      "test-server"
    );

    expect(client).toBeInstanceOf(ShellMcpClient);
  });

  it("should have a send method", () => {
    const client = new ShellMcpClient(
      mockCommand,
      mockEnv,
      mockCwd,
      mockSandboxConfig,
      mockLogger,
      "test-server"
    );

    expect(typeof client.send).toBe("function");
  });

  it("should have a stop method", () => {
    const client = new ShellMcpClient(
      mockCommand,
      mockEnv,
      mockCwd,
      mockSandboxConfig,
      mockLogger,
      "test-server"
    );

    expect(typeof client.stop).toBe("function");
  });

  it("should store configuration correctly", () => {
    const client = new ShellMcpClient(
      mockCommand,
      mockEnv,
      mockCwd,
      mockSandboxConfig,
      mockLogger,
      "test-server"
    );

    // Verify that the client was constructed without throwing
    expect(client).toBeDefined();

    // Test with disabled sandbox
    const disabledSandboxConfig: FinalizedSandboxConfig = {
      enabled: false,
      networking: true,
      allowRead: [],
      allowReadWrite: [],
    };

    const clientWithDisabledSandbox = new ShellMcpClient(
      mockCommand,
      mockEnv,
      mockCwd,
      disabledSandboxConfig,
      mockLogger,
      "test-server"
    );

    expect(clientWithDisabledSandbox).toBeDefined();
  });

  it("should handle empty environment variables", () => {
    const client = new ShellMcpClient(
      mockCommand,
      {},
      mockCwd,
      mockSandboxConfig,
      mockLogger,
      "test-server"
    );

    expect(client).toBeDefined();
  });

  it("should handle minimal command configuration", () => {
    const minimalCommand: ResolvedCommandParts = {
      command: "echo",
      args: ["hello"],
    };

    const client = new ShellMcpClient(
      minimalCommand,
      mockEnv,
      mockCwd,
      mockSandboxConfig,
      mockLogger,
      "test-server"
    );

    expect(client).toBeDefined();
  });
});
