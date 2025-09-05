// pattern: Functional Core

import {
  DEFAULT_SERVERSPEC_PATTERNS,
  RemoteServerSpecError,
} from "../types.js";

import type {
  RepositoryInvestigator,
  ServerSpecFilePatterns,
} from "../types.js";

/**
 * Generates all possible ServerSpec filenames from patterns
 */
export function generateServerSpecFilenames(
  patterns: ServerSpecFilePatterns = DEFAULT_SERVERSPEC_PATTERNS
): string[] {
  const filenames: string[] = [];

  for (const baseName of patterns.baseNames) {
    for (const ext of patterns.extensions) {
      filenames.push(`${baseName}.${ext}`);
    }
  }

  return filenames;
}

/**
 * Validates that exactly one ServerSpec file was found
 */
export function validateSingleServerSpecFile(
  foundFiles: string[],
  repoUrl: string
): string {
  if (foundFiles.length === 0) {
    throw new RemoteServerSpecError(
      "no-serverspec-found",
      `No ServerSpec file found in repository. Expected one of: ${generateServerSpecFilenames().join(", ")}`,
      repoUrl
    );
  }

  if (foundFiles.length > 1) {
    throw new RemoteServerSpecError(
      "multiple-serverspec-found",
      `Multiple ServerSpec files found in repository: ${foundFiles.join(", ")}. Please ensure only one ServerSpec file exists.`,
      repoUrl
    );
  }

  // At this point we know foundFiles has exactly 1 element
  const singleFile = foundFiles[0];
  if (!singleFile) {
    // This should never happen given the checks above, but TypeScript needs the guard
    throw new RemoteServerSpecError(
      "internal-error",
      "Unexpected error: validated single file but none found",
      repoUrl
    );
  }

  return singleFile;
}

/**
 * Detects format from filename extension
 */
export function detectFormatFromFilename(
  filename: string
): "json" | "yaml" | "toml" {
  const ext = filename.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "json":
      return "json";
    case "yaml":
    case "yml":
      return "yaml";
    case "toml":
      return "toml";
    default:
      // This shouldn't happen if we're using our patterns correctly
      return "yaml";
  }
}

/**
 * Base class for repository investigators with common functionality
 */
export abstract class BaseRepositoryInvestigator
  implements RepositoryInvestigator
{
  protected readonly patterns: ServerSpecFilePatterns;

  constructor(patterns: ServerSpecFilePatterns = DEFAULT_SERVERSPEC_PATTERNS) {
    this.patterns = patterns;
  }

  abstract canHandle(url: URL): boolean;
  abstract findServerSpec(
    url: URL
  ): Promise<import("../types.js").RemoteFetchResult>;

  /**
   * Get all possible ServerSpec filenames for this investigator
   */
  protected getServerSpecFilenames(): string[] {
    return generateServerSpecFilenames(this.patterns);
  }

  /**
   * Filter a list of files to only include ServerSpec candidates
   */
  protected filterServerSpecFiles(files: string[]): string[] {
    const validFilenames = new Set(this.getServerSpecFilenames());
    return files.filter(file => validFilenames.has(file));
  }

  /**
   * Validate and return the single ServerSpec file from candidates
   */
  protected validateSingleFile(candidates: string[], repoUrl: string): string {
    return validateSingleServerSpecFile(candidates, repoUrl);
  }

  /**
   * Get the format for a ServerSpec filename
   */
  protected getFormat(filename: string): "json" | "yaml" | "toml" {
    return detectFormatFromFilename(filename);
  }
}
