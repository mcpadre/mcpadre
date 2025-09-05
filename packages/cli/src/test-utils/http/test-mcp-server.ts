// pattern: Imperative Shell

import { createServer } from "http";

import type { Server } from "http";
import type { IncomingMessage, ServerResponse } from "http";

/**
 * Simple HTTP MCP server for testing
 * Responds to JSON-RPC requests with test data
 */
export class TestMcpServer {
  private server: Server;
  private port: number;
  private responses = new Map<string, object>();

  constructor(port = 0) {
    this.port = port;
    this.server = createServer(this.handleRequest.bind(this));

    // Setup default responses
    this.setupDefaultResponses();
  }

  /**
   * Start the server and return the actual port
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, "127.0.0.1", () => {
        const address = this.server.address();
        if (address && typeof address === "object") {
          this.port = address.port;
          resolve(this.port);
        } else {
          reject(new Error("Failed to get server address"));
        }
      });

      this.server.on("error", reject);
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get the server URL
   */
  getUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /**
   * Set a custom response for a specific method
   */
  setResponse(method: string, response: object): void {
    this.responses.set(method, response);
  }

  /**
   * Setup default MCP responses
   */
  private setupDefaultResponses(): void {
    this.setResponse("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        logging: {},
      },
      serverInfo: {
        name: "test-mcp-server",
        version: "1.0.0",
      },
    });

    this.setResponse("tools/list", {
      tools: [
        {
          name: "test_tool",
          description: "A test tool",
          inputSchema: {
            type: "object",
            properties: {
              message: { type: "string" },
            },
          },
        },
      ],
    });

    this.setResponse("tools/call", {
      content: [
        {
          type: "text",
          text: "Test tool executed successfully",
        },
      ],
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    try {
      // Read request body
      const body = await this.readRequestBody(req);

      if (!body.trim()) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Empty request body" }));
        return;
      }

      // Parse JSON-RPC request
      let jsonRpcRequest: unknown;
      try {
        jsonRpcRequest = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          })
        );
        return;
      }

      // Handle JSON-RPC request
      const response = this.handleJsonRpcRequest(jsonRpcRequest);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    } catch (error) {
      // Log error for debugging (allowed in test utilities)
      // eslint-disable-next-line no-console
      console.error("Test server error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message: "Internal error" },
        })
      );
    }
  }

  /**
   * Read the full request body
   */
  private readRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";

      req.on("data", chunk => {
        body += chunk.toString();
      });

      req.on("end", () => {
        resolve(body);
      });

      req.on("error", reject);
    });
  }

  /**
   * Handle a JSON-RPC request and return appropriate response
   */
  private handleJsonRpcRequest(request: unknown): object {
    const requestObj = request as {
      jsonrpc?: string;
      method?: string;
      id?: unknown;
    };
    const { jsonrpc, method, id } = requestObj;

    // Validate JSON-RPC structure
    if (jsonrpc !== "2.0") {
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: { code: -32600, message: "Invalid Request" },
      };
    }

    // Handle notifications (no id)
    if (id === undefined) {
      // For notifications, we don't send a response
      return {};
    }

    if (!method) {
      throw new Error("Method is required for JSON-RPC requests");
    }

    // Get response for this method
    const result = this.responses.get(method);

    if (result) {
      return {
        jsonrpc: "2.0",
        id,
        result,
      };
    } else {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Method not found" },
      };
    }
  }
}
