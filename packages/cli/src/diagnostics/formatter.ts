// pattern: Functional Core
// GitHub issue-friendly diagnostic report formatting

import type {
  DiagnosticReport,
  DockerStatus,
  SandboxCapabilities,
  SystemInfo,
  ToolStatus,
} from "./types.js";

// Format system information section
function formatSystemInfo(system: SystemInfo): string {
  const lines: string[] = [];

  lines.push("## System Information");
  lines.push("");
  lines.push(`- **mcpadre**: ${system.mcpadre.version}`);
  lines.push(`- **Node.js**: ${system.nodejs.version}`);
  lines.push(
    `- **OS**: ${system.os.type} ${system.os.arch} (${system.os.version})`
  );

  if (system.os.distribution) {
    lines.push(`- **Distribution**: ${system.os.distribution}`);
  }

  lines.push("");

  // Package managers
  lines.push("### Package Managers");
  lines.push("");
  if (system.packageManager.pnpm) {
    lines.push(`- **pnpm**: ${system.packageManager.pnpm}`);
  }
  if (system.packageManager.npm) {
    lines.push(`- **npm**: ${system.packageManager.npm}`);
  }
  if (!system.packageManager.pnpm && !system.packageManager.npm) {
    lines.push("- No package managers detected");
  }
  lines.push("");

  // Working directory context
  lines.push("### Working Directory");
  lines.push("");
  lines.push(
    `- **Project config**: ${system.workingDirectory.hasProjectConfig ? "✅ Found" : "❌ Not found"}`
  );
  lines.push(
    `- **Git repository**: ${system.workingDirectory.isGitRepository ? "✅ Yes" : "❌ No"}`
  );

  return lines.join("\n");
}

// Format individual tool status
function formatToolStatus(tool: ToolStatus): string {
  const status = tool.available ? "✅" : "❌";
  let line = `- **${tool.name}**: ${status}`;

  if (tool.available && tool.version) {
    line += ` ${tool.version}`;
  }

  if (!tool.available) {
    if (tool.versionManager) {
      const vm = tool.versionManager;
      line += ` (${vm.type} detected, project version: ${vm.hasProjectVersion ? "set" : "not set"})`;
    } else if (tool.error) {
      // Truncate long error messages for readability
      const shortError =
        tool.error.length > 80
          ? `${tool.error.substring(0, 80)}...`
          : tool.error;
      line += ` - ${shortError}`;
    }
  }

  return line;
}

// Format tools section
function formatTools(tools: ToolStatus[]): string {
  const lines: string[] = [];

  lines.push("## Development Tools");
  lines.push("");

  for (const tool of tools) {
    lines.push(formatToolStatus(tool));
  }

  return lines.join("\n");
}

// Format sandbox capabilities
function formatSandboxCapabilities(sandbox: SandboxCapabilities): string {
  const lines: string[] = [];

  lines.push("## Sandbox Capabilities");
  lines.push("");
  lines.push(`- **Platform**: ${sandbox.platform}`);
  lines.push("");

  if (sandbox.bubblewrap) {
    const bw = sandbox.bubblewrap;
    const status = bw.available ? "✅" : "❌";
    const version = bw.version ? ` ${bw.version}` : "";
    const funcTest = bw.functionalTest.passed ? "✅" : "❌";

    lines.push(`### Bubblewrap (Linux)`);
    lines.push(`- **Available**: ${status}${version}`);
    lines.push(`- **Functional Test**: ${funcTest}`);

    if (!bw.functionalTest.passed && bw.functionalTest.error) {
      lines.push(`- **Error**: ${bw.functionalTest.error}`);
    }
  }

  if (sandbox.sandboxExec) {
    const se = sandbox.sandboxExec;
    const status = se.available ? "✅" : "❌";
    const funcTest = se.functionalTest.passed ? "✅" : "❌";

    lines.push(`### sandbox-exec (macOS)`);
    lines.push(`- **Available**: ${status}`);
    lines.push(`- **Functional Test**: ${funcTest}`);

    if (!se.functionalTest.passed && se.functionalTest.error) {
      lines.push(`- **Error**: ${se.functionalTest.error}`);
    }
  }

  if (!sandbox.bubblewrap && !sandbox.sandboxExec) {
    lines.push("- No sandbox capabilities detected for this platform");
  }

  return lines.join("\n");
}

// Format Docker status
function formatDockerStatus(docker: DockerStatus): string {
  const lines: string[] = [];

  lines.push("## Docker Status");
  lines.push("");

  const status = docker.available ? "✅" : "❌";
  const version = docker.version ? ` ${docker.version}` : "";
  lines.push(`- **Docker CLI**: ${status}${version}`);

  if (docker.available) {
    const daemonStatus = docker.daemon.running ? "✅" : "❌";
    lines.push(`- **Docker Daemon**: ${daemonStatus}`);

    if (!docker.daemon.running && docker.daemon.error) {
      lines.push(`- **Daemon Error**: ${docker.daemon.error}`);
    }
  }

  return lines.join("\n");
}

// Format configuration validation
function formatConfigValidation(config: DiagnosticReport["config"]): string {
  const lines: string[] = [];

  lines.push("## Configuration Status");
  lines.push("");

  // User config
  const userStatus =
    config.userConfig.exists && config.userConfig.valid ? "✅" : "❌";
  lines.push(`- **User Config**: ${userStatus}`);
  if (
    config.userConfig.exists &&
    !config.userConfig.valid &&
    config.userConfig.error
  ) {
    lines.push(`  - Error: ${config.userConfig.error}`);
  } else if (!config.userConfig.exists) {
    lines.push(`  - Not found`);
  }

  // Project config
  const projectStatus =
    config.projectConfig.exists && config.projectConfig.valid ? "✅" : "❌";
  lines.push(`- **Project Config**: ${projectStatus}`);
  if (
    config.projectConfig.exists &&
    !config.projectConfig.valid &&
    config.projectConfig.error
  ) {
    lines.push(`  - Error: ${config.projectConfig.error}`);
  } else if (!config.projectConfig.exists) {
    lines.push(`  - Not found`);
  }

  return lines.join("\n");
}

// Main formatter function
export function formatDiagnosticReport(report: DiagnosticReport): string {
  const lines: string[] = [];

  lines.push("# mcpadre Diagnostic Report");
  lines.push("");
  lines.push(`**Generated**: ${report.timestamp}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // System information
  lines.push(formatSystemInfo(report.system));
  lines.push("");

  // Development tools
  lines.push(formatTools(report.tools));
  lines.push("");

  // Sandbox capabilities
  lines.push(formatSandboxCapabilities(report.sandbox));
  lines.push("");

  // Docker status
  lines.push(formatDockerStatus(report.docker));
  lines.push("");

  // Configuration validation
  lines.push(formatConfigValidation(report.config));
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push(
    "*This report contains diagnostic information to help troubleshoot mcpadre issues.*"
  );
  lines.push("*No sensitive configuration data is included.*");

  return lines.join("\n");
}
