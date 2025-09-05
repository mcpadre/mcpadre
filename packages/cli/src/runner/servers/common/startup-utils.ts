// pattern: Functional Core
// Shared startup utilities for MCP server configuration and environment resolution

import {
  createSandboxConfig,
  resolveSandboxConfig,
} from "../../../utils/sandbox/index.js";
import { createDirectoryResolver } from "../../directory-resolver/index.js";
import { resolveEnvVars } from "../../env-resolver/index.js";

import type { EnvValue } from "../../../config/types/index.js";
import type { SandboxConfig } from "../../../utils/sandbox/index.js";
import type { FinalizedSandboxConfig } from "../../../utils/sandbox/index.js";
import type { DirectoryResolver } from "../../directory-resolver/index.js";
import type { PipelineTarget } from "../../pipeline/types.js";
import type { Logger } from "pino";

/**
 * Workspace options that affect server configuration
 */
export interface WorkspaceServerOptions {
  disableAllSandboxes?: boolean;
  extraAllowRead?: string[];
  extraAllowWrite?: string[];
}

/**
 * Result of environment setup for a server
 */
export interface ServerEnvironment {
  directoryResolver: DirectoryResolver;
  envStringMap: Record<string, string>;
}

/**
 * Set up common server environment including directory resolver and environment variables
 */
export async function setupServerEnvironment(options: {
  envConfig?: Record<string, EnvValue>;
  logger: Logger;
}): Promise<ServerEnvironment> {
  const { envConfig = {}, logger } = options;

  // Create directory resolver for variable resolution
  const directoryResolver = createDirectoryResolver();

  // Resolve environment variables
  const resolvedEnv = await resolveEnvVars({
    directoryResolver,
    parentEnv: process.env,
    envConfig,
    logger,
  });

  logger.debug(
    `Resolved ${Object.keys(resolvedEnv).length} environment variables`
  );

  // Convert resolved env vars to string map
  const envStringMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedEnv)) {
    envStringMap[key] = value as string;
  }

  return { directoryResolver, envStringMap };
}

/**
 * Resolve server sandbox configuration with workspace options
 */
export function resolveServerSandboxConfig(options: {
  sandboxConfig?: Partial<SandboxConfig>; // Base sandbox config from server definition
  directoryResolver: DirectoryResolver;
  workspaceOptions?: WorkspaceServerOptions;
  readPaths?: string[]; // Additional paths to allow read access
  readWritePaths?: string[]; // Additional paths to allow read+write access
  isUserMode?: boolean; // Whether running in user mode
  logger: Logger;
}): FinalizedSandboxConfig {
  const {
    sandboxConfig: baseSandboxConfig,
    directoryResolver,
    workspaceOptions,
    readPaths = [],
    readWritePaths = [],
    isUserMode,
    logger,
  } = options;

  // Create base sandbox config
  const baseSandbox = createSandboxConfig(
    baseSandboxConfig,
    isUserMode !== undefined ? { isUserMode } : undefined
  );

  // Add read paths to allowRead if provided
  const sandboxConfigWithRead =
    readPaths.length > 0
      ? {
          ...baseSandbox,
          allowRead: [...baseSandbox.allowRead, ...readPaths],
        }
      : baseSandbox;

  // Add readwrite paths to allowReadWrite if provided
  const sandboxConfigWithReadWrite =
    readWritePaths.length > 0
      ? {
          ...sandboxConfigWithRead,
          allowReadWrite: [
            ...sandboxConfigWithRead.allowReadWrite,
            ...readWritePaths,
          ],
        }
      : sandboxConfigWithRead;

  // Apply workspace options if provided
  const finalWorkspaceOptions = workspaceOptions
    ? {
        ...(workspaceOptions.disableAllSandboxes !== undefined && {
          disableAllSandboxes: workspaceOptions.disableAllSandboxes,
        }),
        ...(workspaceOptions.extraAllowRead !== undefined && {
          extraAllowRead: workspaceOptions.extraAllowRead as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        }),
        ...(workspaceOptions.extraAllowWrite !== undefined && {
          extraAllowWrite: workspaceOptions.extraAllowWrite as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        }),
      }
    : undefined;

  if (finalWorkspaceOptions) {
    logger.info(
      {
        disableAllSandboxes: finalWorkspaceOptions.disableAllSandboxes,
        extraAllowReadCount: finalWorkspaceOptions.extraAllowRead?.length ?? 0,
        extraAllowWriteCount:
          finalWorkspaceOptions.extraAllowWrite?.length ?? 0,
      },
      "Workspace sandbox options applied to server"
    );
  }

  // Resolve final sandbox configuration
  const sandboxConfig = resolveSandboxConfig({
    config: sandboxConfigWithReadWrite,
    directoryResolver,
    parentEnv: process.env,
    ...(isUserMode !== undefined && { isUserMode }),
    ...(finalWorkspaceOptions && { workspaceOptions: finalWorkspaceOptions }),
  });

  // Log final sandbox configuration
  logger.info(
    {
      enabled: sandboxConfig.enabled,
      networking: sandboxConfig.networking,
      allowReadCount: sandboxConfig.allowRead.length,
      allowReadWriteCount: sandboxConfig.allowReadWrite.length,
      allowReadList: sandboxConfig.allowRead,
      allowReadWriteList: sandboxConfig.allowReadWrite,
    },
    "Final sandbox configuration for server"
  );

  return sandboxConfig;
}

/**
 * Create session configuration for a server
 */
export interface ServerSessionConfig {
  target: PipelineTarget; // Pipeline target
  logger: Logger;
  onStop?: () => Promise<void>;
}

/**
 * Create common session configuration with cleanup handling
 */
export function createServerSessionConfig<
  TClient extends { stop(): Promise<void> },
>(options: {
  target: PipelineTarget;
  client: TClient;
  logger: Logger;
}): ServerSessionConfig {
  const { target, client, logger } = options;

  return {
    target,
    logger,
    onStop: async () => {
      await client.stop();
    },
  };
}
