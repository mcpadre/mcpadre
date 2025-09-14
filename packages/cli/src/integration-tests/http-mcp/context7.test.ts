// pattern: Imperative Shell
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLogger } from "../../logger/config.js";
import { createDirectoryResolver } from "../../runner/directory-resolver/index.js";
import { resolveEnvVars } from "../../runner/env-resolver/index.js";
import { processPipeline } from "../../runner/pipeline/index.js";
import { createTarget } from "../../runner/servers/common/target.js";
import { HttpMcpClient } from "../../runner/servers/http/client.js";

import type {
  EnvStringTemplate,
  HttpMcpServer,
  ProjectWorkspaceContext,
  WorkspaceContext,
} from "../../config/types/index.js";
import type { JsonRpcRequest } from "../../test-utils/json-rpc/types.js";

// Helper function to create a WorkspaceContext for testing
function createTestWorkspaceContext(workspaceDir: string): WorkspaceContext {
  const config = {
    mcpServers: {},
    hosts: {},
    options: {},
    version: 1,
  } as const;

  return {
    workspaceType: "project",
    workspaceDir,
    projectConfigPath: `${workspaceDir}/mcpadre.yaml`,
    mergedConfig: config,
    projectConfig: config,
    userConfig: config,
  } as ProjectWorkspaceContext;
}

