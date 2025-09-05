// pattern: Mixed (unavoidable)
// Command execution requires integration of pure logic with side effects for performance

import { split } from "shlex";

import { createCommand } from "../../utils/command/index.js";
import { applyTemplate } from "../../utils/string-templating/index.js";

import type {
  EnvCommand,
  EnvPass,
  EnvSpecialDirectory,
  EnvStringObject,
  EnvValue,
} from "../../config/types/index.js";
import type { DirectoryResolver } from "../directory-resolver/index.js";
import type { ResolvedCommand, ResolvedEnvVar } from "../types/index.js";
import type { Logger } from "pino";

/**
 * Options for creating an environment resolver.
 */
export interface EnvResolverOptions {
  /** Directory resolver providing system and workspace paths */
  directoryResolver: DirectoryResolver;
  /** Parent environment variables (usually process.env) */
  parentEnv: Record<string, string | undefined>;
  /** Environment configuration to resolve */
  envConfig: Record<string, EnvValue>;
  /** Logger for debug and trace output */
  logger: Logger;
}

/**
 * Resolves environment configuration into concrete environment variables.
 * Handles templating, directory resolution, pass-through variables, and command execution.
 *
 * @param options - Configuration options for environment resolution
 * @returns Promise resolving to a map of environment variable names to resolved values
 */
export async function resolveEnvVars(
  options: EnvResolverOptions
): Promise<Record<string, ResolvedEnvVar>> {
  const { directoryResolver, parentEnv, envConfig, logger } = options;

  logger.debug(
    { configKeys: Object.keys(envConfig) },
    "Starting environment resolution"
  );

  // Prepare template variables for string templating
  const templateVars = {
    dirs: directoryResolver,
    parentEnv,
  };

  // Process all environment values, collecting promises for async operations
  const resolvePromises: Promise<[string, ResolvedEnvVar]>[] = [];

  for (const [key, envValue] of Object.entries(envConfig)) {
    logger.trace({ key, envValue }, "Processing environment value");

    const promise = resolveEnvValue(key, envValue, templateVars, logger);
    resolvePromises.push(promise);
  }

  // Wait for all resolutions to complete (commands run in parallel)
  const resolvedEntries = await Promise.allSettled(resolvePromises);

  // Build result object, handling any failures
  const result: Record<string, ResolvedEnvVar> = {};

  for (const [index, settledResult] of resolvedEntries.entries()) {
    const key = Object.keys(envConfig)[index];

    if (settledResult.status === "fulfilled") {
      const [resolvedKey, resolvedValue] = settledResult.value;
      result[resolvedKey] = resolvedValue;
      logger.debug(
        { key: resolvedKey, value: resolvedValue },
        "Successfully resolved environment variable"
      );
    } else {
      logger.error(
        { key, error: settledResult.reason },
        "Failed to resolve environment variable"
      );
      throw new Error(
        `Failed to resolve environment variable '${key}': ${settledResult.reason.message}`
      );
    }
  }

  logger.debug(
    { resolvedCount: Object.keys(result).length },
    "Environment resolution completed"
  );
  return result;
}

/**
 * Resolves a single environment value based on its type.
 *
 * @param key - Environment variable key
 * @param envValue - Environment value configuration
 * @param templateVars - Variables available for templating
 * @param logger - Logger instance
 * @returns Promise resolving to key-value pair
 */
async function resolveEnvValue(
  key: string,
  envValue: EnvValue,
  templateVars: {
    dirs: DirectoryResolver;
    parentEnv: Record<string, string | undefined>;
  },
  logger: Logger
): Promise<[string, ResolvedEnvVar]> {
  // Handle EnvStringTemplate (plain string)
  if (typeof envValue === "string") {
    logger.trace({ key, template: envValue }, "Resolving string template");
    const resolved = applyTemplate<string, string>(envValue, templateVars);
    logger.trace(
      { key, input: envValue, output: resolved },
      "String template resolved"
    );
    return [key, resolved as ResolvedEnvVar];
  }

  // Handle EnvStringObject (object with string property)
  if ("string" in envValue) {
    const stringValue = (envValue as EnvStringObject).string;
    logger.trace(
      { key, template: stringValue },
      "Resolving string object template"
    );
    const resolved = applyTemplate<string, string>(stringValue, templateVars);
    logger.trace(
      { key, input: stringValue, output: resolved },
      "String object template resolved"
    );
    return [key, resolved as ResolvedEnvVar];
  }

  // Handle EnvSpecialDirectory (object with special property)
  if ("special" in envValue) {
    const specialDir = (envValue as EnvSpecialDirectory).special;
    logger.debug(
      { key, specialDirectory: specialDir },
      "Resolving special directory"
    );

    // Map special directory names to actual paths
    let resolvedPath: string;
    switch (specialDir) {
      case "home":
        resolvedPath = templateVars.dirs.home;
        break;
      case "config":
        resolvedPath = templateVars.dirs.config;
        break;
      case "cache":
        resolvedPath = templateVars.dirs.cache;
        break;
      case "data":
        resolvedPath = templateVars.dirs.data;
        break;
      case "log":
        resolvedPath = templateVars.dirs.log;
        break;
      case "temp":
        resolvedPath = templateVars.dirs.temp;
        break;
      case "workspace":
        resolvedPath = templateVars.dirs.workspace;
        break;
      default:
        throw new Error(`Unknown special directory: ${specialDir}`);
    }

    logger.debug(
      { key, specialDirectory: specialDir, resolvedPath },
      "Special directory resolved"
    );
    return [key, resolvedPath as string as ResolvedEnvVar];
  }

  // Handle EnvPass (object with pass property)
  if ("pass" in envValue) {
    const passVar = (envValue as EnvPass).pass;
    logger.trace({ key, passVar }, "Resolving pass-through variable");

    const value = templateVars.parentEnv[passVar];
    if (value === undefined) {
      throw new Error(
        `Pass-through environment variable '${passVar}' is not defined in parent environment`
      );
    }

    logger.trace({ key, passVar, value }, "Pass-through variable resolved");
    return [key, value as ResolvedEnvVar];
  }

  // Handle EnvCommand (object with command property)
  if ("command" in envValue) {
    const commandTemplate = (envValue as EnvCommand).command;
    logger.debug({ key, commandTemplate }, "Resolving command template");

    // First resolve the command template
    const resolvedCommand = applyTemplate<string, ResolvedCommand>(
      commandTemplate,
      templateVars
    );
    logger.debug({ key }, "Executing command");

    try {
      // Parse command into parts using shell-like lexing
      const commandParts = split(resolvedCommand);
      const command = commandParts[0];
      if (!command) {
        throw new Error(`Empty command for env var '${key}'`);
      }
      const args = commandParts.slice(1);

      // Execute command using new command builder with logging
      const result = await createCommand(command, logger)
        .addArgs(args)
        .envs(templateVars.parentEnv as Record<string, string>)
        .output();

      logger.debug(
        { key, outputLength: result.length },
        "Command executed successfully"
      );
      return [key, result as ResolvedEnvVar];
    } catch (error) {
      logger.error({ key, error }, "Command execution failed");
      throw new Error(
        `Command execution failed for env var '${key}': ${error}`
      );
    }
  }

  // Should not reach here if types are correct
  throw new Error(`Unknown environment value type for key '${key}'`);
}
