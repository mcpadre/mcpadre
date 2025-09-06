// pattern: Imperative Shell
// CLI command for generating diagnostic reports for GitHub issues

import { Command } from "@commander-js/extra-typings";

import {
  collectSystemInfo,
  detectTools,
  type DiagnosticReport,
  formatDiagnosticReport,
  testDockerStatus,
  testSandboxCapabilities,
  validateConfigs,
} from "../diagnostics/index.js";

import { CLI_LOGGER } from "./_deps.js";

// Generate a complete diagnostic report
async function generateDiagnosticReport(): Promise<DiagnosticReport> {
  CLI_LOGGER.info("Collecting system information...");

  // Run all diagnostic tests in parallel for faster execution
  const [system, tools, sandbox, docker, config] = await Promise.allSettled([
    collectSystemInfo(),
    detectTools(),
    testSandboxCapabilities(),
    testDockerStatus(),
    validateConfigs(),
  ]);

  // Process results, using defaults for any failures
  const report: DiagnosticReport = {
    timestamp: new Date().toISOString(),
    system:
      system.status === "fulfilled"
        ? system.value
        : {
            mcpadre: { version: "unknown" },
            nodejs: { version: process.version },
            os: {
              type: "unknown",
              platform: "unknown",
              arch: "unknown",
              version: "unknown",
            },
            packageManager: {},
            workingDirectory: {
              hasProjectConfig: false,
              isGitRepository: false,
            },
          },
    tools: tools.status === "fulfilled" ? tools.value : [],
    sandbox:
      sandbox.status === "fulfilled" ? sandbox.value : { platform: "unknown" },
    docker:
      docker.status === "fulfilled"
        ? docker.value
        : {
            available: false,
            daemon: { running: false, error: "Diagnostic failed" },
          },
    config:
      config.status === "fulfilled"
        ? config.value
        : {
            userConfig: {
              exists: false,
              valid: false,
              error: "Diagnostic failed",
            },
            projectConfig: {
              exists: false,
              valid: false,
              error: "Diagnostic failed",
            },
          },
  };

  // Log any diagnostic failures at debug level
  if (system.status === "rejected") {
    CLI_LOGGER.debug("System info collection failed:", system.reason);
  }
  if (tools.status === "rejected") {
    CLI_LOGGER.debug("Tool detection failed:", tools.reason);
  }
  if (sandbox.status === "rejected") {
    CLI_LOGGER.debug("Sandbox testing failed:", sandbox.reason);
  }
  if (docker.status === "rejected") {
    CLI_LOGGER.debug("Docker testing failed:", docker.reason);
  }
  if (config.status === "rejected") {
    CLI_LOGGER.debug("Config validation failed:", config.reason);
  }

  return report;
}

// Main helpme command implementation
export async function helpmeCli(): Promise<void> {
  try {
    CLI_LOGGER.info("🔍 Generating diagnostic report for GitHub issue...");

    const report = await generateDiagnosticReport();
    const formattedReport = formatDiagnosticReport(report);

    CLI_LOGGER.info("✅ Diagnostic report generated successfully!\n");

    // Output the formatted report
    // eslint-disable-next-line no-console
    console.log(formattedReport);
  } catch (error) {
    CLI_LOGGER.error("Failed to generate diagnostic report:");
    CLI_LOGGER.error(error);
    process.exit(1);
  }
}

// Command factory function
export function makeHelpmeCommand(): Command {
  return new Command("helpme")
    .description("Generate a diagnostic report for GitHub issues")
    .action(helpmeCli);
}
