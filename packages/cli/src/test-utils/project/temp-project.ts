// pattern: Imperative Shell

import { parse as parseToml, stringify as stringifyToml } from "@iarna/toml";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { parse as parseYaml, stringify } from "yaml";

import type { SettingsProject } from "../../config/types/index.js";

/**
 * Configuration for creating a temporary project
 */
export interface TempProjectConfig {
  /** Project configuration to write */
  config: SettingsProject;
  /** Config file format to use */
  format: "yaml" | "json" | "toml";
  /** Optional directory name prefix */
  prefix?: string;
}

/**
 * Result of creating a temporary project
 */
export interface TempProject {
  /** Path to the temporary project directory */
  path: string;
  /** Path to the config file that was created */
  configPath: string;
  /** Cleanup function to remove the temporary directory */
  cleanup: () => Promise<void>;
  /** Write a file to the temporary project directory */
  writeFile: (relativePath: string, content: string) => Promise<void>;
  /** Update the config file with new configuration */
  updateConfig: (newConfig: SettingsProject) => Promise<void>;
  /** Read the current config file */
  readConfig: () => Promise<SettingsProject>;
}

/**
 * Creates a temporary project directory with a mcpadre config file
 * for testing purposes
 */
export async function createTempProject(
  config: TempProjectConfig
): Promise<TempProject> {
  // Create temporary directory
  const prefix = config.prefix ?? "mcpadre-test-";
  const tempDir = await mkdtemp(join(tmpdir(), prefix));

  // Determine config filename and content based on format
  let configFilename: string;
  let configContent: string;

  switch (config.format) {
    case "json":
      configFilename = "mcpadre.json";
      configContent = JSON.stringify(config.config, null, 2);
      break;
    case "yaml": {
      configFilename = "mcpadre.yaml";
      // Use YAML stringify - will need to import yaml library
      configContent = stringify(config.config);
      break;
    }
    case "toml": {
      configFilename = "mcpadre.toml";
      // Use TOML stringify - will need to import toml library
      configContent = stringifyToml(config.config);
      break;
    }
    default:
      throw new Error(`Unsupported config format: ${config.format}`);
  }

  // Write config file
  const configPath = join(tempDir, configFilename);
  await writeFile(configPath, configContent, "utf8");

  return {
    path: tempDir,
    configPath,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
    writeFile: async (relativePath: string, content: string) => {
      const fullPath = join(tempDir, relativePath);
      const dir = dirname(fullPath);
      await mkdir(dir, { recursive: true });
      await writeFile(fullPath, content, "utf8");
    },
    updateConfig: async (newConfig: SettingsProject) => {
      // Generate new config content in the same format as original
      let newConfigContent: string;

      switch (config.format) {
        case "json":
          newConfigContent = JSON.stringify(newConfig, null, 2);
          break;
        case "yaml": {
          newConfigContent = stringify(newConfig);
          break;
        }
        case "toml": {
          newConfigContent = stringifyToml(newConfig);
          break;
        }
        default:
          throw new Error(`Unsupported config format: ${config.format}`);
      }

      // Write updated config to the same file
      await writeFile(configPath, newConfigContent, "utf8");
    },
    readConfig: async (): Promise<SettingsProject> => {
      // Read the config file
      const configContent = await readFile(configPath, "utf8");

      // Parse based on the original format
      switch (config.format) {
        case "json":
          return JSON.parse(configContent) as SettingsProject;
        case "yaml":
          return parseYaml(configContent) as SettingsProject;
        case "toml":
          return parseToml(configContent) as SettingsProject;
        default:
          throw new Error(`Unsupported config format: ${config.format}`);
      }
    },
  };
}

/**
 * Creates a minimal test project configuration for HTTP MCP servers
 */
export function createTestProjectConfig(
  serverName: string,
  serverUrl: string
): SettingsProject {
  return {
    version: 1,
    mcpServers: {
      [serverName]: {
        http: {
          url: serverUrl,
          headers: {},
        },
      },
    },
  };
}
