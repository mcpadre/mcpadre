// pattern: Functional Core

import { resolveEnvVars } from "../../env-resolver/index.js";
import { createSessionWithInterceptors } from "../../session/startup.js";
import { setupServerEnvironment } from "../common/startup-utils.js";
import { createTarget } from "../common/target.js";

import { HttpMcpClient } from "./client.js";

import type { HttpMcpServerV1 } from "../../../config/types/v1/server/index.js";
import type { RunServerOptions } from "../../index.js";

/**
 * Configuration specific to HTTP server startup
 */
interface HttpStartupConfig extends RunServerOptions {
  serverConfig: HttpMcpServerV1;
}

/**
 * Starts an HTTP MCP server with all necessary setup and configuration
 */
export async function startHttpServer(
  options: HttpStartupConfig
): Promise<void> {
  const { serverName, serverConfig, context, logger } = options;
  const httpServer = serverConfig;
  const projectConfig = context.mergedConfig;

  // Set up common server environment (HTTP uses headers not env vars, but we still need directory resolver)
  const { directoryResolver } = await setupServerEnvironment({
    context,
    envConfig: {}, // HTTP servers don't use environment variables
    logger,
  });

  // Create child logger for server-specific logging
  const serverLogger = logger.child({ serverName });

  // Process header variables using resolveEnvVars() (HTTP-specific)
  const resolvedHeaders = await resolveEnvVars({
    directoryResolver,
    parentEnv: process.env,
    envConfig: httpServer.http.headers ?? {},
    logger,
  });

  logger.debug(
    `Resolved ${Object.keys(resolvedHeaders).length} header variables`
  );

  // Create HTTP client and pipeline target
  const client = new HttpMcpClient(
    httpServer,
    resolvedHeaders,
    logger,
    serverName
  );
  const target = createTarget(client);

  const connectionInfo = `${serverName} at ${httpServer.http.url}`;

  // Set up session (HTTP clients typically don't need cleanup)
  const sessionConfig = {
    target,
    logger: serverLogger,
  };

  // Create and start session with interceptors
  const sessionManager = await createSessionWithInterceptors({
    sessionConfig,
    serverConfig,
    projectConfig,
    serverName,
    directoryResolver,
    logger,
    context,
  });

  logger.info(`Connected to ${connectionInfo}`);

  // Start the session and handle graceful shutdown
  await sessionManager.start();
}
