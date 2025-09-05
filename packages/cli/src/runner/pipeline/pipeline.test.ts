// pattern: Imperative Shell
import { describe, expect, it } from "vitest";

import { createLogger } from "../../logger/config.js";
import { JsonRpcErrorCodes } from "../../test-utils/json-rpc/types.js";
import { createMcpEchoServer } from "../../test-utils/mcp/echo-server.js";

import { JsonRpcError, processPipeline } from "./index.js";

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../test-utils/json-rpc/types.js";
import type {
  Interceptor,
  InterceptorRequestResult,
  InterceptorResponseResult,
} from "./types.js";

describe("processPipeline", () => {
  // Create silent logger for echo server
  const logger = createLogger("json", false);
  logger.level = "silent";

  // Create echo server target for testing
  const echoServer = createMcpEchoServer(logger);
  const echoTarget = async (
    request: JsonRpcRequest
  ): Promise<JsonRpcResponse> => {
    return echoServer.processRequest(request);
  };

  // Test interceptors
  class TestLoggingInterceptor implements Interceptor {
    public readonly name = "TestLogging";
    public readonly requestsProcessed: JsonRpcRequest[] = [];
    public readonly responsesProcessed: JsonRpcResponse[] = [];

    async processRequest(
      request: JsonRpcRequest
    ): Promise<InterceptorRequestResult> {
      this.requestsProcessed.push(request);
      return { type: "request", request };
    }

    async processResponse(
      response: JsonRpcResponse
    ): Promise<InterceptorResponseResult> {
      this.responsesProcessed.push(response);
      return { type: "response", response };
    }
  }

  class TestFirewallInterceptor implements Interceptor {
    public readonly name = "TestFirewall";

    constructor(private blockedMethods: string[]) {}

    async processRequest(
      request: JsonRpcRequest
    ): Promise<InterceptorRequestResult> {
      if (this.blockedMethods.includes(request.method)) {
        throw new JsonRpcError(
          JsonRpcErrorCodes.METHOD_NOT_FOUND,
          `Method ${request.method} is blocked by firewall`
        );
      }
      return { type: "request", request };
    }

    async processResponse(
      response: JsonRpcResponse
    ): Promise<InterceptorResponseResult> {
      return { type: "response", response };
    }
  }

  class TestModifierInterceptor implements Interceptor {
    public readonly name = "TestModifier";

    async processRequest(
      request: JsonRpcRequest
    ): Promise<InterceptorRequestResult> {
      // Add a timestamp parameter to requests
      const modifiedRequest = {
        ...request,
        params: {
          ...(typeof request.params === "object" && request.params !== null
            ? request.params
            : {}),
          timestamp: Date.now(),
        },
      };
      return { type: "request", request: modifiedRequest };
    }

    async processResponse(
      response: JsonRpcResponse
    ): Promise<InterceptorResponseResult> {
      // Add metadata to successful responses
      if ("result" in response) {
        const modifiedResponse = {
          ...response,
          result: {
            ...(typeof response.result === "object" && response.result !== null
              ? response.result
              : {}),
            metadata: { processed: true },
          },
        };
        return { type: "response", response: modifiedResponse };
      }
      return { type: "response", response };
    }
  }

  class TestOverrideInterceptor implements Interceptor {
    public readonly name = "TestOverride";

    constructor(
      private overrideMethod: string,
      private overrideResponse: unknown,
      private overrideOnRequest = true
    ) {}

    async processRequest(
      request: JsonRpcRequest
    ): Promise<InterceptorRequestResult> {
      if (this.overrideOnRequest && request.method === this.overrideMethod) {
        return { type: "override", response: this.overrideResponse };
      }
      return { type: "request", request };
    }

    async processResponse(
      response: JsonRpcResponse
    ): Promise<InterceptorResponseResult> {
      if (!this.overrideOnRequest && "result" in response) {
        const result = response.result as any;
        if (result?.method === this.overrideMethod) {
          return { type: "override", response: this.overrideResponse };
        }
      }
      return { type: "response", response };
    }
  }

  describe("basic functionality", () => {
    it("should process request through empty pipeline", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "test",
      };

      const response = await processPipeline([], echoTarget, request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: { method: "test" },
      });
    });

    it("should process request through single interceptor", async () => {
      const logger = new TestLoggingInterceptor();
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "test-single",
      };

      const response = await processPipeline([logger], echoTarget, request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 2,
        result: { method: "test-single" },
      });

      // Verify interceptor was called
      expect(logger.requestsProcessed).toHaveLength(1);
      expect(logger.responsesProcessed).toHaveLength(1);
      expect(logger.requestsProcessed[0]?.method).toBe("test-single");
    });

    it("should process request through multiple interceptors in order", async () => {
      const logger1 = new TestLoggingInterceptor();
      const logger2 = new TestLoggingInterceptor();
      const modifier = new TestModifierInterceptor();

      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 3,
        method: "test-multiple",
      };

      const response = await processPipeline(
        [logger1, modifier, logger2],
        echoTarget,
        request
      );

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 3,
        result: {
          method: "test-multiple",
          metadata: { processed: true },
        },
      });

      // Verify all interceptors were called
      expect(logger1.requestsProcessed).toHaveLength(1);
      expect(logger2.requestsProcessed).toHaveLength(1);
      expect(logger1.responsesProcessed).toHaveLength(1);
      expect(logger2.responsesProcessed).toHaveLength(1);

      // Verify request modification reached second logger
      expect(logger2.requestsProcessed[0]?.params).toHaveProperty("timestamp");
    });
  });

  describe("request modification", () => {
    it("should modify request parameters", async () => {
      const modifier = new TestModifierInterceptor();
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 4,
        method: "test-modify",
        params: { original: true },
      };

      const response = await processPipeline([modifier], echoTarget, request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 4,
        result: {
          method: "test-modify",
          metadata: { processed: true },
        },
      });
    });
  });

  describe("request override", () => {
    it("should override request and skip target", async () => {
      const override = new TestOverrideInterceptor("blocked-method", {
        blocked: true,
      });
      const logger = new TestLoggingInterceptor();

      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 5,
        method: "blocked-method",
      };

      const response = await processPipeline(
        [logger, override],
        echoTarget,
        request
      );

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 5,
        result: { blocked: true },
      });

      // Verify logger was called but target was not reached
      expect(logger.requestsProcessed).toHaveLength(1);
      expect(logger.responsesProcessed).toHaveLength(0); // No response processing
    });
  });

  describe("response override", () => {
    it("should override response from interceptor", async () => {
      const override = new TestOverrideInterceptor(
        "override-response",
        { overridden: true },
        false // Override on response
      );

      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 6,
        method: "override-response",
      };

      const response = await processPipeline([override], echoTarget, request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 6,
        result: { overridden: true },
      });
    });
  });

  describe("error handling", () => {
    it("should convert JsonRpcError to error response", async () => {
      const firewall = new TestFirewallInterceptor(["blocked"]);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 7,
        method: "blocked",
      };

      const response = await processPipeline([firewall], echoTarget, request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 7,
        error: {
          code: JsonRpcErrorCodes.METHOD_NOT_FOUND,
          message: "Method blocked is blocked by firewall",
        },
      });
    });

    it("should convert generic Error to internal error response", async () => {
      class ThrowingInterceptor implements Interceptor {
        async processRequest(): Promise<InterceptorRequestResult> {
          throw new Error("Something went wrong");
        }

        async processResponse(): Promise<InterceptorResponseResult> {
          throw new Error("Should not reach here");
        }
      }

      const throwing = new ThrowingInterceptor();
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 8,
        method: "test-error",
      };

      const response = await processPipeline([throwing], echoTarget, request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 8,
        error: {
          code: JsonRpcErrorCodes.INTERNAL_ERROR,
          message: "Something went wrong",
        },
      });
    });

    it("should handle errors in response processing", async () => {
      class ResponseThrowingInterceptor implements Interceptor {
        async processRequest(
          request: JsonRpcRequest
        ): Promise<InterceptorRequestResult> {
          return { type: "request", request };
        }

        async processResponse(): Promise<InterceptorResponseResult> {
          throw new JsonRpcError(
            JsonRpcErrorCodes.INTERNAL_ERROR,
            "Response processing failed"
          );
        }
      }

      const throwing = new ResponseThrowingInterceptor();
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 9,
        method: "test-response-error",
      };

      const response = await processPipeline([throwing], echoTarget, request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 9,
        error: {
          code: JsonRpcErrorCodes.INTERNAL_ERROR,
          message: "Response processing failed",
        },
      });
    });
  });

  describe("edge cases", () => {
    it("should handle null request id", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test-null-id",
        id: null,
      };

      const response = await processPipeline([], echoTarget, request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: null,
        result: { method: "test-null-id" },
      });
    });

    it("should handle missing request id", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "test-missing-id",
      };

      const response = await processPipeline([], echoTarget, request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: null,
        result: { method: "test-missing-id" },
      });
    });

    it("should preserve request id in override responses", async () => {
      const override = new TestOverrideInterceptor("test", {
        overridden: true,
      });
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "string-id",
        method: "test",
      };

      const response = await processPipeline([override], echoTarget, request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: "string-id",
        result: { overridden: true },
      });
    });

    it("should preserve request id in error responses", async () => {
      const firewall = new TestFirewallInterceptor(["test"]);
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 42,
        method: "test",
      };

      const response = await processPipeline([firewall], echoTarget, request);

      expect(response.id).toBe(42);
      expect(response).toHaveProperty("error");
    });
  });

  describe("interceptor ordering", () => {
    it("should process interceptors in forward order for requests", async () => {
      const order: string[] = [];

      class OrderTrackingInterceptor implements Interceptor {
        constructor(public readonly name: string) {}

        async processRequest(
          request: JsonRpcRequest
        ): Promise<InterceptorRequestResult> {
          order.push(`${this.name}-request`);
          return { type: "request", request };
        }

        async processResponse(
          response: JsonRpcResponse
        ): Promise<InterceptorResponseResult> {
          order.push(`${this.name}-response`);
          return { type: "response", response };
        }
      }

      const first = new OrderTrackingInterceptor("first");
      const second = new OrderTrackingInterceptor("second");
      const third = new OrderTrackingInterceptor("third");

      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 10,
        method: "test-order",
      };

      await processPipeline([first, second, third], echoTarget, request);

      expect(order).toEqual([
        "first-request",
        "second-request",
        "third-request",
        "third-response",
        "second-response",
        "first-response",
      ]);
    });
  });
});
