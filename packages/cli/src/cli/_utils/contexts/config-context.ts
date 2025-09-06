// pattern: Functional Core
// ConfigContext interface that abstracts user vs project configuration differences

import { existsSync } from "fs";
import { join } from "path";

import type {
  SettingsProject,
  SettingsUser,
} from "../../../config/types/index.js";
import type { SupportedHostV1 } from "../../../config/types/v1/hosts.js";

/**
 * Configuration context that encapsulates all differences between
 * user and project modes, allowing commands to have a single execution path
 */
export interface ConfigContext {
  /**
   * The type of configuration context
   */
  readonly type: "user" | "project";

  /**
   * Directory and path operations
   */
  getTargetDir(): string;
  getConfigPath(): string;
  resolveDirectory(path?: string): string;

  /**
   * Configuration file operations
   */
  loadConfig(): Promise<SettingsProject | SettingsUser>;
  writeConfig(config: SettingsProject | SettingsUser): Promise<void>;
  configExists(): Promise<boolean>;
  findExistingConfig(): Promise<string | null>;
  initConfigPath(): Promise<void>;

  /**
   * Host operations
   */
  getSupportedHosts(): readonly SupportedHostV1[];
  isHostCapable(host: string): boolean;

  /**
   * Messaging and display
   */
  getConfigTypeName(): string;
  getInstallCommand(): string;
  getNextStepsMessage(selectedHosts: readonly string[]): string[];
  getExampleCommands(): string[];
}

/**
 * Base implementation with common functionality
 */
export abstract class BaseConfigContext implements ConfigContext {
  abstract readonly type: "user" | "project";

  abstract getTargetDir(): string;
  abstract getConfigPath(): string;
  abstract resolveDirectory(path?: string): string;
  abstract loadConfig(): Promise<SettingsProject | SettingsUser>;
  abstract writeConfig(config: SettingsProject | SettingsUser): Promise<void>;
  abstract getSupportedHosts(): readonly SupportedHostV1[];
  abstract isHostCapable(host: string): boolean;
  abstract initConfigPath(): Promise<void>;

  /**
   * Check if configuration file exists
   */
  async configExists(): Promise<boolean> {
    return existsSync(this.getConfigPath());
  }

  /**
   * Find existing configuration file (checking multiple formats)
   */
  async findExistingConfig(): Promise<string | null> {
    const CONFIG_FILE_NAMES = [
      "mcpadre.json",
      "mcpadre.yaml",
      "mcpadre.yml",
      "mcpadre.toml",
    ];

    const targetDir = this.getTargetDir();
    for (const fileName of CONFIG_FILE_NAMES) {
      const filePath = join(targetDir, fileName);
      if (existsSync(filePath)) {
        return filePath;
      }
    }
    return null;
  }

  /**
   * Get human-readable configuration type name
   */
  getConfigTypeName(): string {
    return this.type;
  }

  /**
   * Get the appropriate install command for this context
   */
  getInstallCommand(): string {
    return this.type === "user" ? "mcpadre install --user" : "mcpadre install";
  }

  /**
   * Get next steps message after successful operation
   */
  getNextStepsMessage(selectedHosts: readonly string[]): string[] {
    const steps = [
      "Next steps:",
      "  1. Add MCP servers to the 'mcpServers' section",
      `  2. Run '${this.getInstallCommand()}' to set up ${
        this.type === "user" ? "global" : ""
      } MCP configurations`.trim(),
    ];

    if (selectedHosts.length > 0) {
      steps.push(
        `  3. The following hosts will be configured: ${selectedHosts.join(", ")}`
      );
    }

    return steps;
  }

  /**
   * Get example commands for this context
   */
  abstract getExampleCommands(): string[];
}
