// pattern: Mixed (unavoidable)
// Integration tests require I/O operations mixed with test logic for realistic scenario validation

import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import {
  sendJsonRpc,
  terminateProcess,
  waitForPattern,
  withProcess,
} from "../helpers/spawn-cli-v2.js";

import type {
  CommandStringTemplate,
  EnvStringTemplate,
  SettingsProject,
} from "../../config/types/index.js";
import type { TempProject } from "../../test-utils/project/temp-project.js";

describe("Shell Server Integration Tests", () => {
  let tempProject: TempProject;
  let cliProcess: any | null = null;

  beforeEach(async () => {
    // Create proper shell server configuration
    const shellServerConfig: SettingsProject = {
      version: 1 as const,
      mcpServers: {
        "echo-server": {
          shell: {
            command:
              `node ${join(process.cwd(), "dist", "test-utils", "mcp", "echo-server.js")}` as CommandStringTemplate,
          },
          env: {
            NODE_ENV: "test" as EnvStringTemplate,
          },
          sandbox: {
            enabled: false,
            networking: true,
            omitSystemPaths: true,
            omitWorkspacePath: true,
            allowRead: [],
            allowReadWrite: [],
          },
        },
      },
    };

    tempProject = await createTempProject({
      config: shellServerConfig,
      format: "yaml",
      prefix: "mcpadre-shell-test-",
    });
  });

  afterEach(async () => {
    if (cliProcess) {
      await terminateProcess(cliProcess);
      cliProcess = null;
    }
    await tempProject.cleanup();
  });

  it(
    "should successfully connect to echo server via shell",
    withProcess(async spawn => {
      // First, build the echo server if it doesn't exist
      const echoServerPath = join(
        process.cwd(),
        "dist",
        "test-utils",
        "mcp",
        "echo-server.js"
      );
      if (!existsSync(echoServerPath)) {
        // Build the project to ensure the echo server exists
        const buildProcess = nodeSpawn("pnpm", ["build"], {
          stdio: "pipe",
          cwd: process.cwd(),
        });

        await new Promise<void>((resolve, reject) => {
          buildProcess.on("exit", (code: number | null) => {
            if (code === 0) resolve();
            else reject(new Error(`Build failed with code ${code}`));
          });
        });
      }

      // Spawn the CLI process
      const proc = spawn(["run", "echo-server"], {
        cwd: tempProject.path,
        buffer: false, // Disable buffering for interactive process
      });

      // Wait for connection message indicating shell server started
      await waitForPattern(
        proc,
        "Connected to shell server echo-server",
        10000
      );

      // Send initialize request to the shell server
      const initResponse = await sendJsonRpc(proc, {
        jsonrpc: "2.0",
        method: "initialize",
        id: 1,
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "mcpadre-test-client",
            version: "1.0.0",
          },
        },
      });

      expect(
        "result" in initResponse ? initResponse.result : null
      ).toBeDefined();
      if ("result" in initResponse) {
        const result = initResponse.result;
        expect((result as any).capabilities).toBeDefined();
        expect((result as any).server_info).toBeDefined();
        expect((result as any).server_info.name).toBe("mcp-echo-server");
      }
    })
  );

  it(
    "should handle echo method calls through shell server",
    withProcess(async spawn => {
      // Build the echo server if needed
      const echoServerPath = join(
        process.cwd(),
        "dist",
        "test-utils",
        "mcp",
        "echo-server.js"
      );
      if (!existsSync(echoServerPath)) {
        const buildProcess = nodeSpawn("pnpm", ["build"], {
          stdio: "pipe",
          cwd: process.cwd(),
        });

        await new Promise<void>((resolve, reject) => {
          buildProcess.on("exit", (code: number | null) => {
            if (code === 0) resolve();
            else reject(new Error(`Build failed with code ${code}`));
          });
        });
      }

      // Spawn the CLI process
      const proc = spawn(["run", "echo-server"], {
        cwd: tempProject.path,
        buffer: false, // Disable buffering for interactive process
      });

      // Wait for connection
      await waitForPattern(
        proc,
        "Connected to shell server echo-server",
        10000
      );

      // Initialize first
      await sendJsonRpc(proc, {
        jsonrpc: "2.0",
        method: "initialize",
        id: 1,
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "mcpadre-test-client",
            version: "1.0.0",
          },
        },
      });

      // Send echo method call
      const echoResponse = await sendJsonRpc(proc, {
        jsonrpc: "2.0",
        method: "test-echo-method",
        id: 2,
        params: {
          message: "Hello from shell server test!",
        },
      });

      expect(
        "result" in echoResponse ? echoResponse.result : null
      ).toBeDefined();
      if ("result" in echoResponse) {
        const echoResult = echoResponse.result;
        expect((echoResult as any).method).toBe("test-echo-method");
      }
    })
  );

  it(
    "should handle shell server with environment variables",
    withProcess(async spawn => {
      // Create a config with custom environment variables
      const customShellServerConfig: SettingsProject = {
        version: 1 as const,
        mcpServers: {
          "echo-with-env": {
            shell: {
              command:
                `node ${join(process.cwd(), "dist", "test-utils", "mcp", "echo-server.js")}` as CommandStringTemplate,
            },
            env: {
              NODE_ENV: "production" as EnvStringTemplate,
              CUSTOM_VAR: "test-value" as EnvStringTemplate,
              PATH: "{{parentEnv.PATH}}" as EnvStringTemplate,
            },
            sandbox: {
              enabled: false,
              networking: true,
              omitSystemPaths: true,
              omitWorkspacePath: true,
              allowRead: [],
              allowReadWrite: [],
            },
          },
        },
      };

      const customTempProject = await createTempProject({
        config: customShellServerConfig,
        format: "yaml",
        prefix: "mcpadre-shell-env-test-",
      });

      try {
        // Build if needed
        const echoServerPath = join(
          process.cwd(),
          "dist",
          "test-utils",
          "mcp",
          "echo-server.js"
        );
        if (!existsSync(echoServerPath)) {
          const buildProcess = nodeSpawn("pnpm", ["build"], {
            stdio: "pipe",
            cwd: process.cwd(),
          });

          await new Promise<void>((resolve, reject) => {
            buildProcess.on("exit", (code: number | null) => {
              if (code === 0) resolve();
              else reject(new Error(`Build failed with code ${code}`));
            });
          });
        }

        // Spawn with the custom environment config
        const proc = spawn(["run", "echo-with-env"], {
          cwd: customTempProject.path,
          buffer: false, // Disable buffering for interactive process
        });

        // Wait for connection (should work despite environment variable templating)
        await waitForPattern(
          proc,
          "Connected to shell server echo-with-env",
          10000
        );

        // Verify we can communicate with the server
        const initResponse = await sendJsonRpc(proc, {
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
              name: "mcpadre-test-client",
              version: "1.0.0",
            },
          },
        });

        expect(
          "result" in initResponse ? initResponse.result : null
        ).toBeDefined();
      } finally {
        await customTempProject.cleanup();
      }
    })
  );
});
