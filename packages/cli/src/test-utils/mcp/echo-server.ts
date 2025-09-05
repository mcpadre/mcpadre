// pattern: Mixed (unavoidable)
// MCP echo server implementation requires mixing I/O operations with protocol logic
// for optimal performance and deterministic behavior in testing scenarios

import readline from "readline";

import { createLogger } from "../../logger/config.js";
import {
  createErrorResponse,
  createSuccessResponse,
  JsonRpcErrorCodes,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "../json-rpc/types.js";

import {
  createEchoResult,
  createInitializeResult,
  createResourcesListResult,
  createToolsListResult,
  type McpInitializeParams,
  McpMethods,
  McpState,
} from "./types.js";

import type { Logger } from "pino";

/**
 * MCP echo server for testing JSON-RPC pipeline systems
 * Implements minimal MCP protocol compliance with echo functionality
 */
export class McpEchoServer {
  private state: McpState = McpState.WaitingForInitialize;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: "mcp-echo-server" });
  }

  /**
   * Process incoming JSON-RPC request and generate appropriate response
   * Handles MCP protocol methods and echoes all other method calls
   */
  processRequest(request: JsonRpcRequest): JsonRpcResponse {
    this.logger.debug(
      {
        method: request.method,
        id: request.id,
        hasParams: request.params !== undefined,
        state: this.state,
      },
      "Processing JSON-RPC request"
    );

    try {
      switch (request.method) {
        case McpMethods.INITIALIZE:
          return this.handleInitialize(request);
        case McpMethods.TOOLS_LIST:
          return this.handleToolsList(request);
        case McpMethods.RESOURCES_LIST:
          return this.handleResourcesList(request);
        default:
          return this.handleEcho(request);
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Error processing request"
      );

      return createErrorResponse(
        request.id ?? null,
        JsonRpcErrorCodes.INTERNAL_ERROR,
        "Internal server error"
      );
    }
  }

  /**
   * Handle MCP initialize request according to protocol specification
   * Validates client capabilities and transitions server to initialized state
   */
  private handleInitialize(request: JsonRpcRequest): JsonRpcResponse {
    // Validate we're in correct state for initialization
    if (this.state !== McpState.WaitingForInitialize) {
      this.logger.warn("Initialize called when server already initialized");
      return createErrorResponse(
        request.id ?? null,
        JsonRpcErrorCodes.INVALID_REQUEST,
        "Server already initialized"
      );
    }

    // Parse initialize parameters (basic validation)
    const params = request.params as McpInitializeParams | undefined;

    this.logger.debug(
      {
        protocolVersion: params?.protocolVersion,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        clientName: params?.clientInfo?.name,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        clientVersion: params?.clientInfo?.version,
      },
      "Processing initialize request"
    );

    // Transition to initialized state
    this.state = McpState.Initialized;

    // Return MCP server capabilities
    const result = createInitializeResult("mcp-echo-server", "1.0.0");

    this.logger.info("MCP server initialized successfully");

    return createSuccessResponse(request.id ?? null, result);
  }

  /**
   * Handle tools/list request - returns empty tools list for testing
   * MCP protocol requires tools/list endpoint even if no tools are provided
   */
  private handleToolsList(request: JsonRpcRequest): JsonRpcResponse {
    // Validate server is initialized
    if (this.state !== McpState.Initialized) {
      this.logger.warn("Tools list requested before initialization");
      return createErrorResponse(
        request.id ?? null,
        JsonRpcErrorCodes.INVALID_REQUEST,
        "Server not initialized"
      );
    }

    const result = createToolsListResult();

    this.logger.debug("Returning empty tools list");

    return createSuccessResponse(request.id ?? null, result);
  }

  /**
   * Handle resources/list request - returns empty resources list for testing
   * MCP protocol requires resources/list endpoint even if no resources are provided
   */
  private handleResourcesList(request: JsonRpcRequest): JsonRpcResponse {
    // Validate server is initialized
    if (this.state !== McpState.Initialized) {
      this.logger.warn("Resources list requested before initialization");
      return createErrorResponse(
        request.id ?? null,
        JsonRpcErrorCodes.INVALID_REQUEST,
        "Server not initialized"
      );
    }

    const result = createResourcesListResult();

    this.logger.debug("Returning empty resources list");

    return createSuccessResponse(request.id ?? null, result);
  }

  /**
   * Handle non-protocol method calls by echoing the method name
   * For testing purposes, echoes method name back to caller
   */
  private handleEcho(request: JsonRpcRequest): JsonRpcResponse {
    const result = createEchoResult(request.method);

    this.logger.debug({ method: request.method }, "Echoing method name");

    return createSuccessResponse(request.id ?? null, result);
  }

  /**
   * Get current server state
   */
  getState(): McpState {
    return this.state;
  }
}

/**
 * Create a new MCP echo server instance
 */
export function createMcpEchoServer(logger: Logger): McpEchoServer {
  return new McpEchoServer(logger);
}

/**
 * Main server function - only runs when import.meta.main is true
 * Handles stdio communication, signals, and graceful shutdown
 */
async function main(): Promise<void> {
  // Create logger for server
  const logger = createLogger("json", false);
  logger.level = "debug";
  const server = createMcpEchoServer(logger);

  logger.info("Starting MCP echo server");

  // Setup graceful shutdown
  let isShuttingDown = false;

  const shutdown = (signal: string): void => {
    if (isShuttingDown) {
      logger.warn("Force shutdown requested");
      process.exit(1);
    }

    isShuttingDown = true;
    logger.info({ signal }, "Received shutdown signal");
    process.exit(0);
  };

  // Handle signals (skip in test environments to avoid interfering with vitest)
  if (!process.env["NODE_ENV"]?.includes("test") && !process.env["VITEST"]) {
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }

  // Handle uncaught exceptions and unhandled rejections
  process.on("uncaughtException", error => {
    logger.fatal(
      { error: error.message, stack: error.stack },
      "Uncaught exception"
    );
    process.exit(1);
  });

  process.on("unhandledRejection", reason => {
    logger.fatal({ reason }, "Unhandled promise rejection");
    process.exit(1);
  });

  // Setup stdin/stdout communication
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  logger.debug("Server ready for JSON-RPC messages");

  // Process messages line by line
  rl.on("line", line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    logger.debug({ message: trimmed }, "Received JSON-RPC message");

    try {
      // Parse JSON-RPC request
      const request = JSON.parse(trimmed) as JsonRpcRequest;

      // Process through MCP server
      const response = server.processRequest(request);

      // Send response
      const responseJson = JSON.stringify(response);
      // eslint-disable-next-line no-console
      console.log(responseJson);

      logger.debug({ response: responseJson }, "Sent JSON-RPC response");
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to process message"
      );

      // Send parse error response
      const errorResponse = createErrorResponse(
        null,
        JsonRpcErrorCodes.PARSE_ERROR,
        `Parse error: ${error instanceof Error ? error.message : String(error)}`
      );

      // eslint-disable-next-line no-console
      console.log(JSON.stringify(errorResponse));
    }
  });

  rl.on("close", () => {
    logger.info("stdin closed, shutting down server");
    process.exit(0);
  });
}

// Run main function if this module is executed directly
if (import.meta.main) {
  main().catch(error => {
    // eslint-disable-next-line no-console
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
