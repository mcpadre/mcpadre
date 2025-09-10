// pattern: Functional Core

import { shouldLogMcpTraffic } from "../config-resolver/mcp-traffic.js";
import { McpTrafficLogger } from "../pipeline/interceptors/mcp-traffic-logger.js";
import {
  createLogFilePath,
  createServerDirectory,
} from "../server-directory/index.js";

import { InteractiveSessionManager, type SessionConfig } from "./index.js";

import type { WorkspaceContext } from "../../config/types/index.js";
import type { McpServerV1 } from "../../config/types/v1/server/index.js";
import type { createDirectoryResolver } from "../directory-resolver/index.js";

/**
 * Configuration required for session setup with interceptors
 */
export interface CreateSessionOptions {
  sessionConfig: SessionConfig;
  serverConfig: McpServerV1;
  projectConfig: WorkspaceContext["mergedConfig"];
  serverName: string;
  directoryResolver: ReturnType<typeof createDirectoryResolver>;
  logger: typeof import("../../cli/_deps.js").CLI_LOGGER;
  context: WorkspaceContext;
}

/**
 * Creates an InteractiveSessionManager with appropriate interceptors based on configuration.
 * Handles MCP traffic logging setup if enabled.
 */
export async function createSessionWithInterceptors(
  options: CreateSessionOptions
): Promise<InteractiveSessionManager> {
  const {
    sessionConfig,
    serverConfig,
    projectConfig,
    serverName,
    logger,
    context,
  } = options;

  // Check if MCP traffic logging should be enabled
  const loggingEnabled = shouldLogMcpTraffic(serverConfig, projectConfig);
  let logFilePath: string | undefined;

  if (loggingEnabled) {
    logger.debug("MCP traffic logging enabled, setting up log file");
    try {
      const logsDir = await createServerDirectory(context, serverName);
      logFilePath = createLogFilePath(serverName, logsDir);
      logger.debug({ logFilePath }, "Created log file path for MCP traffic");
    } catch (error) {
      logger.warn(
        { error },
        "Failed to create server directory for logging, continuing without logging"
      );
    }
  }

  // Set up interceptors array, with logging interceptor first if enabled
  const interceptors = [];
  if (logFilePath) {
    interceptors.push(new McpTrafficLogger(logFilePath));
    logger.debug("Added MCP traffic logging interceptor as first interceptor");
  }

  return new InteractiveSessionManager(sessionConfig, interceptors);
}
