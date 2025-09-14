// pattern: Functional Core
// Test helper utilities for creating valid WorkspaceContext objects

import type { SettingsProject, SettingsUser } from "../config/types/index.js";
import type {
  ProjectWorkspaceContext,
  UserWorkspaceContext,
} from "../config/types/workspace.js";

/**
 * Creates a minimal valid UserWorkspaceContext for testing
 */
export function createTestUserContext(
  overrides?: Partial<UserWorkspaceContext>
): UserWorkspaceContext {
  const workspaceDir = overrides?.workspaceDir ?? "/tmp/test-user";
  return {
    workspaceType: "user",
    workspaceDir,
    userConfigPath: `${workspaceDir}/mcpadre.yaml`,
    userConfig: {
      version: 1,
      mcpServers: {},
      hosts: {},
      options: {},
    },
    mergedConfig: {
      version: 1,
      mcpServers: {},
      hosts: {},
      options: {},
    },
    ...overrides,
  };
}

/**
 * Creates a minimal valid ProjectWorkspaceContext for testing
 */
export function createTestProjectContext(
  overrides?: Partial<ProjectWorkspaceContext>
): ProjectWorkspaceContext {
  const workspaceDir = overrides?.workspaceDir ?? "/tmp/test-project";
  return {
    workspaceType: "project",
    workspaceDir,
    projectConfigPath: `${workspaceDir}/mcpadre.yaml`,
    projectConfig: {
      version: 1,
      mcpServers: {},
      hosts: {},
      options: {},
    },
    userConfig: {
      version: 1,
      mcpServers: {},
      hosts: {},
      options: {},
    },
    mergedConfig: {
      version: 1,
      mcpServers: {},
      hosts: {},
      options: {},
    },
    ...overrides,
  };
}

/**
 * Creates a minimal valid SettingsProjectV1 config for testing
 */
export function createTestProjectConfig(
  overrides?: Partial<SettingsProject>
): SettingsProject {
  return {
    version: 1,
    mcpServers: {},
    hosts: {},
    options: {},
    ...overrides,
  };
}

/**
 * Creates a minimal valid SettingsUserV1 config for testing
 */
export function createTestUserConfig(
  overrides?: Partial<SettingsUser>
): SettingsUser {
  return {
    version: 1,
    mcpServers: {},
    hosts: {},
    options: {},
    ...overrides,
  };
}