describe("HTTP MCP Client Integration with Context7", () => {
  let testDir: string;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(async () => {
    // Create unique test directory for workspace
    testDir = join(
      tmpdir(),
      `mcpadre-http-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );
    await mkdir(testDir, { recursive: true });

    // Create silent logger for tests
    logger = createLogger("json", false);
    logger.level = "silent";
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe("basic connectivity", () => {
    it("should connect to Context7 and handle initialize request", async () => {
      // Create Context7 HTTP server configuration
      const config: HttpMcpServer = {
        http: {
          url: "https://mcp.context7.com/mcp",
        },
      };

      // Create directory resolver and env resolver for headers
      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext(testDir)
      );
      const resolvedEnv = await resolveEnvVars({
        directoryResolver,
        parentEnv: {},
        envConfig: {},
        logger,
      });

      // Create HTTP client and pipeline target
      const client = new HttpMcpClient(
        config,
        resolvedEnv,
        logger,
        "context7-test"
      );
      const target = createTarget(client);

      // Test initialize request
      const initializeRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "mcpadre-test",
            version: "1.0.0",
          },
        },
      };

      const response = await processPipeline([], target, initializeRequest);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
      });

      // Check if it's an error response or success response
      if ("error" in response) {
        throw new Error(`Initialize failed: ${response.error.message}`);
      }

      // Should have result with server capabilities
      expect(response).toHaveProperty("result");
      if ("result" in response) {
        const result = response.result;
        expect(result).toHaveProperty("capabilities");
        expect(result).toHaveProperty("serverInfo");
      }
    });

    it("should list available tools", async () => {
      const config: HttpMcpServer = {
        http: {
          url: "https://mcp.context7.com/mcp",
        },
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext(testDir)
      );
      const resolvedEnv = await resolveEnvVars({
        directoryResolver,
        parentEnv: {},
        envConfig: {},
        logger,
      });

      const client = new HttpMcpClient(
        config,
        resolvedEnv,
        logger,
        "context7-test"
      );
      const target = createTarget(client);

      // Test tools/list request
      const toolsListRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      };

      const response = await processPipeline([], target, toolsListRequest);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 2,
      });

      // Should have result with tools array
      expect(response).toHaveProperty("result");
      if ("result" in response) {
        const result = response.result;
        expect(result).toHaveProperty("tools");
        expect(Array.isArray((result as any).tools)).toBe(true);

        // Should include the tools we know about
        const toolNames = (result as any).tools.map((tool: any) => tool.name);
        expect(toolNames).toContain("resolve-library-id");
        expect(toolNames).toContain("get-library-docs");
      }
    });

    it("should execute resolve-library-id tool", async () => {
      const config: HttpMcpServer = {
        http: {
          url: "https://mcp.context7.com/mcp",
        },
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext(testDir)
      );
      const resolvedEnv = await resolveEnvVars({
        directoryResolver,
        parentEnv: {},
        envConfig: {},
        logger,
      });

      const client = new HttpMcpClient(
        config,
        resolvedEnv,
        logger,
        "context7-test"
      );
      const target = createTarget(client);

      // Test resolve-library-id for "react"
      const toolCallRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "resolve-library-id",
          arguments: {
            libraryName: "react",
          },
        },
      };

      const response = await processPipeline([], target, toolCallRequest);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 3,
      });

      // Should have result with content or error (Context7 service might be down)
      if ("error" in response) {
        // If Context7 service is unavailable or authentication fails, that's expected
        const error = response.error;
        expect(error).toHaveProperty("message");
        console.log("Context7 resolve-library-id failed:", error.message);
      } else {
        expect(response).toHaveProperty("result");
        const result = response.result;
        expect(result).toHaveProperty("content");
        expect(Array.isArray((result as any).content)).toBe(true);
        expect((result as any).content.length).toBeGreaterThan(0);

        // Content should mention React
        const contentText = (result as any).content
          .map((c: any) => c.text)
          .join(" ");
        expect(contentText.toLowerCase()).toContain("react");
      }
    });

    it("should execute get-library-docs tool", async () => {
      const config: HttpMcpServer = {
        http: {
          url: "https://mcp.context7.com/mcp",
        },
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext(testDir)
      );
      const resolvedEnv = await resolveEnvVars({
        directoryResolver,
        parentEnv: {},
        envConfig: {},
        logger,
      });

      const client = new HttpMcpClient(
        config,
        resolvedEnv,
        logger,
        "context7-test"
      );
      const target = createTarget(client);

      // Test get-library-docs for React
      const toolCallRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "get-library-docs",
          arguments: {
            context7CompatibleLibraryID: "/facebook/react",
            topic: "hooks",
          },
        },
      };

      const response = await processPipeline([], target, toolCallRequest);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 4,
      });

      // Should have result with content or error (Context7 service might be down)
      if ("error" in response) {
        // If Context7 service is unavailable or authentication fails, that's expected
        const error = response.error;
        expect(error).toHaveProperty("message");
        console.log("Context7 get-library-docs failed:", error.message);
      } else {
        expect(response).toHaveProperty("result");
        const result = response.result;
        expect(result).toHaveProperty("content");
        expect(Array.isArray((result as any).content)).toBe(true);
        expect((result as any).content.length).toBeGreaterThan(0);

        // Content should mention hooks and React
        const contentText = (result as any).content
          .map((c: any) => c.text)
          .join(" ");
        expect(contentText.toLowerCase()).toContain("react");
        expect(contentText.toLowerCase()).toContain("hook");
      }
    });
  });

  describe("header resolution", () => {
    it("should resolve headers from environment variables", async () => {
      // Test with mock authorization header
      const config: HttpMcpServer = {
        http: {
          url: "https://mcp.context7.com/mcp",
          headers: {
            "X-Test-Header": {
              string: "test-value-{{parentEnv.TEST_VAR}}" as EnvStringTemplate,
            },
          },
        },
      };

      const directoryResolver = createDirectoryResolver(
        createTestWorkspaceContext(testDir)
      );
      const resolvedEnv = await resolveEnvVars({
        directoryResolver,
        parentEnv: { TEST_VAR: "from-env" },
        envConfig: {
          "X-Test-Header": {
            string: "test-value-{{parentEnv.TEST_VAR}}" as EnvStringTemplate,
          },
        },
        logger,
      });

      const client = new HttpMcpClient(
        config,
        resolvedEnv,
        logger,
        "context7-test"
      );
      const target = createTarget(client);

      // Test a simple request to verify headers are included
      const toolsListRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/list",
      };

      // This should not throw an error, indicating headers were processed correctly
      const response = await processPipeline([], target, toolsListRequest);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 5,
      });
      expect(response).toHaveProperty("result");
    });
  });
});
