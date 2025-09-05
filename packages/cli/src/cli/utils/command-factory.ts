// pattern: Factory

/**
 * Utility functions to reduce boilerplate in CLI command definitions
 *
 * These helpers provide consistent patterns for common command structures
 * without fighting Commander.js typing system.
 */

/**
 * Standard help text patterns for command examples
 */
export const HelpTextPatterns = {
  /**
   * Creates standard "Examples:" section for help text
   */
  examples: (examples: string[]): string => `
Examples:
${examples.map(ex => `  ${ex}`).join("\n")}
      `,

  /**
   * Creates standard before-help text with description and details
   */
  beforeHelp: (description: string, details?: string[]): string => {
    let text = `\n${description}\n`;
    if (details) {
      text += `\n${details.join("\n")}\n`;
    }
    return `${text}      `;
  },
};

/**
 * Common command argument patterns
 */
export const CommonArguments = {
  serverName: "<server-name>" as const,
  hostName: "<host-name>" as const,
} as const;

/**
 * Common command option patterns
 */
export const CommonOptions = {
  yes: ["-y, --yes", "Skip confirmation prompt"] as const,
  all: ["--all", "Apply to all items"] as const,
} as const;
