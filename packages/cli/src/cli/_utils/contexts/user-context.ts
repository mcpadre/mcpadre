// pattern: Functional Core
// User configuration context implementation

import { join } from "path";

import {
  findUserConfig,
  loadSettingsUserFromFile,
  validateSettingsUserObject,
} from "../../../config/loaders/settings-user-loader.js";
import { isUserCapableHost } from "../../../config/types/v1/hosts.js";
import { writeSettingsUserToFile } from "../../../config/writers/settings-user-writer.js";
import { ConfigurationError } from "../../../utils/errors.js";
import { getUserDir } from "../../_globals.js";
import { getUserCapableHosts } from "../../host/host-logic.js";

import { BaseConfigContext } from "./config-context.js";

import type {
  SettingsProject,
  SettingsUser,
} from "../../../config/types/index.js";
import type { SupportedHostV1 } from "../../../config/types/v1/hosts.js";

/**
 * User configuration context implementation
 * Handles user-level (global) configuration operations
 */
export class UserConfigContext extends BaseConfigContext {
  readonly type = "user" as const;
  private configPath: string;
  private targetDir: string;

  constructor() {
    super();
    this.targetDir = getUserDir();
    // Default to YAML, but we'll check for existing config files first
    this.configPath = join(this.targetDir, "mcpadre.yaml");
  }

  /**
   * Initialize config path based on existing file (if any)
   * This must be called before any operations that use the config path
   */
  async initConfigPath(): Promise<void> {
    const existingConfig = await findUserConfig();
    if (existingConfig) {
      this.configPath = existingConfig;
    }
  }

  /**
   * Get the user configuration directory
   */
  getTargetDir(): string {
    return this.targetDir;
  }

  /**
   * Get the path to the user configuration file
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Resolve a directory path (always returns user directory for user context)
   */
  resolveDirectory(_path?: string): string {
    // User mode ignores path parameter and always uses user directory
    return this.targetDir;
  }

  /**
   * Load user configuration from file
   */
  async loadConfig(): Promise<SettingsProject | SettingsUser> {
    const configPath = await findUserConfig();
    if (!configPath) {
      throw new ConfigurationError(
        `No user configuration found in ${this.targetDir}. Run 'mcpadre init --user' to create one.`
      );
    }
    const data = await loadSettingsUserFromFile(configPath);
    // loadSettingsUserFromFile returns unknown, but we need to validate it
    if (!validateSettingsUserObject(data)) {
      throw new ConfigurationError("Invalid user configuration file");
    }
    return data;
  }

  /**
   * Write user configuration to file
   */
  async writeConfig(config: SettingsProject | SettingsUser): Promise<void> {
    // We only handle SettingsUser in user context
    await writeSettingsUserToFile(this.configPath, config as SettingsUser);
  }

  /**
   * Get hosts that support user-level configuration
   */
  getSupportedHosts(): readonly SupportedHostV1[] {
    return getUserCapableHosts();
  }

  /**
   * Check if a host is capable of user-level configuration
   */
  isHostCapable(host: string): boolean {
    // First check if it's a valid host at all
    const supportedHosts = this.getSupportedHosts();
    if (!supportedHosts.includes(host as SupportedHostV1)) {
      return false;
    }
    return isUserCapableHost(host as SupportedHostV1);
  }

  /**
   * Get example commands for user context
   */
  getExampleCommands(): string[] {
    return [
      "mcpadre init --user --host claude-desktop",
      "mcpadre server add servers.yaml --user --yes",
      "mcpadre host add claude-code --user",
      "mcpadre install --user",
      "mcpadre run my-server --user",
    ];
  }

  /**
   * Override to provide user-specific messaging
   */
  override getNextStepsMessage(selectedHosts: readonly string[]): string[] {
    const steps = [
      "Next steps:",
      "  1. Add MCP servers to the 'mcpServers' section",
      "  2. Run 'mcpadre install --user' to set up global MCP configurations",
    ];

    if (selectedHosts.length > 0) {
      steps.push(
        `  3. The following hosts will be configured globally: ${selectedHosts.join(", ")}`
      );
    }

    steps.push("  4. Your user configuration will be used across all projects");

    return steps;
  }
}
