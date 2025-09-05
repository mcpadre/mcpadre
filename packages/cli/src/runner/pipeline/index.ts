// pattern: Functional Core
// Main pipeline processing function for JSON-RPC interceptor chains

import { createSuccessResponse } from "../../test-utils/json-rpc/types.js";

import { convertErrorToJsonRpcResponse } from "./errors.js";

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../test-utils/json-rpc/types.js";
import type { Interceptor, PipelineTarget } from "./types.js";

/**
 * Process a JSON-RPC request through an interceptor chain to a target handler
 *
 * Flow:
 * 1. Forward pass: Request flows through interceptors in order
 * 2. Target execution: Final request sent to target handler
 * 3. Backward pass: Response flows back through interceptors in reverse order
 *
 * Interceptors can:
 * - Modify requests/responses by returning new objects
 * - Terminate the chain early by returning override responses
 * - Throw errors that get converted to JSON-RPC error responses
 */
export async function processPipeline(
  interceptors: readonly Interceptor[],
  target: PipelineTarget,
  request: JsonRpcRequest
): Promise<JsonRpcResponse> {
  try {
    // Forward pass through interceptors
    let currentRequest = request;

    // User requested for loops for performance over for-of
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < interceptors.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const interceptor = interceptors[i]!;
      const result = await interceptor.processRequest(currentRequest);

      if (result.type === "override") {
        return createSuccessResponse(request.id ?? null, result.response);
      }

      currentRequest = result.request;
    }

    // Execute target with final request
    let response = await target(currentRequest);

    // Backward pass through interceptors (reverse order)
    for (let i = interceptors.length - 1; i >= 0; i--) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const interceptor = interceptors[i]!;
      const result = await interceptor.processResponse(response);

      if (result.type === "override") {
        return createSuccessResponse(request.id ?? null, result.response);
      }

      response = result.response;
    }

    return response;
  } catch (error) {
    // Convert any thrown error to JSON-RPC error response
    return convertErrorToJsonRpcResponse(error, request.id ?? null);
  }
}

// Re-export types for convenience
export { JsonRpcError } from "./errors.js";
export type { Interceptor, PipelineTarget } from "./types.js";
