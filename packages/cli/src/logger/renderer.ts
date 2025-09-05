/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
// pattern: Functional Core

import chalk from "chalk";
import { Transform } from "stream";

// Pino log object interface
interface PinoLogObject {
  level: number;
  time: number;
  pid: number;
  hostname: string;
  msg?: string;
  [key: string]: unknown;
}

// Renderer options interface
interface RendererOptions {
  colorize?: boolean;
  [key: string]: unknown;
}

// Format error object with stack trace
function formatErrorObject(err: unknown): string {
  if (!err || typeof err !== "object") {
    return "";
  }

  const errorLike = err as { message?: string; stack?: string };
  const lines = [];

  // Add error message with indentation
  if (errorLike.message) {
    lines.push(chalk.yellow(`    ${errorLike.message}`));
  }

  // Add stack trace with deeper indentation, limited to 8 lines
  if (errorLike.stack && typeof errorLike.stack === "string") {
    const stackLines = errorLike.stack.split("\n");
    const stackToShow = stackLines.slice(1, 9); // Skip first line (message) and limit to 8 lines

    for (const line of stackToShow) {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        lines.push(chalk.dim(chalk.yellow(`        ${trimmedLine}`)));
      }
    }
  }

  return lines.length > 0 ? `\n${lines.join("\n")}` : "";
}

// Format a single log object to a nice string
function formatLogObject(logObj: PinoLogObject): string {
  const { level, time, msg, pid, hostname, emoji, err, ...extra } = logObj;

  delete extra["name"];

  // Map pino levels to display format
  let levelDisplay = "";
  let msgColor: (typeof chalk)["red"] = chalk.reset;

  if (emoji) {
    levelDisplay = emoji as string;
  } else {
    switch (level) {
      case 10: // trace
        levelDisplay = chalk.green("+");
        break;
      case 20: // debug
        levelDisplay = chalk.cyan("=");
        break;
      case 30: // info
        levelDisplay = chalk.gray(">");
        break;
      case 40: // warn
        levelDisplay = chalk.yellowBright("W");
        msgColor = chalk.yellow;
        break;
      case 50: // error
        levelDisplay = chalk.inverse.red("E");
        msgColor = chalk.red;
        break;
      case 60: // fatal
        levelDisplay = chalk.inverse.redBright("E");
        msgColor = chalk.red;
        break;
      default:
        levelDisplay = chalk.gray("  LOG  ");
    }
  }

  // Format the message
  const formattedMsg = msgColor(msg ?? "");

  // Handle error objects specially
  const errorStr = err ? formatErrorObject(err) : "";

  // Add remaining extra fields if present (excluding error which we handle specially)
  const extraStr =
    Object.keys(extra).length > 0 ? ` ${chalk.dim(JSON.stringify(extra))}` : "";

  return `${levelDisplay} ${formattedMsg}${extraStr}${errorStr}\n`;
}

// Create a pretty renderer stream like pino-pretty
export default function createRenderer(_options: RendererOptions = {}) {
  return new Transform({
    objectMode: false, // Pino sends newline-delimited JSON strings, not objects
    transform(chunk, _encoding, callback) {
      try {
        const chunkStr = chunk.toString();
        const lines = chunkStr.split("\n");
        const formattedLines: string[] = [];

        for (const line of lines) {
          if (line.trim()) {
            try {
              const logObj: PinoLogObject = JSON.parse(line);
              const formatted = formatLogObject(logObj);
              formattedLines.push(formatted);
            } catch {
              // If we can't parse a line, pass it through as-is
              formattedLines.push(`${line}\n`);
            }
          }
        }

        callback(null, formattedLines.join(""));
      } catch (error) {
        // If we can't process it, just pass it through
        callback(null, chunk);
      }
    },
  });
}
