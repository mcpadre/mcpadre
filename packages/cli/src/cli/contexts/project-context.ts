// pattern: Functional Core
// Project configuration context implementation

import { join, resolve } from "path";

import { isProjectCapableHost } from "../../config/types/v1/hosts.js";
import { writeSettingsProjectToFile } from "../../config/writers/settings-project-writer.js";
import { discoverProjectConfig } from "../../installer/discovery/project-discovery.js";
import { ConfigurationError } from "../../utils/errors.js";
import { getProjectCapableHosts, isValidHost } from "../host/host-logic.js";

import { BaseConfigContext } from "./config-context.js";

import type {
  SettingsProject,
  SettingsUser,
} from "../../config/types/index.js";
import type { SupportedHostV1 } from "../../config/types/v1/hosts.js";

/**
 * Project configuration context implementation
 * Handles project-level configuration operations
 */
export class ProjectConfigContext extends BaseConfigContext {
  readonly type = "project" as const;
  private targetDir: string;
  private configPath: string;

  constructor(targetDir = ".") {
    super();
    this.targetDir = resolve(targetDir);
    // Default to YAML, but we'll check for existing config files first
    this.configPath = join(this.targetDir, "mcpadre.yaml");
  }

  /**
   * Initialize config path based on existing file (if any)
   * This must be called before any operations that use the config path
   */
  async initConfigPath(): Promise<void> {
    const existingConfig = await this.findExistingConfig();
    if (existingConfig) {
      this.configPath = existingConfig;
    }
  }

  /**
   * Get the project directory
   */
  getTargetDir(): string {
    return this.targetDir;
  }

  /**
   * Get the path to the project configuration file
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Resolve a directory path relative to the project
   */
  resolveDirectory(path?: string): string {
    if (!path) {
      return this.targetDir;
    }
    return resolve(this.targetDir, path);
  }

  /**
   * Load project configuration from file
   */
  async loadConfig(): Promise<SettingsProject | SettingsUser> {
    try {
      const discovered = await discoverProjectConfig(this.targetDir);
      return discovered.config;
    } catch {
      // Throw a typed ConfigurationError with a user-friendly message
      throw new ConfigurationError(
        `No project configuration found in ${this.targetDir}. Run 'mcpadre init' to create one.`
      );
    }
  }

  /**
   * Write project configuration to file
   */
  async writeConfig(config: SettingsProject | SettingsUser): Promise<void> {
    // We only handle SettingsProject in project context
    await writeSettingsProjectToFile(
      this.configPath,
      config as SettingsProject
    );
  }

  /**
   * Get all supported hosts for projects
   */
  getSupportedHosts(): readonly SupportedHostV1[] {
    return getProjectCapableHosts();
  }

  /**
   * Check if a host is valid for projects
   */
  isHostCapable(host: string): boolean {
    // First check if it's a valid host at all, then check if it's project-capable
    return isValidHost(host) && isProjectCapableHost(host as SupportedHostV1);
  }

  /**
   * Get example commands for project context
   */
  getExampleCommands(): string[] {
    return [
      "mcpadre init --host cursor --host zed",
      "mcpadre server add servers.yaml --all --yes",
      "mcpadre host add vscode",
      "mcpadre install",
      "mcpadre run my-server",
    ];
  }

  /**
   * Override to provide project-specific messaging
   */
  override getNextStepsMessage(selectedHosts: readonly string[]): string[] {
    const steps = [
      "Next steps:",
      "  1. Add MCP servers to the 'mcpServers' section",
      "  2. Run 'mcpadre install' to set up MCP client configurations",
    ];

    if (selectedHosts.length > 0) {
      steps.push(
        `  3. The following hosts will be configured for this project: ${selectedHosts.join(", ")}`
      );
    }

    return steps;
  }
}
