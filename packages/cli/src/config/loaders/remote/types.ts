// pattern: Functional Core

import type { ServerSpec } from "../../types/index.js";

/**
 * Types of remote sources supported
 */
export type RemoteSourceType = "direct" | "github" | "gitlab" | "unknown";

/**
 * Result of fetching content from a remote source
 */
export interface RemoteFetchResult {
  /** The fetched content as string */
  content: string;
  /** The detected format of the content */
  format: "json" | "yaml" | "toml";
  /** The source URL that was fetched */
  sourceUrl: string;
}

/**
 * Abstract interface for repository investigation providers
 */
export interface RepositoryInvestigator {
  /**
   * Check if this investigator can handle the given URL
   */
  canHandle(url: URL): boolean;

  /**
   * Find and fetch a ServerSpec file from the repository
   * @throws RemoteServerSpecError if file not found or multiple files found
   */
  findServerSpec(url: URL): Promise<RemoteFetchResult>;
}

/**
 * Configuration for supported ServerSpec file names and extensions
 */
export interface ServerSpecFilePatterns {
  /** Base names without extension */
  baseNames: readonly string[];
  /** Supported extensions */
  extensions: readonly string[];
}

/**
 * Default patterns for ServerSpec files in repositories
 */
export const DEFAULT_SERVERSPEC_PATTERNS: ServerSpecFilePatterns = {
  baseNames: [
    "ADD_THIS_MCP",
    "ADD-THIS-MCP",
    "add_this_mcp",
    "add-this-mcp",
  ] as const,
  extensions: ["json", "yaml", "yml", "toml"] as const,
} as const;

/**
 * Remote ServerSpec loading errors
 */
export class RemoteServerSpecError extends Error {
  public readonly category: string;
  public readonly sourceUrl: string | undefined;

  constructor(category: string, message: string, sourceUrl?: string) {
    super(message);
    this.name = "RemoteServerSpecError";
    this.category = category;
    this.sourceUrl = sourceUrl;

    // Maintain proper stack trace for where our error was thrown
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Error.captureStackTrace may not exist in all environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RemoteServerSpecError);
    }
  }
}

/**
 * Result of loading and validating a remote ServerSpec
 */
export interface RemoteServerSpecResult {
  /** The validated ServerSpec object */
  serverSpec: ServerSpec;
  /** The source URL that was loaded */
  sourceUrl: string;
  /** The format that was detected */
  format: string;
}
