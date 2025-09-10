// pattern: Functional Core
import { parse as parseToml } from "@iarna/toml";
import { access, constants, readFile } from "fs/promises";
import { extname, join } from "path";
import { parse as parseYaml } from "yaml";

import { ajv } from "../../utils/ajv.js";
import { ConfigurationError, ValidationError } from "../../utils/errors.js";
import { SettingsUser } from "../types/index.js";

// Compile schema once for reuse
const validateSettingsUser = ajv.compile(SettingsUser);

/**
 * Loads and parses user configuration from a file path, automatically detecting format
 * by file extension (.json, .yaml/.yml, .toml)
 */
export async function loadSettingsUserFromFile(
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
 * Validates a JavaScript object against the SettingsUser schema
 */
export function validateSettingsUserObject(
  data: unknown
): data is SettingsUser {
  const isValid = validateSettingsUser(data);

  if (!isValid) {
    const errors = validateSettingsUser.errors ?? [];
    const errorMessages = errors
      .map(err => `${err.instancePath || "root"}: ${err.message}`)
      .join(", ");
    throw new ValidationError(
      `User settings validation failed: ${errorMessages}`,
      errors.map(err => `${err.instancePath || "root"}: ${err.message}`)
    );
  }

  return true;
}

/**
 * Find user configuration file in the specified directory
 * Looks for mcpadre.yaml, mcpadre.yml, mcpadre.json, and mcpadre.toml in the given directory
 */
export async function findUserConfig(userDir: string): Promise<string | null> {
  const configFilenames = [
    "mcpadre.yaml",
    "mcpadre.yml",
    "mcpadre.json",
    "mcpadre.toml",
  ];

  // Check if user directory exists
  try {
    await access(userDir, constants.F_OK);
  } catch {
    throw new ConfigurationError(
      `User configuration directory does not exist: ${userDir}`
    );
  }

  const foundConfigs: string[] = [];

  for (const filename of configFilenames) {
    const configPath = join(userDir, filename);

    try {
      await access(configPath, constants.F_OK);
      foundConfigs.push(configPath);
    } catch {
      // File doesn't exist, continue
    }
  }

  // Error if multiple config files found
  if (foundConfigs.length > 1) {
    const filenames = foundConfigs.map(path =>
      extname(path) === ".yml" ? "mcpadre.yml" : `mcpadre${extname(path)}`
    );
    throw new ConfigurationError(
      `Multiple mcpadre user config files found in ${userDir}: ${filenames.join(", ")}. Please use only one config file.`
    );
  }

  // Return the single config file found, or null if none
  return foundConfigs[0] ?? null;
}

/**
 * Loads and validates a SettingsUser configuration from file
 */
export async function loadAndValidateSettingsUser(
  filePath: string
): Promise<SettingsUser> {
  const data = await loadSettingsUserFromFile(filePath);

  if (validateSettingsUserObject(data)) {
    return data;
  }

  // This should never be reached due to the throw in validateSettingsUserObject
  throw new Error("Unexpected validation state");
}

/**
 * Load user configuration from the specified directory
 * Returns the configuration and the path where it was found
 * If no config file exists, synthesizes a default empty configuration
 */
export async function loadUserConfig(userDir: string): Promise<{
  config: SettingsUser;
  configPath: string | null;
}> {
  const configPath = await findUserConfig(userDir);

  if (!configPath) {
    // Synthesize a default empty user configuration
    const defaultConfig: SettingsUser = {
      version: 1,
      mcpServers: {},
    };

    return {
      config: defaultConfig,
      configPath: null,
    };
  }

  const config = await loadAndValidateSettingsUser(configPath);

  return { config, configPath };
}

/**
 * Load user configuration from the specified directory, requiring that it exists
 * This should be used for commands that explicitly operate on user configs (--user flag)
 */
export async function loadRequiredUserConfig(userDir: string): Promise<{
  config: SettingsUser;
  configPath: string;
}> {
  let configPath: string | null;

  try {
    configPath = await findUserConfig(userDir);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("User configuration directory does not exist")
    ) {
      // Re-throw with the same message for consistent error handling
      throw error;
    }
    // Re-throw other errors
    throw error;
  }

  if (!configPath) {
    throw new Error(
      `No mcpadre user configuration file found in ${userDir}. Please create one using: mcpadre init --user`
    );
  }

  const config = await loadAndValidateSettingsUser(configPath);

  return { config, configPath };
}
