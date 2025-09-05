// pattern: Functional Core

import { parse as parseToml } from "@iarna/toml";
import { parse as parseYaml } from "yaml";

import { validateServerSpecObject } from "../serverspec-loader.js";

import { fetchDirectUrl, isDirectFileUrl } from "./fetchers/direct-url.js";
import { GitHubInvestigator } from "./fetchers/github.js";
import { GitLabInvestigator } from "./fetchers/gitlab.js";
import { RemoteServerSpecError } from "./types.js";

import type {
  RemoteFetchResult,
  RemoteServerSpecResult,
  RemoteSourceType,
  RepositoryInvestigator,
} from "./types.js";

/**
 * Registry of repository investigators
 */
const REPOSITORY_INVESTIGATORS: RepositoryInvestigator[] = [
  new GitHubInvestigator(),
  new GitLabInvestigator(),
];

/**
 * Detects the type of remote source from a URL
 */
export function detectRemoteSourceType(input: string): RemoteSourceType {
  try {
    const url = new URL(input);

    // Check if it's a direct file URL (has file extension)
    if (isDirectFileUrl(input)) {
      return "direct";
    }

    // Check repository investigators
    for (const investigator of REPOSITORY_INVESTIGATORS) {
      if (investigator.canHandle(url)) {
        if (url.hostname === "github.com") return "github";
        if (url.hostname === "gitlab.com") return "gitlab";
      }
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Checks if an input string is a remote URL
 */
export function isRemoteSource(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
}

/**
 * Parses content based on format
 */
function parseContent(content: string, format: string): unknown {
  switch (format.toLowerCase()) {
    case "json":
      return JSON.parse(content);
    case "yaml":
    case "yml":
      return parseYaml(content);
    case "toml":
      return parseToml(content);
    default:
      throw new RemoteServerSpecError(
        "unsupported-format",
        `Unsupported format: ${format}. Supported formats: json, yaml, toml`
      );
  }
}

/**
 * Fetches content from a remote source
 */
async function fetchRemoteContent(url: string): Promise<RemoteFetchResult> {
  const sourceType = detectRemoteSourceType(url);

  switch (sourceType) {
    case "direct":
      return await fetchDirectUrl(url);

    case "github":
    case "gitlab": {
      const parsedUrl = new URL(url);
      const investigator = REPOSITORY_INVESTIGATORS.find(inv =>
        inv.canHandle(parsedUrl)
      );

      if (!investigator) {
        throw new RemoteServerSpecError(
          "no-investigator",
          `No investigator available for ${sourceType} repositories`,
          url
        );
      }

      return await investigator.findServerSpec(parsedUrl);
    }

    case "unknown": {
      // For unknown URLs, try each repository investigator
      const parsedUrl = new URL(url);
      const errors: Error[] = [];

      for (const investigator of REPOSITORY_INVESTIGATORS) {
        if (investigator.canHandle(parsedUrl)) {
          try {
            return await investigator.findServerSpec(parsedUrl);
          } catch (error) {
            errors.push(
              error instanceof Error ? error : new Error(String(error))
            );
            continue;
          }
        }
      }

      // If no repository investigator worked, try as direct URL
      try {
        return await fetchDirectUrl(url);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }

      // All methods failed
      const errorMessages = errors.map(e => e.message).join("; ");
      throw new RemoteServerSpecError(
        "all-methods-failed",
        `Unable to fetch ServerSpec from URL. Tried all available methods. Errors: ${errorMessages}`,
        url
      );
    }

    default:
      throw new RemoteServerSpecError(
        "unsupported-source-type",
        `Unsupported remote source type: ${sourceType}`,
        url
      );
  }
}

/**
 * Loads and validates a ServerSpec from a remote URL
 */
export async function loadAndValidateRemoteServerSpec(
  url: string
): Promise<RemoteServerSpecResult> {
  try {
    // Fetch the content
    const fetchResult = await fetchRemoteContent(url);

    // Parse the content
    const data = parseContent(fetchResult.content, fetchResult.format);

    // Validate the ServerSpec
    if (validateServerSpecObject(data)) {
      return {
        serverSpec: data,
        sourceUrl: fetchResult.sourceUrl,
        format: fetchResult.format,
      };
    }

    // This should never be reached due to the throw in validateServerSpecObject
    throw new RemoteServerSpecError(
      "validation-failed",
      "ServerSpec validation failed for unknown reasons",
      url
    );
  } catch (error) {
    // Re-throw our own errors
    if (error instanceof RemoteServerSpecError) {
      throw error;
    }

    // Wrap other errors
    throw new RemoteServerSpecError(
      "load-error",
      `Failed to load remote ServerSpec: ${error instanceof Error ? error.message : String(error)}`,
      url
    );
  }
}
