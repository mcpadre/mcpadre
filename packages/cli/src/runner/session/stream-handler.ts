// pattern: Mixed (unavoidable)
// Stream handling requires integration of I/O operations with JSON-RPC parsing logic

import { EventEmitter } from "node:events";

import {
  createErrorResponse,
  JsonRpcErrorCodes,
} from "../../test-utils/json-rpc/types.js";

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../test-utils/json-rpc/types.js";
import type { StdinParseResult, StreamHandler } from "./types.js";
import type { Readable, Writable } from "node:stream";
import type { Logger } from "pino";

/**
 * Handles JSON-RPC communication over configurable input/output streams
 */
export class JsonRpcStreamHandler
  extends EventEmitter
  implements StreamHandler
{
  private isRunning = false;
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (response: JsonRpcResponse) => void;
      reject: (error: Error) => void;
    }
  >();
  private inputBuffer = "";

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
    private readonly logger?: Logger
  ) {
    super();
  }

  /**
   * Start reading from input stream and processing JSON-RPC requests
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Session already running");
    }

    this.isRunning = true;
    this.logger?.info("Starting interactive JSON-RPC session");

    // Set input encoding if it's a readable stream that supports it
    if (
      "setEncoding" in this.input &&
      typeof this.input.setEncoding === "function"
    ) {
      this.input.setEncoding("utf8");
    }

    this.input.on("data", (chunk: string | Buffer) => {
      const chunkStr =
        typeof chunk === "string" ? chunk : chunk.toString("utf8");
      this.handleInputData(chunkStr).catch(error => {
        this.logger?.error({ error }, "Error handling input data");
        this.emit("error", error);
      });
    });

    this.input.on("end", () => {
      this.logger?.debug("Input stream ended, shutting down session");
      this.stop().catch(error => {
        this.logger?.error({ error }, "Error during session shutdown");
      });
    });

    this.input.on("error", error => {
      this.logger?.error({ error }, "Input stream error");
      this.emit("error", error);
    });

    this.output.on("error", error => {
      this.logger?.error({ error }, "Output stream error");
      this.emit("error", error);
    });

    // Keep the process alive while session is running
    return new Promise<void>((resolve, reject) => {
      this.once("shutdown", resolve);
      this.once("error", reject);
    });
  }

  /**
   * Stop the session and clean up resources
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger?.info("Stopping interactive session");
    this.isRunning = false;

    // Reject any pending requests
    for (const { reject } of this.pendingRequests.values()) {
      reject(new Error("Session terminated"));
    }
    this.pendingRequests.clear();

    // Remove stream listeners
    this.input.removeAllListeners("data");
    this.input.removeAllListeners("end");
    this.input.removeAllListeners("error");
    this.output.removeAllListeners("error");

    // If input is stdin, we need to destroy it to prevent the EIO error
    if (this.input === process.stdin) {
      this.input.destroy();
    }

    this.emit("shutdown");
  }

  /**
   * Send a JSON-RPC response to output stream
   */
  async sendResponse(response: JsonRpcResponse): Promise<void> {
    const responseJson = JSON.stringify(response);
    this.logger?.trace(
      { response: responseJson },
      "Sending response to output stream"
    );

    return new Promise<void>((resolve, reject) => {
      this.output.write(`${responseJson}\n`, error => {
        if (error) {
          reject(error);
        } else {
          this.emit("response", response);
          resolve();
        }
      });
    });
  }

  /**
   * Send a JSON-RPC request or notification (dumb pipe - no modification)
   */
  async sendRequest(
    request: JsonRpcRequest
  ): Promise<JsonRpcResponse | undefined> {
    this.logger?.debug(
      {
        method: request.method,
        requestId: request.id,
        hasId: request.id !== undefined,
        isNotification: request.id === undefined,
      },
      "StreamHandler: sending JSON-RPC message"
    );

    // For requests with ID, set up response handling
    let responsePromise: Promise<JsonRpcResponse> | undefined;
    if (request.id !== undefined) {
      responsePromise = new Promise<JsonRpcResponse>((resolve, reject) => {
        this.pendingRequests.set(request.id as string | number, {
          resolve,
          reject,
        });
        this.logger?.debug(
          {
            requestId: request.id,
            method: request.method,
            pendingCount: this.pendingRequests.size,
          },
          "StreamHandler: added request to pending map"
        );
      });
    }

    // Send the message exactly as received - dumb pipe
    const requestJson = JSON.stringify(request);
    this.logger?.debug(
      {
        requestId: request.id,
        method: request.method,
        jsonLength: requestJson.length,
      },
      "StreamHandler: writing message to output stream"
    );

    await new Promise<void>((resolve, reject) => {
      this.output.write(`${requestJson}\n`, error => {
        if (error) {
          this.logger?.error(
            {
              error,
              requestId: request.id,
              method: request.method,
            },
            "StreamHandler: error writing message to output stream"
          );
          reject(error);
        } else {
          this.logger?.debug(
            {
              requestId: request.id,
              method: request.method,
            },
            "StreamHandler: successfully wrote message to output stream"
          );
          this.emit("request", request);
          resolve();
        }
      });
    });

    // Return response promise for requests, undefined for notifications
    return responsePromise;
  }

  /**
   * Handle incoming data from input stream, buffering and processing complete lines
   */
  private async handleInputData(chunk: string): Promise<void> {
    this.logger?.trace(
      {
        chunkLength: chunk.length,
        bufferLengthBefore: this.inputBuffer.length,
        chunkPreview: chunk.slice(0, 200),
        containsNewline: chunk.includes("\n"),
      },
      "StreamHandler: received data chunk from input stream"
    );

    this.inputBuffer += chunk;

    this.logger?.trace(
      {
        bufferLengthAfter: this.inputBuffer.length,
        bufferPreview: this.inputBuffer.slice(0, 200),
      },
      "StreamHandler: data chunk added to input buffer"
    );

    // Process complete lines
    let newlineIndex;
    let lineCount = 0;
    while ((newlineIndex = this.inputBuffer.indexOf("\n")) !== -1) {
      const line = this.inputBuffer.slice(0, newlineIndex);
      this.inputBuffer = this.inputBuffer.slice(newlineIndex + 1);
      lineCount++;

      this.logger?.trace(
        {
          lineNumber: lineCount,
          lineLength: line.length,
          line: line.trim(),
          remainingBufferLength: this.inputBuffer.length,
        },
        "StreamHandler: extracted complete line from buffer"
      );

      await this.handleInputLine(line);
    }

    if (lineCount > 0) {
      this.logger?.debug(
        {
          linesProcessed: lineCount,
          finalBufferLength: this.inputBuffer.length,
        },
        "StreamHandler: finished processing data chunk lines"
      );
    }
  }

  /**
   * Handle a complete line of input from input stream
   */
  private async handleInputLine(line: string): Promise<void> {
    const parseResult = this.parseInputLine(line);

    switch (parseResult.type) {
      case "empty":
        // Ignore empty lines
        return;

      case "error": {
        this.logger?.warn(
          { line, error: parseResult.error },
          "Invalid JSON-RPC input"
        );
        // Send error response if we can determine the request ID
        const errorResponse = createErrorResponse(
          null,
          JsonRpcErrorCodes.PARSE_ERROR,
          parseResult.error
        );
        await this.sendResponse(errorResponse);
        return;
      }

      case "request": {
        this.logger?.trace(
          { request: parseResult.request },
          "Received request from input stream"
        );
        this.emit("request", parseResult.request);
        return;
      }
    }
  }

  /**
   * Parse a line of input into a JSON-RPC request
   */
  private parseInputLine(line: string): StdinParseResult {
    const trimmed = line.trim();

    if (!trimmed) {
      return { type: "empty" };
    }

    try {
      const parsed = JSON.parse(trimmed);

      // Basic JSON-RPC validation
      if (!parsed || typeof parsed !== "object") {
        return { type: "error", error: "Input must be a JSON object" };
      }

      if (parsed.jsonrpc !== "2.0") {
        return {
          type: "error",
          error: "Must be JSON-RPC 2.0 (jsonrpc: '2.0')",
        };
      }

      // Check if it's a response (has result or error) or request (has method)
      if ("result" in parsed || "error" in parsed) {
        // This is a response to a request we sent
        this.logger?.debug(
          {
            responseId: parsed.id,
            hasResult: "result" in parsed,
            hasError: "error" in parsed,
            line: trimmed,
          },
          "StreamHandler: detected incoming response, routing to response handler"
        );
        this.handleIncomingResponse(parsed as JsonRpcResponse);
        return { type: "empty" }; // Don't emit as request
      }

      if (!parsed.method || typeof parsed.method !== "string") {
        return { type: "error", error: "Request must have a 'method' field" };
      }

      return {
        type: "request",
        request: parsed as JsonRpcRequest,
      };
    } catch (error) {
      return {
        type: "error",
        error: `Invalid JSON: ${error}`,
      };
    }
  }

  /**
   * Handle an incoming response to a request we sent
   */
  private handleIncomingResponse(response: JsonRpcResponse): void {
    this.logger?.debug(
      {
        responseId: response.id,
        hasResult: "result" in response,
        hasError: "error" in response,
        pendingRequestCount: this.pendingRequests.size,
        allPendingIds: Array.from(this.pendingRequests.keys()),
      },
      "StreamHandler: processing incoming JSON-RPC response"
    );

    if (response.id == null) {
      this.logger?.warn(
        {
          responsePreview: `${JSON.stringify(response).slice(0, 100)}...`,
          pendingRequestCount: this.pendingRequests.size,
        },
        "StreamHandler: received response with null ID, ignoring"
      );
      return;
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      this.logger?.warn(
        {
          responseId: response.id,
          allPendingIds: Array.from(this.pendingRequests.keys()),
          pendingRequestCount: this.pendingRequests.size,
          responsePreview: `${JSON.stringify(response).slice(0, 100)}...`,
        },
        "StreamHandler: received response for unknown request ID - possible correlation issue"
      );
      return;
    }

    this.logger?.debug(
      {
        responseId: response.id,
        pendingBefore: this.pendingRequests.size,
        hasResult: "result" in response,
        hasError: "error" in response,
      },
      "StreamHandler: found pending request for response, resolving"
    );

    this.pendingRequests.delete(response.id);

    this.logger?.debug(
      {
        responseId: response.id,
        pendingAfter: this.pendingRequests.size,
        remainingPendingIds: Array.from(this.pendingRequests.keys()),
        responsePreview: `${JSON.stringify(response).slice(0, 100)}...`,
      },
      "StreamHandler: resolved pending request with response"
    );

    pending.resolve(response);
  }
}
