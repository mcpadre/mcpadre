// pattern: Functional Core

import pino from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyTemplate } from "../../../utils/string-templating/index.js";
import { ShellMcpClient } from "../shell/client.js";

import { PythonMcpClient } from "./client.js";

import type { PythonOptionsV1 } from "../../../config/types/v1/server/index.js";
import type { FinalizedSandboxConfig } from "../../../utils/sandbox/index.js";
import type { DirectoryResolver } from "../../directory-resolver/index.js";
import type { ResolvedPath } from "../../types/index.js";

// Mock the ShellMcpClient
vi.mock("../shell/client.js", () => ({
  ShellMcpClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ id: 1, result: "test response" }),
    stop: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock the template rendering
vi.mock("../../../utils/string-templating/index.js", () => ({
  applyTemplate: vi.fn().mockImplementation((template: string) => template),
}));

describe("PythonMcpClient", () => {
  let mockPythonConfig: PythonOptionsV1;
  let mockEnv: Record<string, string>;
  let mockDirectoryResolver: DirectoryResolver;
  let mockServerName: string;
  let mockSandboxConfig: FinalizedSandboxConfig;
  let mockLogger: ReturnType<typeof pino>;

  beforeEach(() => {
    mockPythonConfig = {
      package: "mcp-pypi",
      version: "2.6.7",
      pythonVersion: "3.12",
      command: "mcp-pypi" as any,
    };
    mockEnv = { NODE_ENV: "test" };
    mockDirectoryResolver = {
      workspace: "/test/project" as ResolvedPath,
      home: "/home/test" as ResolvedPath,
      cache: "/test/cache" as ResolvedPath,
      config: "/test/config" as ResolvedPath,
      data: "/test/data" as ResolvedPath,
      temp: "/test/temp" as ResolvedPath,
      log: "/test/log" as ResolvedPath,
      user: "/home/test/.mcpadre" as ResolvedPath,
    };
    mockServerName = "test-server";
    mockSandboxConfig = {
      enabled: false,
      networking: true,
      allowRead: [],
      allowReadWrite: [],
    };
    mockLogger = pino({ level: "silent" }) as any;

    // Clear all mocks
    vi.clearAllMocks();
  });

  it("constructs uv run command correctly with explicit command", () => {
    const client = new PythonMcpClient(
      mockPythonConfig,
      mockEnv,
      mockDirectoryResolver,
      mockServerName,
      mockSandboxConfig,
      mockLogger as any
    );

    expect(client).toBeDefined();

    // Verify ShellMcpClient was created with correct parameters
    const mockedShellMcpClient = vi.mocked(ShellMcpClient);
    expect(mockedShellMcpClient).toHaveBeenCalledWith(
      {
        command: "uv",
        args: ["run", "--no-env-file", "--", "mcp-pypi"],
      },
      mockEnv,
      "/test/project/.mcpadre/servers/test-server",
      mockSandboxConfig,
      expect.any(Object), // logger child
      "test-server"
    );
  });

  it("constructs uv run command with package name when command not specified", () => {
    const configWithoutCommand = {
      ...mockPythonConfig,
      command: undefined as any,
    };

    new PythonMcpClient(
      configWithoutCommand,
      mockEnv,
      mockDirectoryResolver,
      mockServerName,
      mockSandboxConfig,
      mockLogger as any
    );

    const mockedShellMcpClient = vi.mocked(ShellMcpClient);
    expect(mockedShellMcpClient).toHaveBeenCalledWith(
      {
        command: "uv",
        args: ["run", "--no-env-file", "--", "mcp-pypi"],
      },
      mockEnv,
      "/test/project/.mcpadre/servers/test-server",
      mockSandboxConfig,
      expect.any(Object),
      "test-server"
    );
  });

  it("handles commands with spaces correctly", () => {
    const configWithSpacedCommand = {
      ...mockPythonConfig,
      command: "mcp-pypi --config /path/to/config" as any,
    };

    new PythonMcpClient(
      configWithSpacedCommand,
      mockEnv,
      mockDirectoryResolver,
      mockServerName,
      mockSandboxConfig,
      mockLogger as any
    );

    const mockedShellMcpClient = vi.mocked(ShellMcpClient);
    expect(mockedShellMcpClient).toHaveBeenCalledWith(
      {
        command: "uv",
        args: [
          "run",
          "--no-env-file",
          "--",
          "mcp-pypi",
          "--config",
          "/path/to/config",
        ],
      },
      mockEnv,
      "/test/project/.mcpadre/servers/test-server",
      mockSandboxConfig,
      expect.any(Object),
      "test-server"
    );
  });

  it("delegates send method to ShellMcpClient", async () => {
    const client = new PythonMcpClient(
      mockPythonConfig,
      mockEnv,
      mockDirectoryResolver,
      mockServerName,
      mockSandboxConfig,
      mockLogger as any
    );

    const request = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "test",
      params: {},
    };
    const response = await client.send(request);

    const mockedShellMcpClient = vi.mocked(ShellMcpClient);
    const shellClientInstance = mockedShellMcpClient.mock.results[0]?.value;

    expect(shellClientInstance.send).toHaveBeenCalledWith(request);
    expect(response).toEqual({ id: 1, result: "test response" });
  });

  it("delegates stop method to ShellMcpClient", async () => {
    const client = new PythonMcpClient(
      mockPythonConfig,
      mockEnv,
      mockDirectoryResolver,
      mockServerName,
      mockSandboxConfig,
      mockLogger as any
    );

    await client.stop();

    const mockedShellMcpClient = vi.mocked(ShellMcpClient);
    const shellClientInstance = mockedShellMcpClient.mock.results[0]?.value;

    expect(shellClientInstance.stop).toHaveBeenCalled();
  });

  it("applies template rendering to command", () => {
    const configWithTemplate = {
      ...mockPythonConfig,
      command: "mcp-pypi --project-dir {{projectDir}}" as any,
    };

    new PythonMcpClient(
      configWithTemplate,
      mockEnv,
      mockDirectoryResolver,
      mockServerName,
      mockSandboxConfig,
      mockLogger as any
    );

    const mockedApplyTemplate = vi.mocked(applyTemplate);
    expect(mockedApplyTemplate).toHaveBeenCalledWith(
      "mcp-pypi --project-dir {{projectDir}}",
      {
        dirs: mockDirectoryResolver,
        parentEnv: process.env,
      }
    );
  });
});
