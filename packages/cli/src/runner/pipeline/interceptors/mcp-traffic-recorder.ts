// pattern: Mixed (unavoidable)
// Recording interceptor requires I/O operations integrated with request/response processing

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
 * Entry for JSON-RPC requests in traffic recording
 */
interface McpTrafficRequestEntry {
  timestamp: string;
  id?: string | number | null | undefined;
  req: JsonRpcRequest;
}

/**
 * Entry for JSON-RPC responses in traffic recording
 */
interface McpTrafficResponseEntry {
  timestamp: string;
  id?: string | number | null | undefined;
  res: JsonRpcResponse;
}

/**
 * MCP Traffic Recorder Interceptor
 *
 * Records all JSON-RPC requests and responses to a JSONL file when enabled.
 * Must be the first (zeroth) interceptor in the pipeline chain.
 *
 * Recording format: One JSON object per line (JSONL)
 * - Requests: { "timestamp": "...", "id": "...", "req": { -- request body -- } }
 * - Responses: { "timestamp": "...", "id": "...", "res": { -- response body -- } }
 */
export class McpTrafficRecorder implements Interceptor {
  readonly name = "MCP Traffic Recorder";

  constructor(private readonly recordingFilePath: string) {}

  /**
   * Process an incoming request and record it
   *
   * @param request The JSON-RPC request to process
   * @returns Continuation result with the original request
   */
  async processRequest(
    request: JsonRpcRequest
  ): Promise<InterceptorRequestResult> {
    try {
      const recordingEntry: McpTrafficRequestEntry = {
        timestamp: new Date().toISOString(),
        id: request.id,
        req: request,
      };

      const recordingLine = `${JSON.stringify(recordingEntry)}\n`;
      await appendFile(this.recordingFilePath, recordingLine, "utf8");
    } catch {
      // Recording errors should not crash the MCP server
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
   * Process an outgoing response and record it
   *
   * @param response The JSON-RPC response to process
   * @returns Continuation result with the original response
   */
  async processResponse(
    response: JsonRpcResponse
  ): Promise<InterceptorResponseResult> {
    try {
      const recordingEntry: McpTrafficResponseEntry = {
        timestamp: new Date().toISOString(),
        id: response.id,
        res: response,
      };

      const recordingLine = `${JSON.stringify(recordingEntry)}\n`;
      await appendFile(this.recordingFilePath, recordingLine, "utf8");
    } catch {
      // Recording errors should not crash the MCP server
      // In a production environment, we might want to record this error
      // to a separate error log, but for now we silently continue
    }

    // Always continue with the original response
    return {
      type: "response",
      response,
    };
  }
}
