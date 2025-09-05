// pattern: Functional Core
// JSON-RPC 2.0 type definitions for protocol compliance

/**
 * Valid JSON-RPC 2.0 identifier types
 */
export type JsonRpcId = string | number | null;

/**
 * JSON-RPC 2.0 request structure
 */
export interface JsonRpcRequest {
  /** Protocol version, must be "2.0" */
  jsonrpc: "2.0";
  /** Method name to invoke */
  method: string;
  /** Optional parameters for the method */
  params?: unknown;
  /** Request identifier for correlation */
  id?: JsonRpcId;
}

/**
 * JSON-RPC 2.0 error object
 */
export interface JsonRpcError {
  /** Error code indicating error type */
  code: number;
  /** Human-readable error message */
  message: string;
  /** Optional additional error data */
  data?: unknown;
}

/**
 * JSON-RPC 2.0 success response
 */
export interface JsonRpcSuccessResponse {
  /** Protocol version, must be "2.0" */
  jsonrpc: "2.0";
  /** Result data from successful method call */
  result: unknown;
  /** Request identifier for correlation */
  id: JsonRpcId;
}

/**
 * JSON-RPC 2.0 error response
 */
export interface JsonRpcErrorResponse {
  /** Protocol version, must be "2.0" */
  jsonrpc: "2.0";
  /** Error information */
  error: JsonRpcError;
  /** Request identifier for correlation */
  id: JsonRpcId;
}

/**
 * Union type for all JSON-RPC 2.0 responses
 */
export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

/**
 * Standard JSON-RPC 2.0 error codes
 */
export const JsonRpcErrorCodes = {
  /** Invalid JSON was received by the server */
  PARSE_ERROR: -32700,
  /** The JSON sent is not a valid Request object */
  INVALID_REQUEST: -32600,
  /** The method does not exist / is not available */
  METHOD_NOT_FOUND: -32601,
  /** Invalid method parameter(s) */
  INVALID_PARAMS: -32602,
  /** Internal JSON-RPC error */
  INTERNAL_ERROR: -32603,
} as const;

/**
 * Create a JSON-RPC 2.0 success response
 */
export function createSuccessResponse(
  id: JsonRpcId,
  result: unknown
): JsonRpcSuccessResponse {
  return {
    jsonrpc: "2.0",
    result,
    id,
  };
}

/**
 * Create a JSON-RPC 2.0 error response
 */
export function createErrorResponse(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcErrorResponse {
  return {
    jsonrpc: "2.0",
    error: {
      code,
      message,
      ...(data !== undefined && { data }),
    },
    id,
  };
}

/**
 * Type guard to check if response is a success response
 */
export function isSuccessResponse(
  response: JsonRpcResponse
): response is JsonRpcSuccessResponse {
  return "result" in response;
}

/**
 * Type guard to check if response is an error response
 */
export function isErrorResponse(
  response: JsonRpcResponse
): response is JsonRpcErrorResponse {
  return "error" in response;
}
