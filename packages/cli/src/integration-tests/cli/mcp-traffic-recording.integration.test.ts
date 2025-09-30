// pattern: Imperative Shell

import { existsSync, readdirSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import {
  sendJsonRpc,
  terminateProcess,
  waitForPattern,
  withProcess,
} from "../helpers/spawn-cli-v2.js";

import type { CommandStringTemplate } from "../../config/types/v1/server/index.js";
import type { TempProject } from "../../test-utils/project/temp-project.js";

describe("MCP Traffic Logging Integration", () => {
  let tempProject: TempProject;

  beforeEach(async () => {
    // Create temporary project with shell server configured for logging
    const config = {
      version: 1,
      mcpServers: {
        // Server with logging enabled at server level
        "test-server-logging-enabled": {
          shell: {
            command:
              `node ${join(process.cwd(), "dist", "test-utils", "mcp", "echo-server.js")}` as CommandStringTemplate,
          },
          logMcpTraffic: true,
        },
        // Server with logging disabled at server level, workspace enabled
        "test-server-logging-disabled": {
          shell: {
            command:
              `node ${join(process.cwd(), "dist", "test-utils", "mcp", "echo-server.js")}` as CommandStringTemplate,
          },
          logMcpTraffic: false,
        },
      },
      options: {
        logMcpTraffic: true, // Workspace-level logging enabled
      },
    } as const;

    tempProject = await createTempProject({
      config,
      format: "yaml",
      prefix: "mcp-traffic-logging-test-",
    });
  });

  afterEach(async () => {
    await tempProject.cleanup();
  });

  describe("server directory and log file creation", () => {
    it(
      "should create server directory and log file when logging is enabled",
      withProcess(async spawn => {
        // Start the CLI process
        const proc = spawn(["run", "test-server-logging-enabled"], {
          cwd: tempProject.path,
          buffer: false, // Enable streaming for long-running process
        });

        // Wait for connection message
        await waitForPattern(
          proc,
          "Connected to shell server test-server-logging-enabled",
          5000
        );

        // Send initialize request to trigger MCP traffic
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

        // Verify we got a response (could be result or error)
        expect(initResponse.id).toBe(1);
        expect("result" in initResponse || "error" in initResponse).toBe(true);

        // Terminate the process
        await terminateProcess(proc);

        // Verify directory structure exists
        const recordingDir = join(
          tempProject.path,
          ".mcpadre",
          "traffic",
          "test-server-logging-enabled"
        );

        expect(existsSync(recordingDir)).toBe(true);

        // Verify recording file was created with correct naming pattern
        const recordingFiles = readdirSync(recordingDir);
        expect(recordingFiles.length).toBeGreaterThan(0);

        const recordingFile = recordingFiles[0];
        // Verify filename format: server-name__YYYY-MM-DDTHH:mm:ss.sssZ.jsonl
        expect(recordingFile).toMatch(
          /^test-server-logging-enabled__\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\.jsonl$/
        );
      })
    );
  });

  describe("logging disabled behavior", () => {
    it(
      "should NOT create MCP traffic log files when logging is disabled",
      withProcess(async spawn => {
        // Start the CLI process with logging disabled
        const proc = spawn(["run", "test-server-logging-disabled"], {
          cwd: tempProject.path,
          buffer: false,
        });

        // Wait for connection message
        await waitForPattern(
          proc,
          "Connected to shell server test-server-logging-disabled",
          5000
        );

        // Send initialize request to trigger MCP traffic
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
        expect("result" in initResponse || "error" in initResponse).toBe(true);

        // Send a tools/list request for additional traffic
        const toolsResponse = await sendJsonRpc(proc, {
          jsonrpc: "2.0",
          method: "tools/list",
          id: 2,
        });

        expect(toolsResponse.id).toBe(2);

        // Terminate the process
        await terminateProcess(proc);

        // Verify that NO MCP traffic log files were created
        const logsDir = join(
          tempProject.path,
          ".mcpadre",
          "servers",
          "test-server-logging-disabled",
          "logs"
        );

        // The logs directory itself should NOT exist when logging is disabled
        expect(existsSync(logsDir)).toBe(false);
      })
    );
  });

  describe("log content format verification", () => {
    it(
      "should log in correct JSONL format when enabled",
      withProcess(async spawn => {
        // Start the CLI process
        const proc = spawn(["run", "test-server-logging-enabled"], {
          cwd: tempProject.path,
          buffer: false,
        });

        // Wait for connection message
        await waitForPattern(
          proc,
          "Connected to shell server test-server-logging-enabled",
          5000
        );

        // Send initialize request to trigger MCP traffic
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
        expect("result" in initResponse || "error" in initResponse).toBe(true);

        // Send a tools/list request for additional traffic
        const toolsResponse = await sendJsonRpc(proc, {
          jsonrpc: "2.0",
          method: "tools/list",
          id: 2,
        });

        expect(toolsResponse.id).toBe(2);
        expect("result" in toolsResponse || "error" in toolsResponse).toBe(
          true
        );

        // Terminate the process
        await terminateProcess(proc);

        // Find and read the recording file
        const recordingDir = join(
          tempProject.path,
          ".mcpadre",
          "traffic",
          "test-server-logging-enabled"
        );
        expect(existsSync(recordingDir)).toBe(true);

        const recordingFiles = readdirSync(recordingDir);
        expect(recordingFiles.length).toBeGreaterThan(0);

        const recordingFilePath = join(recordingDir, recordingFiles[0]!);
        const recordingContent = await readFile(recordingFilePath, "utf8");

        expect(recordingContent.trim()).not.toBe("");
        const recordingLines = recordingContent.trim().split("\n");

        // Should have at least 2 recording entries (1 request + 1 response minimum)
        expect(recordingLines.length).toBeGreaterThanOrEqual(2);

        // Each line should be valid JSON with either req or res property
        for (const line of recordingLines) {
          const logEntry = JSON.parse(line);
          expect(logEntry).toHaveProperty("timestamp");
          expect(logEntry.timestamp).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          );

          // Should have either req or res property
          const hasReq = "req" in logEntry;
          const hasRes = "res" in logEntry;
          expect(hasReq || hasRes).toBe(true);
          expect(hasReq && hasRes).toBe(false); // Should not have both

          // Verify NO infrastructure log messages leaked into MCP traffic logs
          // Infrastructure logs would have different structure (pino format)
          expect(logEntry).not.toHaveProperty("level");
          expect(logEntry).not.toHaveProperty("msg");
          expect(logEntry).not.toHaveProperty("name");
        }
      })
    );
  });
});
