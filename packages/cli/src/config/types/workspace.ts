// pattern: Functional Core

import { join } from "node:path";

import { type SettingsProjectV1, type SettingsUserV1 } from "./v1/index.js";

export type WorkspaceType = "user" | "project";

interface WorkspaceContextBase {
  // The absolute path to the operational directory
  workspaceDir: string; // ~/.mcpadre for user, project root for project

  // The final, merged configuration
  mergedConfig: SettingsProjectV1;
}

export interface ProjectWorkspaceContext extends WorkspaceContextBase {
  workspaceType: "project";
  projectConfig: SettingsProjectV1;
  projectConfigPath: string; // Path to the loaded mcpadre.yaml
  userConfig: SettingsUserV1; // Optional user augmentation, null if not present
}

export interface UserWorkspaceContext extends WorkspaceContextBase {
  workspaceType: "user";
  userConfig: SettingsUserV1;
  userConfigPath: string; // User config is required in this context
  // NOTE: By design, user context CANNOT have projectConfig
}

export type WorkspaceContext = ProjectWorkspaceContext | UserWorkspaceContext;

// Helper functions for path resolution (same for both types!)
export function getServerPath(
  ctx: WorkspaceContext,
  serverName: string
): string {
  return join(ctx.workspaceDir, ".mcpadre", "servers", serverName);
}

export function getConfigPath(ctx: WorkspaceContext): string {
  return join(ctx.workspaceDir, "mcpadre.yaml");
}

export function getServerLogsPath(
  ctx: WorkspaceContext,
  serverName: string
): string {
  return join(ctx.workspaceDir, ".mcpadre", "servers", serverName, "logs");
}

export function getServerDataPath(
  ctx: WorkspaceContext,
  serverName: string
): string {
  return join(ctx.workspaceDir, ".mcpadre", "servers", serverName, "data");
}
