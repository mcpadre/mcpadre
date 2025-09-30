// pattern: Functional Core

import { existsSync } from "fs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { McpTrafficRecorder } from "./mcp-traffic-recorder";

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../../test-utils/json-rpc/types.js";

describe("McpTrafficLogger", () => {
  let tempDir: string;
  let logFilePath: string;

  beforeEach(async () => {
    // Create a unique temporary directory and log file for each test
    const baseTemp = tmpdir();
    const timestamp = Date.now();
    tempDir = join(baseTemp, `mcpadre-traffic-logger-test-${timestamp}`);
    await mkdir(tempDir, { recursive: true });
    logFilePath = join(tempDir, "test-server__2024-01-01T00:00:00.000Z.jsonl");
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("processRequest", () => {
    it("should log request and continue with original request", async () => {
      const logger = new McpTrafficRecorder(logFilePath);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test/method",
        id: 1,
        params: { test: "data" },
      };

      const result = await logger.processRequest(request);

      // Should return continuation with original request
      expect(result).toEqual({
        type: "request",
        request,
      });

      // Should have created log file with request entry
      expect(existsSync(logFilePath)).toBe(true);
      const logContent = await readFile(logFilePath, "utf8");
      const logLines = logContent.trim().split("\n");
      expect(logLines).toHaveLength(1);

      const logEntry = JSON.parse(logLines[0]!);
      expect(logEntry).toHaveProperty("timestamp");
      expect(logEntry).toHaveProperty("req");
      expect(logEntry.req).toEqual(request);
      expect(typeof logEntry.timestamp).toBe("string");
      expect(logEntry.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });

    it("should handle requests without id", async () => {
      const logger = new McpTrafficRecorder(logFilePath);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test/notification",
        params: { notification: true },
      };

      const result = await logger.processRequest(request);

      expect(result.type).toBe("request");
      if (result.type === "request") {
        expect(result.request).toEqual(request);
      }

      const logContent = await readFile(logFilePath, "utf8");
      const logEntry = JSON.parse(logContent.trim());
      expect(logEntry.req).toEqual(request);
    });

    it("should handle requests without params", async () => {
      const logger = new McpTrafficRecorder(logFilePath);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test/simple",
        id: 1,
      };

      const result = await logger.processRequest(request);

      expect(result.type).toBe("request");
      if (result.type === "request") {
        expect(result.request).toEqual(request);
      }

      const logContent = await readFile(logFilePath, "utf8");
      const logEntry = JSON.parse(logContent.trim());
      expect(logEntry.req).toEqual(request);
    });

    it("should continue processing even if logging fails", async () => {
      // Use an invalid file path to trigger logging error
      const invalidLogPath = "/root/invalid/path/test.jsonl";
      const logger = new McpTrafficRecorder(invalidLogPath);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test/method",
        id: 1,
      };

      // Should not throw error even if logging fails
      const result = await logger.processRequest(request);

      expect(result).toEqual({
        type: "request",
        request,
      });

      // Log file should not exist
      expect(existsSync(invalidLogPath)).toBe(false);
    });
  });

  describe("processResponse", () => {
    it("should log response and continue with original response", async () => {
      const logger = new McpTrafficRecorder(logFilePath);
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: { success: true, data: "test" },
      };

      const result = await logger.processResponse(response);

      // Should return continuation with original response
      expect(result).toEqual({
        type: "response",
        response,
      });

      // Should have created log file with response entry
      expect(existsSync(logFilePath)).toBe(true);
      const logContent = await readFile(logFilePath, "utf8");
      const logLines = logContent.trim().split("\n");
      expect(logLines).toHaveLength(1);

      const logEntry = JSON.parse(logLines[0]!);
      expect(logEntry).toHaveProperty("timestamp");
      expect(logEntry).toHaveProperty("res");
      expect(logEntry.res).toEqual(response);
      expect(typeof logEntry.timestamp).toBe("string");
      expect(logEntry.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });

    it("should handle error responses", async () => {
      const logger = new McpTrafficRecorder(logFilePath);
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32600,
          message: "Invalid request",
          data: { details: "test error" },
        },
      };

      const result = await logger.processResponse(response);

      expect(result.type).toBe("response");
      if (result.type === "response") {
        expect(result.response).toEqual(response);
      }

      const logContent = await readFile(logFilePath, "utf8");
      const logEntry = JSON.parse(logContent.trim());
      expect(logEntry.res).toEqual(response);
    });

    it("should handle responses with null id", async () => {
      const logger = new McpTrafficRecorder(logFilePath);
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: null,
        result: "notification response",
      };

      const result = await logger.processResponse(response);

      expect(result.type).toBe("response");
      if (result.type === "response") {
        expect(result.response).toEqual(response);
      }

      const logContent = await readFile(logFilePath, "utf8");
      const logEntry = JSON.parse(logContent.trim());
      expect(logEntry.res).toEqual(response);
    });

    it("should continue processing even if logging fails", async () => {
      const invalidLogPath = "/root/invalid/path/test.jsonl";
      const logger = new McpTrafficRecorder(invalidLogPath);
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: { test: "data" },
      };

      // Should not throw error even if logging fails
      const result = await logger.processResponse(response);

      expect(result).toEqual({
        type: "response",
        response,
      });

      // Log file should not exist
      expect(existsSync(invalidLogPath)).toBe(false);
    });
  });

  describe("request and response logging together", () => {
    it("should log both requests and responses to the same file", async () => {
      const logger = new McpTrafficRecorder(logFilePath);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test/method",
        id: 1,
        params: { input: "test" },
      };
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: { output: "test" },
      };

      await logger.processRequest(request);
      await logger.processResponse(response);

      const logContent = await readFile(logFilePath, "utf8");
      const logLines = logContent.trim().split("\n");
      expect(logLines).toHaveLength(2);

      const requestEntry = JSON.parse(logLines[0]!);
      const responseEntry = JSON.parse(logLines[1]!);

      expect(requestEntry).toHaveProperty("req");
      expect(requestEntry).toHaveProperty("timestamp");
      expect(requestEntry.req).toEqual(request);

      expect(responseEntry).toHaveProperty("res");
      expect(responseEntry).toHaveProperty("timestamp");
      expect(responseEntry.res).toEqual(response);
    });

    it("should append to existing log file", async () => {
      // Pre-populate log file
      const existingLogEntry = {
        timestamp: "2024-01-01T00:00:00.000Z",
        req: { jsonrpc: "2.0", method: "existing/method", id: 0 },
      };
      await writeFile(
        logFilePath,
        `${JSON.stringify(existingLogEntry)}\n`,
        "utf8"
      );

      const logger = new McpTrafficRecorder(logFilePath);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "new/method",
        id: 1,
      };

      await logger.processRequest(request);

      const logContent = await readFile(logFilePath, "utf8");
      const logLines = logContent.trim().split("\n");
      expect(logLines).toHaveLength(2);

      // First line should be the existing entry
      const existingEntry = JSON.parse(logLines[0]!);
      expect(existingEntry).toEqual(existingLogEntry);

      // Second line should be the new entry
      const newEntry = JSON.parse(logLines[1]!);
      expect(newEntry).toHaveProperty("req");
      expect(newEntry.req).toEqual(request);
    });
  });

  describe("interceptor interface", () => {
    it("should have correct name", () => {
      const recorder = new McpTrafficRecorder(logFilePath);
      expect(recorder.name).toBe("MCP Traffic Recorder");
    });
  });
});
