// pattern: Functional Core

import pino, { type Level } from "pino";

import createRenderer from "./renderer.js";
import { type LogFormat } from "./types.js";

// Map our LogLevel enum to pino's string levels
export function mapLogLevelToPinoLevel(logLevel: Level): pino.LevelWithSilent {
  switch (logLevel) {
    case "error":
      return "error";
    case "warn":
      return "warn";
    case "info":
      return "info";
    case "debug":
      return "debug";
    case "trace":
      return "trace";
    default:
      return "info";
  }
}

// Create pino logger with stream configuration
export function createLogger(
  format: LogFormat,
  nonInteractive: boolean
): pino.Logger {
  const baseConfig: pino.LoggerOptions = {
    name: "mcpadre",
    level: "info", // Default level
    // Custom serializer for error objects to make them more readable
    serializers: {
      err: (err: unknown) => {
        if (!err || typeof err !== "object") return err;

        // Type guard to check if it's an error-like object
        const errorLike = err as { message?: string; stack?: string };

        // For nice format, we'll format this specially in the CLI_LOGGER usage
        if (format === "nice" && !nonInteractive) {
          return {
            message: errorLike.message,
            stack: errorLike.stack
              ? errorLike.stack.split("\n").slice(1, 9)
              : undefined,
          };
        }

        // For JSON format, use standard pino error serialization
        // Cast to Error for pino serializer compatibility
        return pino.stdSerializers.err(err as Error);
      },
    },
  };

  // Use appropriate stream based on format
  let stream;
  if (format === "nice") {
    // For nice format, use the renderer to convert JSON to nice format
    const renderer = createRenderer({ colorize: !nonInteractive });
    renderer.pipe(process.stderr);
    stream = renderer;
  } else {
    // For JSON format, output JSON directly to stderr
    stream = pino.destination(2); // stderr
  }

  return pino(baseConfig, stream);
}
