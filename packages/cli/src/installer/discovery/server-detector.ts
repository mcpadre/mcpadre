// pattern: Functional Core

import { readdir } from "fs/promises";
import { join } from "path";

import type { WorkspaceContext } from "../../config/types/index.js";
import type { HostConfigSpec } from "../updaters/generic-updater.js";

/**
 * Classification results for servers found in host configurations
 */
export interface ServerClassification {
  /** Servers managed by mcpadre that are in the current mcpadre.yaml config */
  mcpadreManaged: string[];
  /** Servers with mcpadre signature but NOT in current mcpadre.yaml config (orphaned) */
  mcpadreOrphaned: string[];
  /** Servers not managed by mcpadre (external servers) */
  external: string[];
}

/**
 * Results from analyzing server directories on disk
 */
export interface ServerDirectoryAnalysis {
  /** Directories in .mcpadre/servers/ that don't correspond to current config servers */
  orphanedDirectories: string[];
}

/**
 * Server entry structure for different host formats
 */
type ServerEntry = Record<string, unknown>;

/**
 * Checks if a server entry matches the mcpadre signature for the given host format
 *
 * @param serverEntry The server configuration entry from host config
 * @param hostFormat The host configuration format (simple, stdio, zed)
 * @returns true if this is a mcpadre-managed server
 */
export function isMcpadreServer(
  serverEntry: ServerEntry,
  hostFormat: "simple" | "stdio" | "zed" | "opencode"
): boolean {
  if (typeof serverEntry !== "object") {
    return false;
  }

  switch (hostFormat) {
    case "simple":
      // Format: { command: "mcpadre", args: ["run", "serverName"] }
      return (
        serverEntry["command"] === "mcpadre" &&
        Array.isArray(serverEntry["args"]) &&
        serverEntry["args"].length >= 1 &&
        serverEntry["args"][0] === "run"
      );

    case "stdio":
      // Format: { type: "stdio", command: "mcpadre", args: ["run", "serverName"] }
      return (
        serverEntry["type"] === "stdio" &&
        serverEntry["command"] === "mcpadre" &&
        Array.isArray(serverEntry["args"]) &&
        serverEntry["args"].length >= 1 &&
        serverEntry["args"][0] === "run"
      );

    case "zed":
      // Format: { command: { path: "mcpadre", args: ["run", "serverName"] } }
      return (
        typeof serverEntry["command"] === "object" &&
        serverEntry["command"] !== null &&
        "path" in serverEntry["command"] &&
        "args" in serverEntry["command"] &&
        (serverEntry["command"] as Record<string, unknown>)["path"] ===
          "mcpadre" &&
        Array.isArray(
          (serverEntry["command"] as Record<string, unknown>)["args"]
        ) &&
        (
          (serverEntry["command"] as Record<string, unknown>)[
            "args"
          ] as unknown[]
        ).length >= 1 &&
        (
          (serverEntry["command"] as Record<string, unknown>)[
            "args"
          ] as unknown[]
        )[0] === "run"
      );

    case "opencode":
      // Format: { type: "local", command: ["mcpadre", "run", "serverName"], enabled: boolean }
      return (
        serverEntry["type"] === "local" &&
        Array.isArray(serverEntry["command"]) &&
        serverEntry["command"].length >= 2 &&
        serverEntry["command"][0] === "mcpadre" &&
        serverEntry["command"][1] === "run"
      );

    default:
      return false;
  }
}

/**
 * Extracts the server name from a mcpadre server entry's args
 *
 * @param serverEntry The server configuration entry
 * @param hostFormat The host configuration format
 * @returns The server name if this is a valid mcpadre server, null otherwise
 */
export function extractMcpadreServerName(
  serverEntry: ServerEntry,
  hostFormat: "simple" | "stdio" | "zed" | "opencode"
): string | null {
  if (!isMcpadreServer(serverEntry, hostFormat)) {
    return null;
  }

  switch (hostFormat) {
    case "simple":
    case "stdio":
      // args: ["run", "serverName"]
      return Array.isArray(serverEntry["args"]) &&
        serverEntry["args"].length >= 2
        ? String(serverEntry["args"][1])
        : null;

    case "zed": {
      // command.args: ["run", "serverName"]
      const command = serverEntry["command"] as Record<string, unknown>;
      return Array.isArray(command["args"]) && command["args"].length >= 2
        ? String(command["args"][1])
        : null;
    }

    case "opencode":
      // command: ["mcpadre", "run", "serverName"]
      return Array.isArray(serverEntry["command"]) &&
        serverEntry["command"].length >= 3
        ? String(serverEntry["command"][2])
        : null;

    default:
      return null;
  }
}

/**
 * Classifies all servers in a host configuration file
 *
 * @param hostConfig Parsed host configuration object
 * @param spec Host configuration specification
 * @param mcpadreServerNames Set of server names currently defined in mcpadre.yaml
 * @returns Classification of all servers found
 */
export function classifyServers(
  hostConfig: Record<string, unknown>,
  spec: HostConfigSpec,
  mcpadreServerNames: Set<string>
): ServerClassification {
  const result: ServerClassification = {
    mcpadreManaged: [],
    mcpadreOrphaned: [],
    external: [],
  };

  const serversSection = hostConfig[spec.serversKey];
  if (!serversSection || typeof serversSection !== "object") {
    return result;
  }

  const servers = serversSection as Record<string, ServerEntry>;

  for (const [serverName, serverEntry] of Object.entries(servers)) {
    if (isMcpadreServer(serverEntry, spec.serverFormat)) {
      // This is a mcpadre-managed server, check if it's in current config
      const extractedName = extractMcpadreServerName(
        serverEntry,
        spec.serverFormat
      );

      // Use the extracted name if available, otherwise fall back to the key name
      const actualServerName = extractedName ?? serverName;

      if (mcpadreServerNames.has(actualServerName)) {
        result.mcpadreManaged.push(serverName);
      } else {
        result.mcpadreOrphaned.push(serverName);
      }
    } else {
      // This is an external server
      result.external.push(serverName);
    }
  }

  return result;
}

/**
 * Analyzes server directories on disk to find orphaned directories
 *
 * @param projectDir Absolute path to the project directory (or user directory in user mode)
 * @param mcpadreServerNames Set of server names currently defined in mcpadre.yaml
 * @param isUserMode Whether this is for user-level configuration
 * @returns Analysis of server directories
 */
export async function analyzeServerDirectories(
  context: WorkspaceContext,
  mcpadreServerNames: Set<string>
): Promise<ServerDirectoryAnalysis> {
  const result: ServerDirectoryAnalysis = {
    orphanedDirectories: [],
  };

  const serversDir = join(context.workspaceDir, ".mcpadre", "servers");

  try {
    const entries = await readdir(serversDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && !mcpadreServerNames.has(entry.name)) {
        result.orphanedDirectories.push(entry.name);
      }
    }
  } catch (error) {
    // If servers directory doesn't exist or can't be read, that's fine
    // Just return empty analysis
    if (error instanceof Error && "code" in error && error.code !== "ENOENT") {
      // Re-throw non-ENOENT errors (permission issues, etc.)
      throw error;
    }
  }

  return result;
}
