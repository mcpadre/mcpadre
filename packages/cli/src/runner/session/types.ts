// pattern: Functional Core
// Type definitions for interactive session management

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../test-utils/json-rpc/types.js";
import type { PipelineTarget } from "../pipeline/types.js";
import type { Readable, Writable } from "node:stream";
import type { Logger } from "pino";

/**
 * Configuration for an interactive session
 */
export interface SessionConfig {
  /** Pipeline target to send requests to */
  target: PipelineTarget;
  /** Input stream for reading JSON-RPC requests */
  input?: Readable;
  /** Output stream for writing JSON-RPC responses */
  output?: Writable;
  /** Optional logger for session events */
  logger?: Logger;
  /** Optional cleanup function called when session stops */
  onStop?: () => Promise<void>;
}

/**
 * Interface for stream-based JSON-RPC handling in interactive sessions
 */
export interface StreamHandler {
  /**
   * Start reading from input stream and processing JSON-RPC requests
   */
  start(): Promise<void>;

  /**
   * Stop the session and clean up resources
   */
  stop(): Promise<void>;

  /**
   * Send a JSON-RPC response to output stream
   */
  sendResponse(response: JsonRpcResponse): Promise<void>;

  /**
   * Send a JSON-RPC request or notification (dumb pipe - no modification)
   * Returns response promise for requests, undefined for notifications
   */
  sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | undefined>;
}

/**
 * Events that can be emitted during a session
 */
export interface SessionEvents {
  /** Emitted when a request is received from stdin */
  request: (request: JsonRpcRequest) => void;
  /** Emitted when a response is sent to stdout */
  response: (response: JsonRpcResponse) => void;
  /** Emitted when an error occurs */
  error: (error: Error) => void;
  /** Emitted when the session is terminating */
  shutdown: () => void;
}

/**
 * Result from parsing a line of stdin input
 */
export type StdinParseResult =
  | {
      type: "request";
      request: JsonRpcRequest;
    }
  | {
      type: "empty";
    }
  | {
      type: "error";
      error: string;
    };
