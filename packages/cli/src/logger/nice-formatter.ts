// pattern: Functional Core

import chalk from "chalk";

interface LogObject {
  level: number;
  msg?: string;
  err?: unknown;
  [key: string]: unknown;
}

/**
 * Format log objects nicely for console output
 */
export function formatLogMessage(logStr: string): string {
  try {
    const logObj: LogObject = JSON.parse(logStr);

    const {
      level,
      msg,
      err,
      time: _time,
      pid: _pid,
      hostname: _hostname,
      name: _name,
      ...extra
    } = logObj;

    // Map pino levels to display format
    let levelDisplay = "";
    let msgColor: (typeof chalk)["red"] = chalk.reset;

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

    // Format the message
    const formattedMsg = msgColor(msg ?? "");

    // Handle error objects specially
    let errorStr = "";
    if (err && typeof err === "object") {
      const errorLike = err as { message?: string; stack?: string[] };
      if (errorLike.message) {
        errorStr += `\n${chalk.yellow(`    ${errorLike.message}`)}`;
      }
      if (errorLike.stack && Array.isArray(errorLike.stack)) {
        for (const line of errorLike.stack) {
          if (line.trim()) {
            errorStr += `\n${chalk.dim(chalk.yellow(`        ${line.trim()}`))}`;
          }
        }
      }
    }

    // Add remaining extra fields if present
    const extraStr =
      Object.keys(extra).length > 0
        ? ` ${chalk.dim(JSON.stringify(extra))}`
        : "";

    return `${levelDisplay} ${formattedMsg}${extraStr}${errorStr}`;
  } catch {
    // If we can't parse it, just return it as-is
    return logStr;
  }
}
