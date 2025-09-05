// pattern: Functional Core

import { stringify as stringifyToml } from "@iarna/toml";
import { writeFile } from "fs/promises";
import { extname } from "path";
import { stringify } from "yaml";

import { forceQuoteVersionStrings } from "../../utils/yaml-helpers.js";

import type { SettingsProject } from "../types/index.js";

/**
 * Writes a SettingsProject configuration to a file in the appropriate format
 * based on the file extension (.json, .yaml/.yml, .toml)
 *
 * The format is determined by the file extension:
 * - .json: JSON format with 2-space indentation
 * - .yaml/.yml: YAML format using yaml library
 * - .toml: TOML format using @iarna/toml library
 *
 * @param filePath Path to write the config file to
 * @param config SettingsProject configuration to write
 * @throws Error if file extension is unsupported
 */
export async function writeSettingsProjectToFile(
  filePath: string,
  config: SettingsProject
): Promise<void> {
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
