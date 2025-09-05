// pattern: Functional Core
// Pipeline type definitions for JSON-RPC interceptor chain

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../test-utils/json-rpc/types.js";

/**
 * Result from processing a request through an interceptor
 * Either continues with modified request or overrides with immediate response
 */
export type InterceptorRequestResult =
  | {
      type: "request";
      request: JsonRpcRequest;
    }
  | {
      type: "override";
      response: unknown;
    };

/**
 * Result from processing a response through an interceptor
 * Either continues with modified response or overrides with different response
 */
export type InterceptorResponseResult =
  | {
      type: "response";
      response: JsonRpcResponse;
    }
  | {
      type: "override";
      response: unknown;
    };

/**
 * Interface for pipeline interceptors
 * Interceptors can modify, observe, or terminate request/response flow
 */
export interface Interceptor {
  /** Optional name for debugging and logging */
  readonly name?: string;

  /**
   * Process a request going from client to server
   * Can modify the request or terminate the chain with an override response
   * Throwing an error will convert to JSON-RPC error response
   */
  processRequest(request: JsonRpcRequest): Promise<InterceptorRequestResult>;

  /**
   * Process a response going from server to client
   * Can modify the response or override with a different response
   * Throwing an error will convert to JSON-RPC error response
   */
  processResponse(
    response: JsonRpcResponse
  ): Promise<InterceptorResponseResult>;
}

/**
 * Pipeline target function type
 * The terminal handler that processes the final request
 */
export type PipelineTarget = (
  request: JsonRpcRequest
) => Promise<JsonRpcResponse>;
