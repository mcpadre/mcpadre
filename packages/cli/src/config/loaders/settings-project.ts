// pattern: Functional Core
import { parse as parseToml } from "@iarna/toml";
import { access, constants, readFile } from "fs/promises";
import { dirname, extname, join, resolve } from "path";
import { parse as parseYaml } from "yaml";

import { discoverProjectConfig } from "../../installer/discovery/project-discovery.js";
import { ajv } from "../../utils/ajv.js";
import { ValidationError } from "../../utils/errors.js";
import { SettingsProject } from "../types/index.js";

// Compile schema once for reuse
const validateSettingsProject = ajv.compile(SettingsProject);

/**
 * Loads and parses configuration from a file path, automatically detecting format
 * by file extension (.json, .yaml/.yml, .toml)
 */
export async function loadSettingsProjectFromFile(
  filePath: string
): Promise<unknown> {
  const content = await readFile(filePath, "utf8");
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".json":
      return JSON.parse(content);
    case ".yaml":
    case ".yml":
      return parseYaml(content);
    case ".toml":
      return parseToml(content);
    default:
      throw new Error(
        `Unsupported file format: ${ext}. Supported formats: .json, .yaml, .yml, .toml`
      );
  }
}

/**
 * Validates a JavaScript object against the SettingsProject schema
 */
export function validateSettingsProjectObject(
  data: unknown
): data is SettingsProject {
  const isValid = validateSettingsProject(data);

  if (!isValid) {
    const errors = validateSettingsProject.errors ?? [];
    const errorMessages = errors
      .map(err => `${err.instancePath || "root"}: ${err.message}`)
      .join(", ");
    throw new ValidationError(
      `Settings validation failed: ${errorMessages}`,
      errors.map(err => `${err.instancePath || "root"}: ${err.message}`)
    );
  }

  return true;
}

/**
 * Search for mcpadre configuration files in current directory and parent directories
 * Supports mcpadre.yaml, mcpadre.yml, mcpadre.json, and mcpadre.toml
 */
export async function findProjectConfig(
  startDir: string = process.cwd(),
  noParent = false
): Promise<string | null> {
  const configFilenames = [
    "mcpadre.yaml",
    "mcpadre.yml",
    "mcpadre.json",
    "mcpadre.toml",
  ];

  let currentDir = resolve(startDir);

  while (currentDir !== dirname(currentDir)) {
    // Check for multiple config files at the same level (error condition)
    const foundConfigs: string[] = [];

    for (const filename of configFilenames) {
      const configPath = join(currentDir, filename);

      try {
        await access(configPath, constants.F_OK);
        foundConfigs.push(configPath);
      } catch {
        // File doesn't exist, continue
      }
    }

    // Error if multiple config files found at same level
    if (foundConfigs.length > 1) {
      const filenames = foundConfigs.map(path =>
        join(
          ".",
          extname(path) === ".yml" ? "mcpadre.yml" : `mcpadre${extname(path)}`
        )
      );
      throw new Error(
        `Multiple mcpadre config files found in ${currentDir}: ${filenames.join(", ")}. Please use only one config file per directory.`
      );
    }

    // Return the single config file found
    if (foundConfigs.length === 1) {
      return foundConfigs[0] ?? null;
    }

    // If noParent is true, stop after checking the starting directory
    if (noParent) {
      break;
    }

    // Move to parent directory
    currentDir = dirname(currentDir);
  }

  return null; // No config found
}

/**
 * Load project configuration from the nearest mcpadre config file
 * Searches upward from the specified directory or workspace directory override
 *
 * @deprecated Use discoverProjectConfig instead for access to projectDir and configPath
 */
export async function loadProjectConfig(
  startDir?: string
): Promise<SettingsProject> {
  // Delegate to discoverProjectConfig to consolidate logic
  const { config } = await discoverProjectConfig(startDir);
  return config;
}

/**
 * Loads and validates a SettingsProject configuration from file
 */
export async function loadAndValidateSettingsProject(
  filePath: string
): Promise<SettingsProject> {
  const data = await loadSettingsProjectFromFile(filePath);

  if (validateSettingsProjectObject(data)) {
    return data;
  }

  // This should never be reached due to the throw in validateSettingsProjectObject
  throw new Error("Unexpected validation state");
}
