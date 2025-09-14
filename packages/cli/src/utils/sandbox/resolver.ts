// pattern: Functional Core
// Resolves SandboxConfig templates to FinalizedSandboxConfig with actual paths.

import { existsSync } from "node:fs";

import { resolvePathTemplates } from "../path-resolver/index.js";

import type { PathStringTemplate } from "../../config/types/utils.js";
import type { DirectoryResolver } from "../../runner/directory-resolver/index.js";
import type { FinalizedSandboxConfig, SandboxConfig } from "./types.js";

/**
 * Options for resolving sandbox configuration
 */
export interface SandboxResolverOptions {
  /** Raw sandbox configuration with template strings */
  config: SandboxConfig;
  /** Directory resolver providing system and workspace paths */
  directoryResolver: DirectoryResolver;
  /** Parent environment variables (usually process.env) */
  parentEnv: Record<string, string | undefined>;
  /** Workspace-level options that affect sandbox configuration */
  workspaceOptions?: {
    /** If true, disables sandboxing for all servers */
    disableAllSandboxes?: boolean;
    /** Additional paths that all servers can read+execute */
    extraAllowRead?: PathStringTemplate[];
    /** Additional paths that all servers can read+write+execute */
    extraAllowWrite?: PathStringTemplate[];
  };
}

/**
 * Default system paths that should be readable in sandboxes
 */
const DEFAULT_SYSTEM_PATHS = [
  "/bin",
  "/usr/bin",
  "/lib",
  "/lib64",
  "/usr/lib",
  "/usr/lib64",
  "/usr/share",
  "/System/Library",
];

/**
 * DNS and network configuration files needed when networking is enabled
 */
const DNS_PATHS = ["/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf"];

/**
 * Resolves a SandboxConfig with template strings to a FinalizedSandboxConfig
 * with resolved paths. Uses the same template variables as env resolution:
 * - {{dirs.*}} for directory paths
 * - {{parentEnv.*}} for environment variables
 *
 * @param options Resolution options including config and template variables
 * @returns Finalized config with all paths resolved
 */
export function resolveSandboxConfig(
  options: SandboxResolverOptions
): FinalizedSandboxConfig {
  const { config, directoryResolver, parentEnv, workspaceOptions } = options;

  // Check if sandboxing is globally disabled
  const isEnabled = workspaceOptions?.disableAllSandboxes
    ? false
    : config.enabled;

  // Prepare resolver options for path resolution
  const pathResolverOptions = {
    directoryResolver,
    parentEnv,
  };

  // Start with user-provided paths
  const allowReadTemplates = [...config.allowRead];
  const allowReadWriteTemplates = [...config.allowReadWrite];

  // Add workspace-level extra paths if provided
  if (workspaceOptions?.extraAllowRead) {
    allowReadTemplates.push(...workspaceOptions.extraAllowRead);
  }
  if (workspaceOptions?.extraAllowWrite) {
    allowReadWriteTemplates.push(...workspaceOptions.extraAllowWrite);
  }

  // Add workspace path if not omitted
  if (!config.omitWorkspacePath) {
    // Use workspace directory for both user and project modes
    // (WorkspaceContext now handles the correct workspace path for both modes)
    const dirTemplate = "{{dirs.workspace}}";
    allowReadTemplates.push(dirTemplate as PathStringTemplate);
  }

  // Always add system paths for bash compatibility
  for (const systemPath of DEFAULT_SYSTEM_PATHS) {
    if (existsSync(systemPath)) {
      allowReadTemplates.push(systemPath);
    }
  }

  // Add user's shell to allowRead
  let shell: string;
  if (process.platform === "win32") {
    // On Windows, detect PowerShell vs CMD based on COMSPEC
    const comspec = parentEnv["COMSPEC"];

    // COMSPEC typically points to cmd.exe by default
    // If it contains 'cmd', use cmd.exe; otherwise prefer PowerShell
    if (comspec?.toLowerCase().includes("cmd")) {
      shell = "cmd.exe";
    } else {
      // Default to PowerShell if COMSPEC is unset or points to PowerShell
      shell = "powershell.exe";
    }
  } else {
    // Unix/macOS: use SHELL or fallback to /bin/sh
    shell = parentEnv["SHELL"] ?? "/bin/sh";
  }

  if (existsSync(shell)) {
    allowReadTemplates.push(shell);
  }

  // Add OS temp directory for tempfile access (needs read+write for UV and other tools)
  allowReadWriteTemplates.push("{{parentEnv.TMPDIR}}" as PathStringTemplate);
  allowReadWriteTemplates.push("{{parentEnv.TEMP}}" as PathStringTemplate);
  allowReadWriteTemplates.push("{{parentEnv.TMP}}" as PathStringTemplate);
  allowReadWriteTemplates.push("/tmp"); // fallback for Unix systems

  // Add DNS files when networking is enabled
  if (config.networking) {
    for (const dnsPath of DNS_PATHS) {
      if (existsSync(dnsPath)) {
        allowReadTemplates.push(dnsPath);
      }
    }
  }

  // Resolve all paths
  const allowRead = resolvePathTemplates(
    allowReadTemplates,
    pathResolverOptions
  );
  const allowReadWrite = resolvePathTemplates(
    allowReadWriteTemplates,
    pathResolverOptions
  );

  return {
    enabled: isEnabled,
    networking: config.networking,
    allowRead,
    allowReadWrite,
  };
}
