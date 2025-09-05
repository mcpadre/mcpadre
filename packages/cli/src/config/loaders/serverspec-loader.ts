// pattern: Functional Core

import { parse as parseToml } from "@iarna/toml";
import { readFile } from "fs/promises";
import { extname } from "path";
import { parse as parseYaml } from "yaml";

import { ajv } from "../../utils/ajv.js";
import { FileSystemError, ValidationError } from "../../utils/errors.js";
import { ServerSpec } from "../types/index.js";

// Compile schema once for reuse
const validateServerSpec = ajv.compile(ServerSpec);

/**
 * Loads and parses ServerSpec from a file path, automatically detecting format
 * by file extension (.json, .yaml/.yml, .toml)
 */
export async function loadServerSpecFromFile(
  filePath: string
): Promise<unknown> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new FileSystemError(
        `ServerSpec file not found: ${filePath}`,
        "read",
        filePath
      );
    }
    throw error;
  }
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
 * Validates a JavaScript object against the ServerSpec schema
 */
export function validateServerSpecObject(data: unknown): data is ServerSpec {
  const isValid = validateServerSpec(data);

  if (!isValid) {
    const errors = validateServerSpec.errors ?? [];
    const errorMessages = errors
      .map(err => `${err.instancePath || "root"}: ${err.message}`)
      .join(", ");
    throw new ValidationError(
      `ServerSpec validation failed: ${errorMessages}`,
      errors.map(err => `${err.instancePath || "root"}: ${err.message}`)
    );
  }

  return true;
}

/**
 * Loads and validates a ServerSpec configuration from file
 */
export async function loadAndValidateServerSpec(
  filePath: string
): Promise<ServerSpec> {
  const data = await loadServerSpecFromFile(filePath);

  if (validateServerSpecObject(data)) {
    return data;
  }

  // This should never be reached due to the throw in validateServerSpecObject
  throw new Error("Unexpected validation state");
}
