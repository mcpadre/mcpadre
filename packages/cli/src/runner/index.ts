// pattern: Functional Core

import {
  type ContainerMcpServerV1,
  type HttpMcpServerV1,
  isContainerServer,
  isHttpServer,
  isNodeServer,
  isPythonServer,
  isShellServer,
  type NodeMcpServerV1,
  type PythonMcpServerV1,
  type ShellMcpServerV1,
} from "../config/types/v1/server/index.js";

import { startContainerServer } from "./servers/container/startup.js";
import { startHttpServer } from "./servers/http/startup.js";
import { startNodeServer } from "./servers/node/startup.js";
import { startPythonServer } from "./servers/python/startup.js";
import { startShellServer } from "./servers/shell/startup.js";

import type { WorkspaceContext } from "../config/types/index.js";
import type { McpServerV1 } from "../config/types/v1/server/index.js";
import type { Logger } from "pino";

/**
 * Configuration required to run an MCP server
 */
export interface RunServerOptions {
  serverName: string;
  serverConfig: McpServerV1;
  context: WorkspaceContext;
  logger: Logger;
}

/**
 * Main entry point for running MCP servers.
 * Routes to appropriate server-specific startup handler based on server type.
 */
export async function runMcpServer(options: RunServerOptions): Promise<void> {
  const { serverConfig } = options;

  if (isPythonServer(serverConfig)) {
    return startPythonServer(
      options as RunServerOptions & { serverConfig: PythonMcpServerV1 }
    );
  } else if (isNodeServer(serverConfig)) {
    return startNodeServer(
      options as RunServerOptions & { serverConfig: NodeMcpServerV1 }
    );
  } else if (isContainerServer(serverConfig)) {
    return startContainerServer(
      options as RunServerOptions & { serverConfig: ContainerMcpServerV1 }
    );
  } else if (isShellServer(serverConfig)) {
    return startShellServer(
      options as RunServerOptions & { serverConfig: ShellMcpServerV1 }
    );
  } else if (isHttpServer(serverConfig)) {
    return startHttpServer(
      options as RunServerOptions & { serverConfig: HttpMcpServerV1 }
    );
  } else {
    // TypeScript should ensure this is unreachable
    const exhaustiveCheck: never = serverConfig;
    throw new Error(`Unknown server type: ${JSON.stringify(exhaustiveCheck)}`);
  }
}
