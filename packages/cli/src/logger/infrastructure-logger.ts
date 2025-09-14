// pattern: Imperative Shell

import { mkdir } from "fs/promises";
import { join } from "path";
import pino from "pino";

import type { WorkspaceContext } from "../config/types/index.js";

/**
 * Creates an infrastructure logger for mcpadre run command.
 *
 * Behavior:
 * - If TTY (interactive terminal): Writes to stderr only
 * - If NOT TTY (run by host): Writes to .mcpadre/logs/servername_timestamp.log
 *
 * IMPORTANT: This should ONLY be used by the run command after config validation.
 * All other commands should use the regular CLI_LOGGER that only writes to stderr.
 *
 * @param context The validated workspace context
 * @param serverName The name of the server being run
 * @param baseLogger The existing CLI logger to get current log level
 * @returns A pino logger configured based on TTY status
 */
export async function createInfrastructureLogger(
  context: WorkspaceContext,
  serverName: string,
  baseLogger: pino.Logger
): Promise<pino.Logger> {
  // Check if we're in a TTY environment
  // Note: process.stderr.isTTY will be undefined when pipes are used
  const isTTY = process.stderr.isTTY === true;

  // In test environments, we need to see output for assertions
  // So we always use stderr logger in tests, but still create the log file
  const isTest = process.env["NODE_ENV"] === "test" || process.env["VITEST"];

  if (isTTY) {
    // Running interactively - just return the existing logger that writes to stderr
    return baseLogger;
  }

  // NOT a TTY - create file logger for host access
  const logsDir = join(context.workspaceDir, ".mcpadre", "logs");
  await mkdir(logsDir, { recursive: true });

  // Create log file with server name and timestamp
  const timestamp = new Date().toISOString();
  const logFilePath = join(logsDir, `${serverName}_${timestamp}.log`);

  if (isTest) {
    // In test mode, write to BOTH stderr (for test assertions) and file (to verify file creation)
    const logger = pino({
      name: "mcpadre-run",
      level: baseLogger.level,
      transport: {
        targets: [
          {
            // Write to stderr for test visibility
            target: "pino/file",
            options: { destination: 2 }, // 2 = stderr
            level: baseLogger.level,
          },
          {
            // Write to file for testing file creation
            target: "pino/file",
            options: { destination: logFilePath },
            level: baseLogger.level,
          },
        ],
      },
    });
    return logger;
  }

  // Production non-TTY mode: write ONLY to file
  const logger = pino(
    {
      name: "mcpadre-run",
      level: baseLogger.level,
    },
    pino.destination({
      dest: logFilePath,
      sync: false, // Async for better performance
    })
  );

  return logger;
}
