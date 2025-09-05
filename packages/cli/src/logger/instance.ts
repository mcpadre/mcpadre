// pattern: Imperative Shell

import pino from "pino";
import { type Level as LogLevel } from "pino";

import { createLogger, mapLogLevelToPinoLevel } from "./config.js";
import { type LogFormat } from "./types.js";

// Global logger instance
let LOGGER: pino.Logger | undefined;

// Initialize logger with format and interactive preferences
export function initializeLogger(
  format: LogFormat,
  nonInteractive: boolean
): void {
  LOGGER = createLogger(format, nonInteractive);
}

// Set the log level on the global logger
export function setCliLogLevel(logLevel: LogLevel): void {
  if (!LOGGER) {
    throw new Error("Logger not initialized. Call initializeLogger() first.");
  }
  LOGGER.level = mapLogLevelToPinoLevel(logLevel);
}

// Create a proxy object that always refers to the current logger instance
export const CLI_LOGGER = new Proxy({} as pino.Logger, {
  get(_target, prop) {
    if (!LOGGER) {
      throw new Error("Logger not initialized. Call initializeLogger() first.");
    }
    const value = LOGGER[prop as keyof pino.Logger];
    if (typeof value === "function") {
      return value.bind(LOGGER);
    }
    return value;
  },
});
