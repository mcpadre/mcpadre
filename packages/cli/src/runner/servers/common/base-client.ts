// pattern: Functional Core
// Abstract base class for MCP clients providing common interface and logging patterns

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../../test-utils/json-rpc/types.js";
import type { Logger } from "pino";

/**
 * Abstract base class for all MCP clients.
 * Provides a common interface for sending JSON-RPC requests and stopping servers.
 * Standardizes logging patterns across different MCP client implementations.
 */
export abstract class BaseMcpClient {
  protected logger: Logger;

  constructor(
    logger: Logger,
    protected readonly serverName: string
  ) {
    this.logger = logger.child({
      component: this.getClientType(),
      serverName,
    });
  }

  /**
   * Returns the type identifier for this client (e.g., 'shell-client', 'python-client')
   * Used for logging context and debugging
   */
  protected abstract getClientType(): string;

  /**
   * Send a JSON-RPC request to the MCP server and wait for response
   */
  abstract send(request: JsonRpcRequest): Promise<JsonRpcResponse>;

  /**
   * Stop the MCP server process and clean up resources
   */
  abstract stop(): Promise<void>;

  /**
   * Log server startup information with consistent format across all clients
   */
  protected logServerStartup(details: Record<string, unknown>): void {
    this.logger.info(
      {
        serverName: this.serverName,
        clientType: this.getClientType(),
        ...details,
      },
      `${this.getClientType()} server started successfully`
    );
  }

  /**
   * Log server error with consistent format across all clients
   */
  protected logServerError(error: unknown, context: string): void {
    this.logger.error(
      {
        error,
        serverName: this.serverName,
        clientType: this.getClientType(),
        context,
      },
      `${this.getClientType()} server error: ${context}`
    );
  }

  /**
   * Log debug information with consistent format
   */
  protected logDebug(message: string, details?: Record<string, unknown>): void {
    this.logger.debug(
      {
        serverName: this.serverName,
        clientType: this.getClientType(),
        ...details,
      },
      message
    );
  }
}
