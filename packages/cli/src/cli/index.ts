#!/usr/bin/env node
// pattern: Imperative Shell

import { Command, Option } from "@commander-js/extra-typings";

import { type LogFormat, type LogLevel } from "../logger/index.js";

import { makeDebugCommand } from "./debug/index.js";
import { makeHostCommand } from "./host/index.js";
import { makeSchemaCommand } from "./schema/index.js";
import { makeServerCommand } from "./server/index.js";
import { CLI_LOGGER, initializeLogger, setCliLogLevel } from "./_deps.js";
import {
  setNoParentFlag,
  setUserDir,
  setUserMode,
  setWorkspaceDir,
} from "./_globals.js";
import { makeEditCommand } from "./edit.js";
import { makeHelpmeCommand } from "./helpme.js";
import { makeInitCommand } from "./init.js";
import { makeInstallCommand } from "./install.js";
import { makeOutdatedCommand } from "./outdated.js";
import { makeRunCommand } from "./run.js";
import { makeUpgradeCommand } from "./upgrade.js";

function parseLogLevel(value: string): LogLevel {
  const validLevels: LogLevel[] = ["error", "warn", "info", "debug", "trace"];
  if (!validLevels.includes(value as LogLevel)) {
    throw new Error(
      `Invalid log level: ${value}. Valid levels are: ${validLevels.join(", ")}`
    );
  }
  return value as LogLevel;
}

function parseLogFormat(value: string): LogFormat {
  const validFormats: LogFormat[] = ["nice", "json"];
  if (!validFormats.includes(value as LogFormat)) {
    throw new Error(
      `Invalid log format: ${value}. Valid formats are: ${validFormats.join(", ")}`
    );
  }
  return value as LogFormat;
}

// Determine defaults based on environment
function getDefaultLogLevel(): LogLevel {
  const envLevel = process.env["MCPADRE_LOG_LEVEL"];
  if (
    envLevel &&
    ["error", "warn", "info", "debug", "trace"].includes(envLevel)
  ) {
    return envLevel as LogLevel;
  }
  return "info";
}

function isNonInteractive(): boolean {
  return (
    !process.stdout.isTTY || process.env["MCPADRE_NON_INTERACTIVE"] === "1"
  );
}

function getDefaultLogFormat(): LogFormat {
  return isNonInteractive() ? "json" : "nice";
}

// Define the root command
export const rootCommand = new Command("mcpadre")
  .version("0.1.0")
  .description("the missing parts of MCP management")
  .addOption(
    new Option("-l, --log-level <level>", "Set log level")
      .choices(["error", "warn", "info", "debug", "trace"])
      .default(getDefaultLogLevel())
      .argParser(parseLogLevel)
  )
  .addOption(
    new Option("--non-interactive", "Disable interactive features").default(
      isNonInteractive()
    )
  )
  .addOption(
    new Option("-f, --format <format>", "Output format")
      .choices(["nice", "json"])
      .default(getDefaultLogFormat())
      .argParser(parseLogFormat)
  )
  .addOption(new Option("-d, --dir <path>", "Override workspace directory"))
  .addOption(new Option("--user-dir <path>", "Override user config directory"))
  .addOption(
    new Option("--user", "Operate on user settings instead of project settings")
  )
  .addOption(
    new Option(
      "--no-parent",
      "Only search for config files in the specified directory, do not search parent directories"
    )
  )
  .hook("preAction", (thisCommand, _actionCommand) => {
    // Configure CLI_LOGGER and workspace directory before any action runs
    const options = thisCommand.opts();

    if (
      "logLevel" in options &&
      "format" in options &&
      "nonInteractive" in options
    ) {
      const logLevel = options["logLevel"] as LogLevel;
      const format = options["format"] as LogFormat;
      const nonInteractive = options["nonInteractive"] as boolean;

      // Initialize logger based on format and interactive mode
      initializeLogger(format, nonInteractive);
      setCliLogLevel(logLevel);
      CLI_LOGGER.debug(
        `Log level configured to: ${logLevel}, format: ${format}, non-interactive: ${nonInteractive}`
      );
    }

    // Set workspace directory override if provided
    if ("dir" in options) {
      const dir = options["dir"] as string | undefined;
      setWorkspaceDir(dir);
      if (dir) {
        CLI_LOGGER.debug(`Workspace directory override: ${dir}`);
      }
    }

    // Set user directory override if provided
    if ("userDir" in options) {
      const userDir = options["userDir"] as string | undefined;
      setUserDir(userDir);
      if (userDir) {
        CLI_LOGGER.debug(`User directory override: ${userDir}`);
      }
    }

    // Set user mode flag if provided
    if ("user" in options) {
      const user = options["user"] as boolean;
      setUserMode(user);
      if (user) {
        CLI_LOGGER.debug("User mode enabled: operating on user settings");
      }
    }

    // Set no-parent flag if provided
    if ("noParent" in options) {
      const noParent = options["noParent"] as boolean;
      setNoParentFlag(noParent);
      if (noParent) {
        CLI_LOGGER.debug(
          "No-parent flag enabled: config search will not climb parent directories"
        );
      }
    }
  })
  .addCommand(makeDebugCommand())
  .addCommand(makeEditCommand())
  .addCommand(makeHelpmeCommand())
  .addCommand(makeHostCommand())
  .addCommand(makeInitCommand())
  .addCommand(makeSchemaCommand())
  .addCommand(makeServerCommand())
  .addCommand(makeInstallCommand())
  .addCommand(makeOutdatedCommand())
  .addCommand(makeUpgradeCommand())
  .addCommand(makeRunCommand());

if (import.meta.main) {
  // Initialize logger with default "nice" format for TTY environments
  // This ensures configuration loading errors show nice formatting
  // The preAction hook will re-initialize based on CLI flags
  const defaultFormat: LogFormat =
    process.stdout.isTTY && process.env["MCPADRE_NON_INTERACTIVE"] !== "1"
      ? "nice"
      : "json";
  initializeLogger(
    defaultFormat,
    !process.stdout.isTTY || process.env["MCPADRE_NON_INTERACTIVE"] === "1"
  );

  rootCommand.parse(process.argv);
}
