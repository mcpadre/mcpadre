// pattern: Imperative Shell
// CLI command for checking outdated MCP servers

import { Command } from "@commander-js/extra-typings";
import Table from "cli-table3";
import Docker from "dockerode";

import { withProjectConfigAndErrorHandling } from "../cli-helpers/with-project-config-and-error-handling.js";
import { withUserConfigAndErrorHandling } from "../cli-helpers/with-user-config-and-error-handling.js";
import { checkAllOutdated } from "../installer/outdated/index.js";

import { CLI_LOGGER } from "./_deps.js";
import { isUserMode } from "./_globals.js";

import type { SettingsProject, SettingsUser } from "../config/types/index.js";
import type {
  OutdatedCheckOptions,
  OutdatedServerInfo,
} from "../installer/outdated/types.js";

interface OutdatedCommandOptions {
  json: boolean;
  skipAudit: boolean;
  outdatedOnly: boolean;
  serverName: string[];
  type: string[];
  cache: boolean;
}

/**
 * Create the 'mcpadre outdated' command
 */
export function makeOutdatedCommand(): Command {
  return new Command("outdated")
    .description("Check for outdated MCP servers and security vulnerabilities")
    .addHelpText(
      "before",
      `
Checks MCP servers for available updates and security vulnerabilities.

By default, checks servers in the current project. Use --user to check user-level servers instead.
This command checks package registries for newer versions and runs security audits when possible.
      `
    )
    .addHelpText(
      "after",
      `
Examples:
  mcpadre outdated                         Check project servers
  mcpadre outdated --user                  Check user servers
  mcpadre outdated --json                  Output as JSON
  mcpadre outdated --outdated-only         Show only outdated servers
  mcpadre outdated --server-name my-server Check specific server
      `
    )
    .option("--json", "Output results as JSON instead of table format", false)
    .option("--skip-audit", "Skip security vulnerability audits", false)
    .option(
      "--server-name <name>",
      "Check only the specified server (can be repeated)",
      collectIntoArray,
      []
    )
    .option(
      "--type <type>",
      "Filter by server type (node, python, container, shell, http)",
      collectIntoArray,
      []
    )
    .option(
      "--no-cache",
      "Skip cache and fetch fresh data from registries",
      false
    )
    .option("--outdated-only", "Show only servers that are outdated", false)
    .action((options, command) => {
      const userMode = isUserMode();

      if (userMode) {
        // User-level outdated check
        return withUserConfigAndErrorHandling(handleUserOutdated)(
          options,
          command
        );
      } else {
        // Project-level outdated check
        return withProjectConfigAndErrorHandling(handleProjectOutdated)(
          options,
          command
        );
      }
    });
}

/**
 * Helper function to collect repeated option values into an array
 */
