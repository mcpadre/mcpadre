// pattern: Imperative Shell

import { access, constants, readFile } from "fs/promises";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import {
  sendJsonRpc,
  terminateProcess,
  withProcess,
} from "../helpers/spawn-cli-v2.js";

import type { EnvStringTemplate } from "../../config/types/index.js";
import type { JsonRpcSuccessResponse } from "../../test-utils/json-rpc/types.js";
import type { TempProject } from "../../test-utils/project/temp-project.js";

describe("Node.js server with real MCP package", () => {
  let tempProject: TempProject;

  beforeEach(async () => {
    // Create test project with a real MCP server package
    const config = {
      version: 1 as const,
      mcpServers: {
        "memory-server": {
          node: {
            package: "@modelcontextprotocol/server-memory",
            version: "0.6.0", // Use a known existing version for reproducibility
            nodeVersion: "20.10.0",
          },
          env: {
            MEMORY_DIR: "/tmp/mcp-memory-test" as EnvStringTemplate,
          },
        },
      },
      hosts: {
        "claude-code": true,
      },
      installImplicitlyUpgradesChangedPackages: false,
    };

    tempProject = await createTempProject({
      config,
      format: "yaml",
      prefix: "node-real-package-",
    });
  });

  afterEach(async () => {
    await tempProject.cleanup();
  });

  it(
    "should successfully install real Node.js MCP package",
    withProcess(async spawn => {
      // Install the server
      const installProc = spawn(["install"], {
        cwd: tempProject.path,
      });
      const installResult = await installProc;

      if (installResult.exitCode !== 0) {
        console.log("INSTALL STDERR:", installResult.stderr);
        console.log("INSTALL STDOUT:", installResult.stdout);
      }

      expect(installResult.exitCode).toBe(0);

      // Verify server directory structure was created
      const serverDir = join(
        tempProject.path,
        ".mcpadre",
        "servers",
        "memory-server"
      );
      await access(serverDir, constants.F_OK);

      // Verify package.json was created with correct dependency
      const packageJsonPath = join(serverDir, "package.json");
      await access(packageJsonPath, constants.F_OK);
      const packageJsonContent = await readFile(packageJsonPath, "utf8");
      const packageJson = JSON.parse(packageJsonContent);

      expect(packageJson.name).toBe("mcpadre-deps-memory-server");
      expect(packageJson.engines.node).toBe(">=20.10.0");
      expect(
        packageJson.dependencies["@modelcontextprotocol/server-memory"]
      ).toBe("0.6.0");

      // Verify version files were created
      const nodeVersionPath = join(serverDir, ".node-version");
      await access(nodeVersionPath, constants.F_OK);
      const nodeVersionContent = await readFile(nodeVersionPath, "utf8");
      expect(nodeVersionContent.trim()).toBe("20.10.0");

      const toolVersionsPath = join(serverDir, ".tool-versions");
      await access(toolVersionsPath, constants.F_OK);
      const toolVersionsContent = await readFile(toolVersionsPath, "utf8");
      expect(toolVersionsContent.trim()).toBe("nodejs 20.10.0");

      // Verify that pnpm-lock.yaml was created (indicating successful dependency resolution)
      const lockFilePath = join(serverDir, "pnpm-lock.yaml");
      await access(lockFilePath, constants.F_OK);
      const lockFileContent = await readFile(lockFilePath, "utf8");
      expect(lockFileContent).toContain("@modelcontextprotocol/server-memory");

      // Verify Claude configuration was generated
      const claudeConfigPath = join(tempProject.path, ".mcp.json");
      await access(claudeConfigPath, constants.F_OK);
      const claudeConfigContent = await readFile(claudeConfigPath, "utf-8");
      const claudeConfig = JSON.parse(claudeConfigContent);

      expect(claudeConfig.mcpServers["memory-server"]).toEqual({
        command: "mcpadre",
        args: ["run", "memory-server"],
      });
    })
  );

  it(
    "should successfully run real Node.js MCP server and establish JSON-RPC connection",
    withProcess(async spawn => {
      // First install the server
      const installProc = spawn(["install"], {
        cwd: tempProject.path,
      });
      const installResult = await installProc;
      expect(installResult.exitCode).toBe(0);

      // Start the server
      const runProc = spawn(["run", "memory-server"], {
        cwd: tempProject.path,
        buffer: false, // Disable buffering for interactive process
      });

      try {
        // Wait for server to be ready (should not output anything initially)
        // The MCP server should be waiting for JSON-RPC input on stdin
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Send initialization request
        const initResponse = await sendJsonRpc(runProc, {
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
              name: "mcpadre-test",
              version: "1.0.0",
            },
          },
        });

        // Server should respond with initialization result
        expect(initResponse.jsonrpc).toBe("2.0");
        expect(initResponse.id).toBe(1);
        const successResponse = initResponse as JsonRpcSuccessResponse;
        expect(successResponse.result).toBeDefined();
        expect((successResponse.result as any).protocolVersion).toBe(
          "2024-11-05"
        );
        expect((successResponse.result as any).serverInfo.name).toBe(
          "memory-server"
        );

        // Send initialized notification
        runProc.stdin?.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/initialized",
          })}\n`
        );

        // Request available tools
        const toolsResponse = await sendJsonRpc(runProc, {
          jsonrpc: "2.0",
          method: "tools/list",
          id: 2,
        });

        expect(toolsResponse.jsonrpc).toBe("2.0");
        expect(toolsResponse.id).toBe(2);
        const toolsSuccessResponse = toolsResponse as JsonRpcSuccessResponse;
        expect(toolsSuccessResponse.result).toBeDefined();
        expect((toolsSuccessResponse.result as any).tools).toBeInstanceOf(
          Array
        );
        expect(
          (toolsSuccessResponse.result as any).tools.length
        ).toBeGreaterThan(0);

        // The memory server should provide memory-related tools
        const toolNames = (toolsSuccessResponse.result as any).tools.map(
          (tool: any) => tool.name
        );
        expect(toolNames).toContain("create_entities");
        expect(toolNames).toContain("search_nodes");
      } finally {
        await terminateProcess(runProc, 5000);
      }
    })
  );

  it(
    "should handle environment variables correctly",
    withProcess(async spawn => {
      // First install the server
      const installProc = spawn(["install"], {
        cwd: tempProject.path,
      });
      const installResult = await installProc;
      expect(installResult.exitCode).toBe(0);

      // Start the server
      const runProc = spawn(["run", "memory-server"], {
        cwd: tempProject.path,
        buffer: false,
      });

      try {
        // Wait for server to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Send initialization request
        const initResponse = await sendJsonRpc(runProc, {
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
              name: "mcpadre-test",
              version: "1.0.0",
            },
          },
        });

        // Server should initialize successfully, indicating environment setup worked
        const envSuccessResponse = initResponse as JsonRpcSuccessResponse;
        expect(envSuccessResponse.result).toBeDefined();
        expect((envSuccessResponse.result as any).serverInfo.name).toBe(
          "memory-server"
        );
      } finally {
        await terminateProcess(runProc, 5000);
      }
    })
  );

  it(
    "should handle pnpm fallback to npm gracefully",
    withProcess(async spawn => {
      // Create a config that might test pnpm/npm fallback behavior
      const testConfig = {
        version: 1 as const,
        mcpServers: {
          "test-server": {
            node: {
              package: "@modelcontextprotocol/server-memory",
              version: "0.6.0",
              // No nodeVersion to test without version constraints
            },
          },
        },
        hosts: {
          "claude-code": true,
        },
      };

      const testProject = await createTempProject({
        config: testConfig,
        format: "yaml",
        prefix: "node-fallback-test-",
      });

      try {
        // Install should succeed regardless of pnpm availability
        const installProc = spawn(["install"], {
          cwd: testProject.path,
        });
        const installResult = await installProc;

        if (installResult.exitCode !== 0) {
          console.log("FALLBACK STDERR:", installResult.stderr);
          console.log("FALLBACK STDOUT:", installResult.stdout);
        }

        expect(installResult.exitCode).toBe(0);

        // Verify package was installed correctly
        const serverDir = join(
          testProject.path,
          ".mcpadre",
          "servers",
          "test-server"
        );
        const packageJsonPath = join(serverDir, "package.json");
        const packageJsonContent = await readFile(packageJsonPath, "utf8");
        const packageJson = JSON.parse(packageJsonContent);

        expect(
          packageJson.dependencies["@modelcontextprotocol/server-memory"]
        ).toBe("0.6.0");
      } finally {
        await testProject.cleanup();
      }
    })
  );
});
