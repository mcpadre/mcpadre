// pattern: Functional Core

import { shouldRecordMcpTraffic } from "../config-resolver/mcp-traffic-recording";
import { McpTrafficRecorder } from "../pipeline/interceptors/mcp-traffic-recorder";
import {
  createRecordingFilePath,
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
 * Handles MCP traffic recording setup if enabled.
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

  // Check if MCP traffic recording should be enabled
  const recordingEnabled = shouldRecordMcpTraffic(serverConfig, projectConfig);
  let recordingFilePath: string | undefined;

  if (recordingEnabled) {
    logger.debug("MCP traffic recording enabled, setting up recording file");
    try {
      const recordingDir = await createServerDirectory(context, serverName);
      recordingFilePath = createRecordingFilePath(serverName, recordingDir);
      logger.debug(
        { recordingFilePath },
        "Created recording file path for MCP traffic"
      );
    } catch (error) {
      logger.warn(
        { error },
        "Failed to create server directory for recording, continuing without recording"
      );
    }
  }

  // Set up interceptors array, with recording interceptor first if enabled
  const interceptors = [];
  if (recordingFilePath) {
    interceptors.push(new McpTrafficRecorder(recordingFilePath));
    logger.debug(
      "Added MCP traffic recording interceptor as first interceptor"
    );
  }

  return new InteractiveSessionManager(sessionConfig, interceptors);
}
