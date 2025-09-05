// pattern: Functional Core

import { join } from "path";

import { applyTemplate } from "../../../utils/string-templating/index.js";
import { BaseMcpClient } from "../common/base-client.js";
import { ShellMcpClient } from "../shell/client.js";

import type { NodeOptionsV1 } from "../../../config/types/v1/server/index.js";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../../test-utils/json-rpc/types.js";
import type { FinalizedSandboxConfig } from "../../../utils/sandbox/index.js";
import type { DirectoryResolver } from "../../directory-resolver/index.js";
import type { ResolvedPath } from "../../types/index.js";
import type { Logger } from "pino";

/**
 * Node.js MCP client that uses npm/pnpm to run Node.js MCP servers in isolated environments.
 * Composes with ShellMcpClient to handle the actual process management and JSON-RPC communication.
 */
export class NodeMcpClient extends BaseMcpClient {
  private shellClient: ShellMcpClient;

  constructor(
    private readonly nodeConfig: NodeOptionsV1,
    env: Record<string, string>,
    private readonly directoryResolver: DirectoryResolver,
    serverName: string,
    sandboxConfig: FinalizedSandboxConfig,
    logger: Logger
  ) {
    super(logger, serverName);

    // Construct the Node.js command for the server
    const serverDir = join(
      directoryResolver.workspace,
      ".mcpadre",
      "servers",
      serverName
    );
    const command = this.buildNodeCommand();

    // Create the shell client with the node command
    this.shellClient = new ShellMcpClient(
      command,
      env,
      serverDir as ResolvedPath,
      sandboxConfig,
      logger.child({ component: "node-shell-client" }),
      serverName
    );
  }

  protected getClientType(): string {
    return "node-client";
  }

  /**
   * Build the Node.js command parts for the MCP server
   */
  private buildNodeCommand(): {
    command: string;
    args: string[];
  } {
    const argsString = this.nodeConfig.args ?? "";
    const resolvedArgs = argsString
      ? applyTemplate<string, string>(argsString, {
          dirs: this.directoryResolver,
          parentEnv: process.env,
        })
          .split(" ")
          .filter(Boolean)
      : [];

    if (this.nodeConfig.bin) {
      // With bin: node ./node_modules/.bin/${binName} ${renderedArgsString}
      return {
        command: "node",
        args: [`./node_modules/.bin/${this.nodeConfig.bin}`, ...resolvedArgs],
      };
    }

    // Without bin: npm exec ${packagename} -- ${renderedArgsString}
    return {
      command: "npm",
      args: ["exec", this.nodeConfig.package, "--", ...resolvedArgs],
    };
  }

  /**
   * Send a JSON-RPC request to the Node.js MCP server
   */
  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    return await this.shellClient.send(request);
  }

  /**
   * Stop the Node.js MCP server process
   */
  async stop(): Promise<void> {
    await this.shellClient.stop();
  }
}
