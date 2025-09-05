// pattern: Functional Core
// JSON-RPC error handling utilities for pipeline processing

import {
  createErrorResponse,
  JsonRpcErrorCodes,
  type JsonRpcErrorResponse,
  type JsonRpcId,
} from "../../test-utils/json-rpc/types.js";

/**
 * JSON-RPC error class for type-safe error throwing in interceptors
 * Extends Error with JSON-RPC specific error codes and data
 */
export class JsonRpcError extends Error {
  /** JSON-RPC error code */
  public readonly code: number;

  /** Optional additional error data */
  public readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "JsonRpcError";
    this.code = code;
    this.data = data;
  }
}

/**
 * Convert any error to a JSON-RPC error response
 * Maps JsonRpcError instances to their codes, others to INTERNAL_ERROR
 */
export function convertErrorToJsonRpcResponse(
  error: unknown,
  requestId: JsonRpcId
): JsonRpcErrorResponse {
  if (error instanceof JsonRpcError) {
    return createErrorResponse(
      requestId,
      error.code,
      error.message,
      error.data
    );
  }

  // Handle generic Error instances
  if (error instanceof Error) {
    return createErrorResponse(
      requestId,
      JsonRpcErrorCodes.INTERNAL_ERROR,
      error.message
    );
  }

  // Handle non-Error thrown values
  return createErrorResponse(
    requestId,
    JsonRpcErrorCodes.INTERNAL_ERROR,
    `Unexpected error: ${String(error)}`
  );
}

/**
 * Type guard to check if an error is a JsonRpcError
 */
export function isJsonRpcError(error: unknown): error is JsonRpcError {
  return error instanceof JsonRpcError;
}

/**
 * Create a JsonRpcError with a standard error code
 * Provides type-safe error creation with predefined codes
 */
export function createJsonRpcError(
  code: keyof typeof JsonRpcErrorCodes,
  message: string,
  data?: unknown
): JsonRpcError {
  return new JsonRpcError(JsonRpcErrorCodes[code], message, data);
}
