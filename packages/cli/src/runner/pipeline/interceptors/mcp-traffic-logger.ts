// pattern: Mixed (unavoidable)
// Logging interceptor requires I/O operations integrated with request/response processing

import { appendFile } from "fs/promises";

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../../test-utils/json-rpc/types.js";
import type {
  Interceptor,
  InterceptorRequestResult,
  InterceptorResponseResult,
} from "../types.js";

/**
 * Log entry for JSON-RPC requests
 */
interface McpTrafficRequestLogEntry {
  timestamp: string;
  id?: string | number | null | undefined;
  req: JsonRpcRequest;
}

/**
 * Log entry for JSON-RPC responses
 */
interface McpTrafficResponseLogEntry {
  timestamp: string;
  id?: string | number | null | undefined;
  res: JsonRpcResponse;
}

/**
 * MCP Traffic Logger Interceptor
 *
 * Logs all JSON-RPC requests and responses to a JSONL file when enabled.
 * Must be the first (zeroth) interceptor in the pipeline chain.
 *
 * Log format: One JSON object per line (JSONL)
 * - Requests: { "timestamp": "...", "id": "...", "req": { -- request body -- } }
 * - Responses: { "timestamp": "...", "id": "...", "res": { -- response body -- } }
 */
export class McpTrafficLogger implements Interceptor {
  readonly name = "MCP Traffic Logger";

  constructor(private readonly logFilePath: string) {}

  /**
   * Process an incoming request and log it
   *
   * @param request The JSON-RPC request to process
   * @returns Continuation result with the original request
   */
  async processRequest(
    request: JsonRpcRequest
  ): Promise<InterceptorRequestResult> {
    try {
      const logEntry: McpTrafficRequestLogEntry = {
        time: new Date().toISOString(),
        id: request.id,
        req: request,
      };

      const logLine = `${JSON.stringify(logEntry)}\n`;
      await appendFile(this.logFilePath, logLine, "utf8");
    } catch {
      // Log errors should not crash the MCP server
      // In a production environment, we might want to log this error
      // to a separate error log, but for now we silently continue
    }

    // Always continue with the original request
    return {
      type: "request",
      request,
    };
  }

  /**
   * Process an outgoing response and log it
   *
   * @param response The JSON-RPC response to process
   * @returns Continuation result with the original response
   */
  async processResponse(
    response: JsonRpcResponse
  ): Promise<InterceptorResponseResult> {
    try {
      const logEntry: McpTrafficResponseLogEntry = {
        time: new Date().toISOString(),
        id: response.id,
        res: response,
      };

      const logLine = `${JSON.stringify(logEntry)}\n`;
      await appendFile(this.logFilePath, logLine, "utf8");
    } catch {
      // Log errors should not crash the MCP server
      // In a production environment, we might want to log this error
      // to a separate error log, but for now we silently continue
    }

    // Always continue with the original response
    return {
      type: "response",
      response,
    };
  }
}
