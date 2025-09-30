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

describe("McpTrafficRecorder", () => {
  let tempDir: string;
  let recordingFilePath: string;

  beforeEach(async () => {
    // Create a unique temporary directory and recording file for each test
    const baseTemp = tmpdir();
    const timestamp = Date.now();
    tempDir = join(baseTemp, `mcpadre-traffic-recorder-test-${timestamp}`);
    await mkdir(tempDir, { recursive: true });
    recordingFilePath = join(
      tempDir,
      "test-server__2024-01-01T00:00:00.000Z.jsonl"
    );
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("processRequest", () => {
    it("should record request and continue with original request", async () => {
      const recorder = new McpTrafficRecorder(recordingFilePath);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test/method",
        id: 1,
        params: { test: "data" },
      };

      const result = await recorder.processRequest(request);

      // Should return continuation with original request
      expect(result).toEqual({
        type: "request",
        request,
      });

      // Should have created log file with request entry
      expect(existsSync(recordingFilePath)).toBe(true);
      const recordingContent = await readFile(recordingFilePath, "utf8");
      const recordingLines = recordingContent.trim().split("\n");
      expect(recordingLines).toHaveLength(1);

      const logEntry = JSON.parse(recordingLines[0]!);
      expect(logEntry).toHaveProperty("timestamp");
      expect(logEntry).toHaveProperty("req");
      expect(logEntry.req).toEqual(request);
      expect(typeof logEntry.timestamp).toBe("string");
      expect(logEntry.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });

    it("should handle requests without id", async () => {
      const recorder = new McpTrafficRecorder(recordingFilePath);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test/notification",
        params: { notification: true },
      };

      const result = await recorder.processRequest(request);

      expect(result.type).toBe("request");
      if (result.type === "request") {
        expect(result.request).toEqual(request);
      }

      const recordingContent = await readFile(recordingFilePath, "utf8");
      const logEntry = JSON.parse(recordingContent.trim());
      expect(logEntry.req).toEqual(request);
    });

    it("should handle requests without params", async () => {
      const recorder = new McpTrafficRecorder(recordingFilePath);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test/simple",
        id: 1,
      };

      const result = await recorder.processRequest(request);

      expect(result.type).toBe("request");
      if (result.type === "request") {
        expect(result.request).toEqual(request);
      }

      const recordingContent = await readFile(recordingFilePath, "utf8");
      const logEntry = JSON.parse(recordingContent.trim());
      expect(logEntry.req).toEqual(request);
    });

    it("should continue processing even if recording fails", async () => {
      // Use an invalid file path to trigger logging error
      const invalidLogPath = "/root/invalid/path/test.jsonl";
      const recorder = new McpTrafficRecorder(invalidLogPath);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test/method",
        id: 1,
      };

      // Should not throw error even if recording fails
      const result = await recorder.processRequest(request);

      expect(result).toEqual({
        type: "request",
        request,
      });

      // Log file should not exist
      expect(existsSync(invalidLogPath)).toBe(false);
    });
  });

  describe("processResponse", () => {
    it("should recordresponse and continue with original response", async () => {
      const recorder = new McpTrafficRecorder(recordingFilePath);
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: { success: true, data: "test" },
      };

      const result = await recorder.processResponse(response);

      // Should return continuation with original response
      expect(result).toEqual({
        type: "response",
        response,
      });

      // Should have created log file with response entry
      expect(existsSync(recordingFilePath)).toBe(true);
      const recordingContent = await readFile(recordingFilePath, "utf8");
      const recordingLines = recordingContent.trim().split("\n");
      expect(recordingLines).toHaveLength(1);

      const logEntry = JSON.parse(recordingLines[0]!);
      expect(logEntry).toHaveProperty("timestamp");
      expect(logEntry).toHaveProperty("res");
      expect(logEntry.res).toEqual(response);
      expect(typeof logEntry.timestamp).toBe("string");
      expect(logEntry.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });

    it("should handle error responses", async () => {
      const recorder = new McpTrafficRecorder(recordingFilePath);
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32600,
          message: "Invalid request",
          data: { details: "test error" },
        },
      };

      const result = await recorder.processResponse(response);

      expect(result.type).toBe("response");
      if (result.type === "response") {
        expect(result.response).toEqual(response);
      }

      const recordingContent = await readFile(recordingFilePath, "utf8");
      const logEntry = JSON.parse(recordingContent.trim());
      expect(logEntry.res).toEqual(response);
    });

    it("should handle responses with null id", async () => {
      const recorder = new McpTrafficRecorder(recordingFilePath);
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: null,
        result: "notification response",
      };

      const result = await recorder.processResponse(response);

      expect(result.type).toBe("response");
      if (result.type === "response") {
        expect(result.response).toEqual(response);
      }

      const recordingContent = await readFile(recordingFilePath, "utf8");
      const logEntry = JSON.parse(recordingContent.trim());
      expect(logEntry.res).toEqual(response);
    });

    it("should continue processing even if recording fails", async () => {
      const invalidLogPath = "/root/invalid/path/test.jsonl";
      const recorder = new McpTrafficRecorder(invalidLogPath);
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: { test: "data" },
      };

      // Should not throw error even if recording fails
      const result = await recorder.processResponse(response);

      expect(result).toEqual({
        type: "response",
        response,
      });

      // Log file should not exist
      expect(existsSync(invalidLogPath)).toBe(false);
    });
  });

  describe("request and response recording together", () => {
    it("should recordboth requests and responses to the same file", async () => {
      const recorder = new McpTrafficRecorder(recordingFilePath);
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

      await recorder.processRequest(request);
      await recorder.processResponse(response);

      const recordingContent = await readFile(recordingFilePath, "utf8");
      const recordingLines = recordingContent.trim().split("\n");
      expect(recordingLines).toHaveLength(2);

      const requestEntry = JSON.parse(recordingLines[0]!);
      const responseEntry = JSON.parse(recordingLines[1]!);

      expect(requestEntry).toHaveProperty("req");
      expect(requestEntry).toHaveProperty("timestamp");
      expect(requestEntry.req).toEqual(request);

      expect(responseEntry).toHaveProperty("res");
      expect(responseEntry).toHaveProperty("timestamp");
      expect(responseEntry.res).toEqual(response);
    });

    it("should append to existing recording file", async () => {
      // Pre-populate log file
      const existingLogEntry = {
        timestamp: "2024-01-01T00:00:00.000Z",
        req: { jsonrpc: "2.0", method: "existing/method", id: 0 },
      };
      await writeFile(
        recordingFilePath,
        `${JSON.stringify(existingLogEntry)}\n`,
        "utf8"
      );

      const recorder = new McpTrafficRecorder(recordingFilePath);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "new/method",
        id: 1,
      };

      await recorder.processRequest(request);

      const recordingContent = await readFile(recordingFilePath, "utf8");
      const recordingLines = recordingContent.trim().split("\n");
      expect(recordingLines).toHaveLength(2);

      // First line should be the existing entry
      const existingEntry = JSON.parse(recordingLines[0]!);
      expect(existingEntry).toEqual(existingLogEntry);

      // Second line should be the new entry
      const newEntry = JSON.parse(recordingLines[1]!);
      expect(newEntry).toHaveProperty("req");
      expect(newEntry.req).toEqual(request);
    });
  });

  describe("interceptor interface", () => {
    it("should have correct name", () => {
      const recorder = new McpTrafficRecorder(recordingFilePath);
      expect(recorder.name).toBe("MCP Traffic Recorder");
    });
  });
});
