// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";
import YAML from "yaml";

import {
  ServerSpecV1,
  SettingsProjectV1,
  SettingsUserV1,
} from "../../config/types/v1/index.js";

/**
 * Outputs a TypeBox schema in the requested format
 */
function outputSchema(schema: object, format: "json" | "yaml"): void {
  if (format === "json") {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(schema, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log(YAML.stringify(schema));
  }
}

/**
 * Creates the `schema user-settings` subcommand
 */
function makeUserSettingsCommand(): Command {
  return new Command("user-settings")
    .description("Output JSON schema for user settings configuration")
    .option("-f, --format <format>", "Output format (json or yaml)", "json")
    .action(options => {
      const format = options.format;
      if (format !== "json" && format !== "yaml") {
        throw new Error(`Invalid format: ${format}. Must be 'json' or 'yaml'`);
      }
      outputSchema(SettingsUserV1, format);
    });
}

/**
 * Creates the `schema project-settings` subcommand
 */
function makeProjectSettingsCommand(): Command {
  return new Command("project-settings")
    .description("Output JSON schema for project settings configuration")
    .option("-f, --format <format>", "Output format (json or yaml)", "json")
    .action(options => {
      const format = options.format;
      if (format !== "json" && format !== "yaml") {
        throw new Error(`Invalid format: ${format}. Must be 'json' or 'yaml'`);
      }
      outputSchema(SettingsProjectV1, format);
    });
}

/**
 * Creates the `schema server-spec` subcommand
 */
function makeServerSpecCommand(): Command {
  return new Command("server-spec")
    .description("Output JSON schema for server spec configuration")
    .option("-f, --format <format>", "Output format (json or yaml)", "json")
    .action(options => {
      const format = options.format;
      if (format !== "json" && format !== "yaml") {
        throw new Error(`Invalid format: ${format}. Must be 'json' or 'yaml'`);
      }
      outputSchema(ServerSpecV1, format);
    });
}

/**
 * Creates the main `schema` command with subcommands
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeSchemaCommand() {
  return new Command("schema")
    .description("Output JSON schemas for mcpadre configuration types")
    .addHelpText(
      "before",
      `
Output JSON Schema definitions for mcpadre configuration file types.
Useful for editor integration, validation tooling, and documentation.

Available subcommands:
  • user-settings     Schema for user-level configuration (~/.config/mcpadre/)
  • project-settings  Schema for project-level configuration (mcpadre.yaml)
  • server-spec       Schema for server specification files
      `
    )
    .addHelpText(
      "after",
      `
Examples:
  mcpadre schema user-settings                   Output user settings schema as JSON
  mcpadre schema project-settings --format yaml  Output project settings schema as YAML
  mcpadre schema server-spec > schema.json       Save server spec schema to file

Format Options:
  -f, --format <format>   Output format: json (default) or yaml
      `
    )
    .addCommand(makeUserSettingsCommand())
    .addCommand(makeProjectSettingsCommand())
    .addCommand(makeServerSpecCommand());
}
