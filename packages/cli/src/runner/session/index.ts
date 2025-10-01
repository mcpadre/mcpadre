// pattern: Mixed (unavoidable)
// Session management requires integration of I/O operations with pipeline processing

import { processPipeline } from "../pipeline/index.js";

import { JsonRpcStreamHandler } from "./stream-handler.js";

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../test-utils/json-rpc/types.js";
import type { Interceptor } from "../pipeline/types.js";
import type { SessionConfig } from "./types.js";

/**
 * Manages interactive JSON-RPC sessions over configurable streams
 * Integrates with the existing pipeline system for request processing
 */
export class InteractiveSessionManager {
  private streamHandler: JsonRpcStreamHandler;
  private interceptors: readonly Interceptor[];
  private sigintHandler: (() => void) | undefined;
  private sigtermHandler: (() => void) | undefined;

  constructor(
    private readonly config: SessionConfig,
    interceptors: readonly Interceptor[] = []
  ) {
    this.interceptors = interceptors;

    // Default to stdin/stdout if no streams provided
    const input = config.input ?? process.stdin;
    const output = config.output ?? process.stdout;

    // Debug stdin state
    this.config.logger?.debug(
      {
        usingStdin: input === process.stdin,
        isTTY: process.stdin.isTTY,
        stdinReadable: process.stdin.readable,
        stdinDestroyed: process.stdin.destroyed,
        stdinClosed: process.stdin.closed,
      },
      "Session input stream state"
    );

    this.streamHandler = new JsonRpcStreamHandler(input, output, config.logger);
    this.setupEventHandlers();
    this.setupSignalHandlers();
  }

  /**
   * Start the interactive session
   * Begins listening for JSON-RPC requests on input stream and sends responses to output stream
   */
  async start(): Promise<void> {
    this.config.logger?.info("Starting interactive session manager");

    try {
      await this.streamHandler.start();
    } catch (error) {
      this.config.logger?.error({ error }, "Session terminated with error");
      throw error;
    }

    this.config.logger?.info("Interactive session ended");
  }

  /**
   * Stop the interactive session
   */
  async stop(): Promise<void> {
    this.config.logger?.info("Stopping interactive session manager");

    // Remove signal handlers
    if (this.sigintHandler) {
      process.off("SIGINT", this.sigintHandler);
      this.sigintHandler = undefined;
    }
    if (this.sigtermHandler) {
      process.off("SIGTERM", this.sigtermHandler);
      this.sigtermHandler = undefined;
    }

    await this.streamHandler.stop();

    // Call optional cleanup function
    if (this.config.onStop) {
      await this.config.onStop();
    }
  }

  /**
   * Send a JSON-RPC request and wait for response (used for initialization)
   */
  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const response = await this.streamHandler.sendRequest(request);

    if (!response) {
      throw new Error(
        `No response received for request ${request.id} (notifications should not be sent through sendRequest() method)`
      );
    }

    return response;
  }

  /**
   * Setup event handlers for stream communication
   */
  private setupEventHandlers(): void {
    // Handle incoming JSON-RPC requests from input stream
    this.streamHandler.on("request", (request: JsonRpcRequest) => {
      this.handleRequest(request).catch(error => {
        this.config.logger?.error(
          { error, request },
          "Error processing request"
        );
      });
    });

    // Handle errors from stream handler
    this.streamHandler.on("error", (error: Error) => {
      this.config.logger?.error({ error }, "Session error");
    });

    // Handle session shutdown
    this.streamHandler.on("shutdown", () => {
      this.config.logger?.debug("Session shutdown event received");
    });
  }

  /**
   * Setup signal handlers for clean shutdown
   */
  private setupSignalHandlers(): void {
    // Skip signal handlers in test environments to avoid interfering with vitest
    if (process.env["NODE_ENV"] === "test" || process.env["VITEST"]) {
      this.config.logger?.debug("Skipping signal handlers in test environment");
      return;
    }

    const handleSignal = (signal: string): void => {
      this.config.logger?.info(`Received ${signal}, shutting down session`);
      this.stop().catch(error => {
        this.config.logger?.error({ error }, "Error during signal shutdown");
        process.exit(1);
      });
    };

    this.sigintHandler = () => handleSignal("SIGINT");
    this.sigtermHandler = () => handleSignal("SIGTERM");

    process.on("SIGINT", this.sigintHandler);
    process.on("SIGTERM", this.sigtermHandler);
  }

  /**
   * Process a JSON-RPC request through the pipeline and send response
   */
  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    this.config.logger?.debug(
      { method: request.method, id: request.id },
      "Processing request through pipeline"
    );

    // Process all requests directly through pipeline
    await this.processRequestThroughPipeline(request);
  }

  /**
   * Process a single request through the pipeline
   */
  private async processRequestThroughPipeline(
    request: JsonRpcRequest
  ): Promise<void> {
    try {
      // Process request through pipeline
      const response = await processPipeline(
        this.interceptors,
        this.config.target,
        request
      );

      // Send response back through output stream
      await this.streamHandler.sendResponse(response);

      this.config.logger?.debug(
        { method: request.method, id: request.id },
        "Request processed successfully"
      );
    } catch (error) {
      this.config.logger?.error(
        { error, method: request.method, id: request.id },
        "Error processing request through pipeline"
      );

      // The pipeline should have already converted the error to a JSON-RPC response
      // But if something went wrong, we should still try to send an error response
      if (error instanceof Error) {
        const errorResponse: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: request.id ?? null,
          error: {
            code: -32603,
            message: `Internal error: ${error.message}`,
          },
        };

        await this.streamHandler.sendResponse(errorResponse);
      }
    }
  }
}

// Re-export types for convenience
export { JsonRpcStreamHandler } from "./stream-handler.js";
export type { SessionConfig, StdinParseResult } from "./types.js";
