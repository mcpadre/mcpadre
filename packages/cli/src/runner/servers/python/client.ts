// pattern: Functional Core

import { join } from "path";

import { applyTemplate } from "../../../utils/string-templating/index.js";
import { BaseMcpClient } from "../common/base-client.js";
import { ShellMcpClient } from "../shell/client.js";

import type { PythonOptionsV1 } from "../../../config/types/v1/server/index.js";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../../test-utils/json-rpc/types.js";
import type { FinalizedSandboxConfig } from "../../../utils/sandbox/index.js";
import type { DirectoryResolver } from "../../directory-resolver/index.js";
import type { ResolvedPath } from "../../types/index.js";
import type { Logger } from "pino";

/**
 * Python MCP client that uses uv to run Python MCP servers in isolated environments.
 * Composes with ShellMcpClient to handle the actual process management and JSON-RPC communication.
 */
export class PythonMcpClient extends BaseMcpClient {
  private shellClient: ShellMcpClient;

  constructor(
    private readonly pythonConfig: PythonOptionsV1,
    env: Record<string, string>,
    private readonly directoryResolver: DirectoryResolver,
    serverName: string,
    sandboxConfig: FinalizedSandboxConfig,
    logger: Logger
  ) {
    super(logger, serverName);

    // Construct the uv run command for the Python server
    const serverDir = join(
      directoryResolver.workspace,
      ".mcpadre",
      "servers",
      serverName
    );
    const command = this.buildUvRunCommand();

    // Create the shell client with the uv command
    this.shellClient = new ShellMcpClient(
      command,
      env,
      serverDir as ResolvedPath,
      sandboxConfig,
      logger.child({ component: "python-shell-client" }),
      serverName
    );
  }

  protected getClientType(): string {
    return "python-client";
  }

  /**
   * Build the uv run command parts for the Python MCP server
   */
  private buildUvRunCommand(): {
    command: string;
    args: string[];
  } {
    // Use the command specified in config, or default to the package name
    const pythonCommand =
      this.pythonConfig.command ?? this.pythonConfig.package;

    // Render template if the command contains template variables
    const resolvedCommand = applyTemplate<string, string>(pythonCommand, {
      dirs: this.directoryResolver,
      parentEnv: process.env,
    });

    return {
      command: "uv",
      args: ["run", "--no-env-file", "--", ...resolvedCommand.split(" ")],
    };
  }

  /**
   * Send a JSON-RPC request to the Python MCP server
   */
  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    return await this.shellClient.send(request);
  }

  /**
   * Stop the Python MCP server process
   */
  async stop(): Promise<void> {
    await this.shellClient.stop();
  }
}
