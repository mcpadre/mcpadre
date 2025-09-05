// pattern: Mixed (unavoidable)
// HTTP client requires integration of business logic with side effects for network I/O

import { BaseMcpClient } from "../common/base-client.js";

import type { HttpMcpServer } from "../../../config/types/index.js";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../../test-utils/json-rpc/types.js";
import type { ResolvedEnvVar } from "../../types/index.js";
import type { Logger } from "pino";

/**
 * HTTP MCP client for communicating with remote MCP servers
 * Handles pre-resolved headers and JSON-RPC over HTTP transport
 */
export class HttpMcpClient extends BaseMcpClient {
  constructor(
    private readonly config: HttpMcpServer,
    private readonly resolvedHeaders: Record<string, ResolvedEnvVar>,
    logger: Logger,
    serverName: string
  ) {
    super(logger, serverName);
  }

  protected getClientType(): string {
    return "http-client";
  }

  /**
   * Send a JSON-RPC request to the remote MCP server via HTTP POST
   */
  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const headers = this.buildHeaders();

    const response = await fetch(this.config.http.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check if response is SSE or JSON
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      // Handle SSE response
      const text = await response.text();
      return this.parseSSEResponse(text, request.id ?? null);
    } else {
      // Handle JSON response
      const responseText = await response.text();

      // Handle empty responses (common for notifications)
      if (!responseText.trim()) {
        // For notifications (no id), return a synthetic success response
        if (!request.id) {
          return {
            jsonrpc: "2.0",
            id: null,
            result: null,
          };
        }

        // For requests with id, empty response is an error
        throw new Error("Server returned empty response for request with id");
      }

      try {
        const jsonResponse = JSON.parse(responseText);
        return jsonResponse as JsonRpcResponse;
      } catch (error) {
        throw new Error(
          `Failed to parse JSON response: ${error}. Response: ${responseText.substring(0, 200)}`
        );
      }
    }
  }

  /**
   * Stop the HTTP MCP client (no-op for stateless HTTP connections)
   */
  async stop(): Promise<void> {
    // HTTP connections are stateless, nothing to clean up
    this.logDebug("HTTP client stopped (no cleanup needed)");
  }

  /**
   * Build HTTP headers from pre-resolved environment variables
   */
  private buildHeaders(): Record<string, string> {
    if (!this.config.http.headers) {
      return {};
    }

    const headers: Record<string, string> = {};

    for (const key of Object.keys(this.config.http.headers)) {
      const resolvedValue = this.resolvedHeaders[key];
      if (resolvedValue) {
        headers[key] = resolvedValue;
      }
    }

    return headers;
  }

  /**
   * Parse SSE (Server-Sent Events) response to extract JSON-RPC message
   * Simple parser for Context7's SSE format
   */
  private parseSSEResponse(
    sseText: string,
    requestId: string | number | null
  ): JsonRpcResponse {
    // Parse SSE format: look for data: lines with JSON content
    const lines = sseText.split("\n");
    let lastJsonData = "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.substring(6); // Remove 'data: ' prefix
        if (data.trim() && data !== "[DONE]") {
          try {
            // Try to parse as JSON to validate
            JSON.parse(data);
            lastJsonData = data;
          } catch {
            // Not valid JSON, skip this data line
          }
        }
      }
    }

    if (lastJsonData) {
      try {
        return JSON.parse(lastJsonData) as JsonRpcResponse;
      } catch (error) {
        // If parsing fails, return error response
        return {
          jsonrpc: "2.0",
          id: requestId,
          error: {
            code: -32603,
            message: `Failed to parse SSE response: ${error}`,
          },
        };
      }
    }

    // No valid JSON data found in SSE
    return {
      jsonrpc: "2.0",
      id: requestId,
      error: {
        code: -32603,
        message: "No valid JSON data found in SSE response",
      },
    };
  }
}
