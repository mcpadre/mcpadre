// pattern: Imperative Shell

import { CLI_LOGGER } from "../_deps.js";

import { analyzeError } from "./error-analysis.js";

/**
 * Higher-order function that wraps Commander.js actions with consistent error handling
 *
 * This HOF provides centralized error handling for CLI commands by:
 * 1. Catching all errors from wrapped actions
 * 2. Using the error analysis utility to provide user-friendly error messages
 * 3. Handling debug logging when --log-level debug is enabled
 * 4. Ensuring proper process exit codes
 *
 * @param action The action function to wrap with error handling
 * @returns Wrapped action function with consistent error handling
 */
export function withErrorHandling<T extends unknown[]>(
  action: (...args: T) => Promise<void> | void
): (...args: T) => Promise<void> {
  return async (...args: T): Promise<void> => {
    try {
      await action(...args);
    } catch (error) {
      // Check if we're in debug mode by checking if debug level is enabled
      // This is more reliable than trying to extract command options when functions are wrapped
      const isDebugMode = CLI_LOGGER.isLevelEnabled("debug");

      // Analyze the error to get structured information
      const analyzed = analyzeError(error);

      // Log user-friendly error message (unless it's empty for silent cancellation)
      if (analyzed.userMessage) {
        CLI_LOGGER.error(analyzed.userMessage);
      }

      // Provide suggestions
      if (analyzed.suggestions.length > 0) {
        analyzed.suggestions.forEach(suggestion => {
          CLI_LOGGER.error(`  • ${suggestion}`);
        });
      }

      // Show technical details in debug mode
      if (isDebugMode) {
        CLI_LOGGER.debug("Technical error details:");
        CLI_LOGGER.debug(analyzed.technicalMessage);
        if (error instanceof Error && error.stack) {
          CLI_LOGGER.debug("Stack trace:");
          CLI_LOGGER.debug(error.stack);
        }
        CLI_LOGGER.debug({ error, analyzed }, "Full error analysis");
      }

      // Ensure logs are flushed before exit
      CLI_LOGGER.flush();

      // Exit with error code
      setTimeout(() => {
        process.exit(1);
      }, 100);
    }
  };
}