function collectIntoArray(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * Handle user-level outdated check
 */
async function handleUserOutdated(
  _config: SettingsUser,
  userDir: string,
  _configPath: string,
  options: OutdatedCommandOptions,
  _command: Command
): Promise<void> {
  CLI_LOGGER.info("Checking user servers for outdated packages...");

  await runOutdatedLogic(userDir, options, "user");
}

/**
 * Handle project-level outdated check
 */
async function handleProjectOutdated(
  _config: SettingsProject,
  projectDir: string,
  _configPath: string,
  options: OutdatedCommandOptions,
  _command: Command
): Promise<void> {
  CLI_LOGGER.info("Checking project servers for outdated packages...");

  await runOutdatedLogic(projectDir, options, "project");
}

/**
 * Execute the outdated command logic
 */
async function runOutdatedLogic(
  workingDir: string,
  options: OutdatedCommandOptions,
  mode: "project" | "user"
): Promise<void> {
  CLI_LOGGER.debug(`Starting outdated check in ${workingDir} (${mode} mode)`);

  // Initialize Docker client for container checks
  const docker = new Docker();

  // Prepare check options
  const checkOptions: OutdatedCheckOptions = {
    includeAudit: !options.skipAudit,
    skipCache: !options.cache,
    ...(options.serverName.length > 0 && { serverNames: options.serverName }),
    ...(options.type.length > 0 && {
      serverTypes: options.type as (
        | "node"
        | "python"
        | "container"
        | "shell"
        | "http"
      )[],
    }),
  };

  try {
    // Run the outdated check
    const result = await checkAllOutdated(
      workingDir,
      docker,
      CLI_LOGGER,
      checkOptions
    );

    // Apply filtering if requested
    const serversToShow = options.outdatedOnly
      ? result.servers.filter(server => server.isOutdated)
      : result.servers;

    if (options.json) {
      // JSON output mode with filtered results
      const filteredResult = {
        ...result,
        servers: serversToShow,
      };
      process.stdout.write(`${JSON.stringify(filteredResult, null, 2)}\n`);
    } else {
      // Interactive table mode with filtered results
      displayInteractiveResults(serversToShow, result.summary);
    }

    // Exit with non-zero code if there are outdated packages or errors
    if (result.summary.outdated > 0 || result.summary.errors > 0) {
      process.exit(1);
    }
  } catch (error) {
    CLI_LOGGER.error("Failed to check for outdated packages:");
    CLI_LOGGER.error(error);
    process.exit(1);
  }
}

/**
 * Display results in interactive table format
 */
function displayInteractiveResults(
  servers: OutdatedServerInfo[],
  summary: {
    total: number;
    outdated: number;
    withVulnerabilities: number;
    errors: number;
  }
): void {
  if (servers.length === 0) {
    process.stdout.write("No MCP servers found in project configuration.\n");
    return;
  }

  // Create table with headers
  const table = new Table({
    head: ["Server", "Type", "Current", "Latest", "Status", "Audit"],
    colWidths: [20, 10, 15, 15, 15, 15],
    wordWrap: true,
  });

  // Add rows for each server
  for (const server of servers) {
    const row = [
      server.serverName,
      server.serverType,
      formatVersion(server.currentVersion),
      formatVersion(server.latestVersion ?? "N/A"),
      formatStatus(server),
      formatAudit(server),
    ];
    table.push(row);
  }

  // Display table
  // eslint-disable-next-line no-console
  console.log(table.toString());

  // Display summary
  // eslint-disable-next-line no-console
  console.log();
  // eslint-disable-next-line no-console
  console.log(`Summary: ${summary.total} servers checked`);

  if (summary.outdated > 0) {
    // eslint-disable-next-line no-console
    console.log(`  🔄 ${summary.outdated} outdated`);
  }

  if (summary.withVulnerabilities > 0) {
    // eslint-disable-next-line no-console
    console.log(`  ⚠️  ${summary.withVulnerabilities} with vulnerabilities`);
  }

  if (summary.errors > 0) {
    // eslint-disable-next-line no-console
    console.log(`  ❌ ${summary.errors} errors`);
  }

  if (
    summary.outdated === 0 &&
    summary.withVulnerabilities === 0 &&
    summary.errors === 0
  ) {
    // eslint-disable-next-line no-console
    console.log("  ✅ All servers are up to date");
  }
}

/**
 * Format version string for display
 */
function formatVersion(version: string): string {
  if (version.length > 12) {
    return `${version.substring(0, 9)}...`;
  }
  return version;
}

/**
 * Format status column based on server state
 */
function formatStatus(server: OutdatedServerInfo): string {
  if (server.error) {
    // Special handling for container-specific errors
    if (server.serverType === "container") {
      if (server.error.includes("not installed yet")) {
        return "Not installed";
      }
      if (server.error.includes("Failed to get remote digest")) {
        return "Registry error";
      }
    }
    return "Error";
  }

  if (!server.isOutdated) {
    return "Current";
  }

  // Handle different types of updates
  if (server.upgradeType) {
    switch (server.upgradeType) {
      case "major":
        return "Major update";
      case "minor":
        return "Minor update";
      case "patch":
        return "Patch update";
    }
  }

  if (server.digestInfo?.digestChanged) {
    return "Digest diff";
  }

  return "Outdated";
}

/**
 * Format audit column based on security scan results
 */
function formatAudit(server: OutdatedServerInfo): string {
  if (!server.auditInfo) {
    return server.serverType === "container" ? "-" : "Not checked";
  }

  // Check if server not installed yet
  if (server.auditInfo.message === "Server not installed yet") {
    return "Not installed";
  }

  // Check if audit failed (message starts with "Audit check failed:")
  if (server.auditInfo.message?.startsWith("Audit check failed:")) {
    return "❌ Audit failed";
  }

  if (server.auditInfo.hasVulnerabilities) {
    const count = server.auditInfo.vulnerabilityCount ?? 0;
    const severity = server.auditInfo.severity ?? "unknown";

    const emoji = getSeverityEmoji(severity);
    return `${emoji} ${count} ${severity}`;
  }

  return "✓ No issues found";
}

/**
 * Get emoji for vulnerability severity
 */
function getSeverityEmoji(severity: string): string {
  switch (severity) {
    case "critical":
      return "🔴";
    case "high":
      return "🟠";
    case "moderate":
      return "🟡";
    case "low":
      return "🔵";
    default:
      return "⚠️";
  }
}
