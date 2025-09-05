// pattern: Functional Core

import { stringify as stringifyToml } from "@iarna/toml";
import { mkdir, writeFile } from "fs/promises";
import { dirname, extname, join } from "path";
import { stringify } from "yaml";

import { getUserDir } from "../../cli/_globals.js";
import { forceQuoteVersionStrings } from "../../utils/yaml-helpers.js";

import type { SettingsUser } from "../types/index.js";

/**
 * Writes a SettingsUser configuration to a file in the appropriate format
 * based on the file extension (.json, .yaml/.yml, .toml)
 *
 * The format is determined by the file extension:
 * - .json: JSON format with 2-space indentation
 * - .yaml/.yml: YAML format using yaml library
 * - .toml: TOML format using @iarna/toml library
 *
 * @param filePath Path to write the config file to
 * @param config SettingsUser configuration to write
 * @throws Error if file extension is unsupported
 */
export async function writeSettingsUserToFile(
  filePath: string,
  config: SettingsUser
): Promise<void> {
  // Ensure the user directory exists
  await mkdir(dirname(filePath), { recursive: true });

  const ext = extname(filePath).toLowerCase();
  let content: string;

  switch (ext) {
    case ".json":
      content = `${JSON.stringify(config, null, 2)}\n`;
      break;
    case ".yaml":
    case ".yml": {
      const configWithQuotedVersions = forceQuoteVersionStrings(config);
      content = stringify(configWithQuotedVersions);
      break;
    }
    case ".toml": {
      content = stringifyToml(config);
      break;
    }
    default:
      throw new Error(
        `Unsupported file format: ${ext}. Supported formats: .json, .yaml, .yml, .toml`
      );
  }

  await writeFile(filePath, content, "utf8");
}

/**
 * Writes a SettingsUser configuration to the user directory with the default filename
 *
 * @param config SettingsUser configuration to write
 * @param filename Optional filename (defaults to mcpadre.yaml)
 */
export async function writeSettingsUserToUserDir(
  config: SettingsUser,
  filename = "mcpadre.yaml"
): Promise<string> {
  const userDir = getUserDir();
  const configPath = join(userDir, filename);

  await writeSettingsUserToFile(configPath, config);

  return configPath;
}
