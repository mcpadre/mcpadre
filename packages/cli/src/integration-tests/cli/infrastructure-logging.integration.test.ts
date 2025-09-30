// pattern: Imperative Shell

import { existsSync, readdirSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import {
  waitForPtyPattern,
  withInteractiveProcess,
} from "../helpers/interactive-process.js";
import {
  sendJsonRpc,
  terminateProcess,
  waitForPattern,
  withProcess,
} from "../helpers/spawn-cli-v2.js";

import type { CommandStringTemplate } from "../../config/types/v1/server/index.js";
import type { TempProject } from "../../test-utils/project/temp-project.js";

describe("Infrastructure Logging Integration", () => {
  let tempProject: TempProject;

  beforeEach(async () => {
    // Create temporary project with shell server
    const config = {
      version: 1,
      mcpServers: {
        "test-infra-server": {
          shell: {
            command:
              `node ${join(process.cwd(), "dist", "test-utils", "mcp", "echo-server.js")}` as CommandStringTemplate,
          },
        },
      },
    } as const;

    tempProject = await createTempProject({
      config,
      format: "yaml",
      prefix: "infra-logging-test-",
    });
  });

  afterEach(async () => {
    await tempProject.cleanup();
  });

  describe("TTY vs non-TTY behavior", () => {
    it(
      "should NOT create infrastructure log files when running in TTY mode",
      withInteractiveProcess(async spawn => {
        // Start the CLI process with a real PTY (simulates interactive terminal)
        const pty = spawn(["run", "test-infra-server"], {
          cwd: tempProject.path,
        });

        // Wait for connection message
        const output = await waitForPtyPattern(
          pty,
          "Connected to shell server test-infra-server",
          5000
        );

        // Verify we see the startup message in TTY output
        expect(output).toContain("Starting");
        expect(output).toContain("test-infra-server");

        // Send Ctrl+C to terminate gracefully
        pty.write("\x03");

        // Wait a bit for process to exit
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check that NO infrastructure logs directory was created
        // In TTY mode, logs should only go to stderr (visible in terminal)
        const infraLogsDir = join(tempProject.path, ".mcpadre", "logs");
        expect(existsSync(infraLogsDir)).toBe(false);
      })
    );

    it(
      "should create infrastructure log files when running in non-TTY mode",
      withProcess(async spawn => {
        // Start the CLI process simulating non-TTY (like when run by a host)
        // The spawn helper always uses pipes, which simulates non-TTY
        const proc = spawn(["run", "test-infra-server"], {
          cwd: tempProject.path,
          buffer: false,
        });

        // Wait for connection message
        await waitForPattern(
          proc,
          "Connected to shell server test-infra-server",
          5000
        );

        // Send a request to ensure the server is running
        const initResponse = await sendJsonRpc(proc, {
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        });

        expect(initResponse.id).toBe(1);

        // Terminate the process
        await terminateProcess(proc);

        // Check that infrastructure logs directory WAS created
        const infraLogsDir = join(tempProject.path, ".mcpadre", "logs");
        expect(existsSync(infraLogsDir)).toBe(true);

        // Verify log file was created with correct naming pattern
        const logFiles = readdirSync(infraLogsDir);
        expect(logFiles.length).toBeGreaterThan(0);

        const logFile = logFiles[0]!;
        // Verify filename format: test-infra-server_YYYY-MM-DDTHH:mm:ss.sssZ.log
        expect(logFile).toMatch(
          /^test-infra-server_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\.log$/
        );

        // Read and verify log content
        const logFilePath = join(infraLogsDir, logFile);
        const logContent = await readFile(logFilePath, "utf8");
        expect(logContent).toContain("Starting");
        expect(logContent).toContain("test-infra-server");
      })
    );
  });

  describe("log separation", () => {
    it(
      "should keep infrastructure logs separate from MCP traffic logs",
      withProcess(async spawn => {
        // Create config with MCP traffic logging enabled
        const configWithLogging = {
          version: 1,
          mcpServers: {
            "test-both-logs": {
              shell: {
                command:
                  `node ${join(process.cwd(), "dist", "test-utils", "mcp", "echo-server.js")}` as CommandStringTemplate,
              },
              logMcpTraffic: true, // Enable MCP traffic logging
            },
          },
        } as const;

        const projectWithLogging = await createTempProject({
          config: configWithLogging,
          format: "yaml",
          prefix: "both-logs-test-",
        });

        try {
          // Start the CLI process in non-TTY mode
          // The spawn helper always uses pipes, which simulates non-TTY
          const proc = spawn(["run", "test-both-logs"], {
            cwd: projectWithLogging.path,
            buffer: false,
          });

          // Wait for connection
          await waitForPattern(
            proc,
            "Connected to shell server test-both-logs",
            5000
          );

          // Send some requests to generate MCP traffic
          await sendJsonRpc(proc, {
            jsonrpc: "2.0",
            method: "initialize",
            id: 1,
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "test-client", version: "1.0.0" },
            },
          });

          await sendJsonRpc(proc, {
            jsonrpc: "2.0",
            method: "tools/list",
            id: 2,
          });

          // Terminate the process
          await terminateProcess(proc);

          // Verify infrastructure logs are in .mcpadre/logs/
          const infraLogsDir = join(
            projectWithLogging.path,
            ".mcpadre",
            "logs"
          );
          expect(existsSync(infraLogsDir)).toBe(true);

          const infraLogFiles = readdirSync(infraLogsDir);
          expect(infraLogFiles.length).toBe(1);
          expect(infraLogFiles[0]).toMatch(/^test-both-logs_.*\.log$/);

          // Verify MCP traffic recordings are in .mcpadre/traffic/test-both-logs/
          const mcpRecordingDir = join(
            projectWithLogging.path,
            ".mcpadre",
            "traffic",
            "test-both-logs"
          );
          expect(existsSync(mcpRecordingDir)).toBe(true);

          const mcpRecordingFiles = readdirSync(mcpRecordingDir);
          expect(mcpRecordingFiles.length).toBe(1);
          expect(mcpRecordingFiles[0]).toMatch(/^test-both-logs__.*\.jsonl$/);

          // Verify infrastructure log contains startup messages
          const infraLogPath = join(infraLogsDir, infraLogFiles[0]!);
          const infraLogContent = await readFile(infraLogPath, "utf8");
          expect(infraLogContent).toContain("Starting");

          // Verify MCP recording contains JSON-RPC messages
          const mcpRecordingPath = join(mcpRecordingDir, mcpRecordingFiles[0]!);
          const mcpRecordingContent = await readFile(mcpRecordingPath, "utf8");
          const mcpLogLines = mcpRecordingContent.trim().split("\n");

          // Should have request/response pairs
          expect(mcpLogLines.length).toBeGreaterThanOrEqual(2);

          // Parse and verify JSONL format
          for (const line of mcpLogLines) {
            const entry = JSON.parse(line);
            expect(entry).toHaveProperty("timestamp");
            expect("req" in entry || "res" in entry).toBe(true);
          }
        } finally {
          await projectWithLogging.cleanup();
        }
      })
    );
  });
});
