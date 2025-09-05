// pattern: Imperative Shell
import pino from "pino";
import { describe, expect, it } from "vitest";

import { JsonRpcErrorCodes, type JsonRpcRequest } from "../json-rpc/types.js";

import { createMcpEchoServer } from "./echo-server.js";
import { McpMethods, McpState } from "./types.js";

describe("McpEchoServer", () => {
  const logger = pino({ level: "silent" });

  describe("initialization", () => {
    it("should start in WaitingForInitialize state", () => {
      const server = createMcpEchoServer(logger);
      expect(server.getState()).toBe(McpState.WaitingForInitialize);
    });

    it("should handle initialize request successfully", () => {
      const server = createMcpEchoServer(logger);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: McpMethods.INITIALIZE,
        id: 1,
        params: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {}, resources: {} },
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      };

      const response = server.processRequest(request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocol_version: "2024-11-05",
          capabilities: {
            tools: {},
            resources: {},
          },
          server_info: {
            name: "mcp-echo-server",
            version: "1.0.0",
          },
        },
      });
      expect(server.getState()).toBe(McpState.Initialized);
    });

    it("should reject double initialization", () => {
      const server = createMcpEchoServer(logger);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: McpMethods.INITIALIZE,
        id: 1,
      };

      // First initialization should succeed
      const firstResponse = server.processRequest(request);
      expect(firstResponse).toHaveProperty("result");

      // Second initialization should fail
      const secondRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: McpMethods.INITIALIZE,
        id: 2,
      };
      const secondResponse = server.processRequest(secondRequest);

      expect(secondResponse).toMatchObject({
        jsonrpc: "2.0",
        id: 2,
        error: {
          code: JsonRpcErrorCodes.INVALID_REQUEST,
          message: "Server already initialized",
        },
      });
    });
  });

  describe("protocol methods before initialization", () => {
    it("should reject tools/list before initialization", () => {
      const server = createMcpEchoServer(logger);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: McpMethods.TOOLS_LIST,
        id: 1,
      };

      const response = server.processRequest(request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: JsonRpcErrorCodes.INVALID_REQUEST,
          message: "Server not initialized",
        },
      });
    });

    it("should reject resources/list before initialization", () => {
      const server = createMcpEchoServer(logger);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: McpMethods.RESOURCES_LIST,
        id: 1,
      };

      const response = server.processRequest(request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: JsonRpcErrorCodes.INVALID_REQUEST,
          message: "Server not initialized",
        },
      });
    });
  });

  describe("protocol methods after initialization", () => {
    it("should handle tools/list after initialization", () => {
      const server = createMcpEchoServer(logger);

      // Initialize first
      const initRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: McpMethods.INITIALIZE,
        id: 1,
      };
      server.processRequest(initRequest);

      // Test tools/list
      const toolsRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: McpMethods.TOOLS_LIST,
        id: 2,
      };
      const response = server.processRequest(toolsRequest);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [],
        },
      });
    });

    it("should handle resources/list after initialization", () => {
      const server = createMcpEchoServer(logger);

      // Initialize first
      const initRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: McpMethods.INITIALIZE,
        id: 1,
      };
      server.processRequest(initRequest);

      // Test resources/list
      const resourcesRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: McpMethods.RESOURCES_LIST,
        id: 3,
      };
      const response = server.processRequest(resourcesRequest);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 3,
        result: {
          resources: [],
        },
      });
    });
  });

  describe("echo functionality", () => {
    it("should echo unknown method names", () => {
      const server = createMcpEchoServer(logger);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "custom/test/method",
        id: 5,
        params: { test: "data" },
      };

      const response = server.processRequest(request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 5,
        result: {
          method: "custom/test/method",
        },
      });
    });

    it("should preserve request ID in echo responses", () => {
      const server = createMcpEchoServer(logger);

      // Test numeric ID
      const numericRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test_numeric",
        id: 42,
      };
      const numericResponse = server.processRequest(numericRequest);
      expect(numericResponse.id).toBe(42);

      // Test string ID
      const stringRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test_string",
        id: "test-string-id",
      };
      const stringResponse = server.processRequest(stringRequest);
      expect(stringResponse.id).toBe("test-string-id");

      // Test null ID
      const nullRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test_null",
        id: null,
      };
      const nullResponse = server.processRequest(nullRequest);
      expect(nullResponse.id).toBe(null);

      // Test missing ID
      const missingRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test_missing",
      };
      const missingResponse = server.processRequest(missingRequest);
      expect(missingResponse.id).toBe(null);
    });
  });
});
