// pattern: Functional Core

import type {
  EnvValue,
  SettingsProject,
  SettingsUser,
} from "../types/index.js";

/**
 * Result of merging user and project configurations
 */
export interface MergedConfig extends SettingsProject {
  /** Flag indicating if user config was found and merged */
  hasUserConfig: boolean;
  /** Original user config (if found) for reference */
  userConfig?: SettingsUser;
}

/**
 * Merges user configuration into project configuration with proper inheritance rules:
 *
 * 1. Environment Variables:
 *    - User env vars are inherited by project servers
 *    - Project servers can override user env vars
 *    - User env vars don't leak between different projects
 *
 * 2. Host Settings:
 *    - User true/false values override project settings
 *    - Undefined user values fall back to project settings
 *
 * 3. MCP Servers:
 *    - Only project mcpServers are included (user servers run separately with --user flag)
 *
 * 4. Options:
 *    - Project options take precedence over user options
 *
 * @param userConfig User configuration (can be null if not found)
 * @param projectConfig Project configuration
 * @returns Merged configuration with inheritance applied
 */
export function mergeUserProjectConfig(
  userConfig: SettingsUser | null,
  projectConfig: SettingsProject
): MergedConfig {
  if (!userConfig) {
    // No user config - return project config as-is
    return {
      ...projectConfig,
      hasUserConfig: false,
    };
  }

  // Merge environment variables: user env vars as base, project can override
  const mergedEnvVars = mergeEnvironmentVariables(userConfig, projectConfig);

  // Merge host settings: user true/false overrides project, undefined uses project
  const mergedHosts = mergeHostSettings(userConfig, projectConfig);

  // Project options take precedence, but inherit from user where not specified
  const mergedOptions = {
    ...(userConfig.options ?? {}),
    ...(projectConfig.options ?? {}),
  };

  const result: MergedConfig = {
    ...projectConfig, // Start with project config
    hasUserConfig: true,
    userConfig, // Keep reference to original user config
  };

  // Only set properties if they have values
  if (mergedEnvVars !== undefined) {
    result.env = mergedEnvVars;
  }
  if (mergedHosts !== undefined) {
    result.hosts = mergedHosts;
  }
  if (Object.keys(mergedOptions).length > 0) {
    result.options = mergedOptions;
  }

  return result;
}

/**
 * Merges environment variables from user and project configs
 * User env vars serve as defaults, project env vars override
 */
function mergeEnvironmentVariables(
  userConfig: SettingsUser,
  projectConfig: SettingsProject
): Record<string, EnvValue> | undefined {
  const userEnv = userConfig.env ?? {};
  const projectEnv = projectConfig.env ?? {};

  // If neither has env vars, return undefined
  if (
    Object.keys(userEnv).length === 0 &&
    Object.keys(projectEnv).length === 0
  ) {
    return undefined;
  }

  // Project env vars override user env vars
  return {
    ...userEnv,
    ...projectEnv,
  };
}

/**
 * Merges host settings from user and project configs
 * User explicit true/false values override project settings
 * Undefined user values fall back to project settings
 */
function mergeHostSettings(
  userConfig: SettingsUser,
  projectConfig: SettingsProject
): Record<string, boolean | undefined> | undefined {
  const userHosts = userConfig.hosts ?? {};
  const projectHosts = projectConfig.hosts ?? {};

  // If neither has host settings, return undefined
  if (
    Object.keys(userHosts).length === 0 &&
    Object.keys(projectHosts).length === 0
  ) {
    return undefined;
  }

  // Start with project hosts, then apply user overrides where defined
  const mergedHosts: Record<string, boolean | undefined> = { ...projectHosts };

  // Apply user overrides
  for (const [hostName, userValue] of Object.entries(userHosts) as [
    string,
    boolean | undefined,
  ][]) {
    if (userValue !== undefined) {
      // User has explicit true/false - use it
      mergedHosts[hostName] = userValue;
    }
    // If userValue is undefined, keep project setting (or leave undefined)
  }

  return Object.keys(mergedHosts).length > 0 ? mergedHosts : undefined;
}

/**
 * Creates environment variables that include inheritance from user config
 * This is used by server startup to resolve env vars with user inheritance
 */
export function createInheritedEnvConfig(
  serverEnvConfig: Record<string, EnvValue> | undefined,
  mergedConfig: MergedConfig
): Record<string, EnvValue> {
  const serverEnv = serverEnvConfig ?? {};
  const globalEnv = mergedConfig.env ?? {};

  // Server-specific env vars override global merged env vars
  return {
    ...globalEnv,
    ...serverEnv,
  };
}
