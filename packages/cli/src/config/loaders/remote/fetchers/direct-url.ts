// pattern: Functional Core

import { extname } from "path";

import { RemoteServerSpecError } from "../types.js";

import type { RemoteFetchResult } from "../types.js";

/**
 * Detects the format of content based on URL extension or Content-Type header
 */
function detectFormat(
  url: string,
  contentType?: string
): "json" | "yaml" | "toml" {
  // First try to detect from URL extension
  const ext = extname(new URL(url).pathname).toLowerCase();
  switch (ext) {
    case ".json":
      return "json";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".toml":
      return "toml";
  }

  // Fall back to Content-Type header
  if (contentType) {
    const lowerContentType = contentType.toLowerCase();
    if (lowerContentType.includes("json")) {
      return "json";
    }
    if (lowerContentType.includes("yaml") || lowerContentType.includes("yml")) {
      return "yaml";
    }
    if (lowerContentType.includes("toml")) {
      return "toml";
    }
  }

  // Default to YAML if we can't determine
  return "yaml";
}

/**
 * Validates that a URL is appropriate for direct fetching
 */
function validateDirectUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RemoteServerSpecError(
      "invalid-url",
      `Invalid URL format: ${url}`,
      url
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new RemoteServerSpecError(
      "unsupported-protocol",
      `Unsupported protocol: ${parsed.protocol}. Only HTTP and HTTPS are supported.`,
      url
    );
  }

  return parsed;
}

/**
 * Fetches ServerSpec content directly from a URL
 */
export async function fetchDirectUrl(url: string): Promise<RemoteFetchResult> {
  const validatedUrl = validateDirectUrl(url);

  try {
    const response = await fetch(validatedUrl.toString());

    if (!response.ok) {
      if (response.status === 404) {
        throw new RemoteServerSpecError(
          "not-found",
          `ServerSpec file not found at URL: ${url}`,
          url
        );
      }
      throw new RemoteServerSpecError(
        "fetch-error",
        `Failed to fetch from ${url}: ${response.status} ${response.statusText}`,
        url
      );
    }

    const content = await response.text();
    const contentType = response.headers.get("content-type") ?? undefined;
    const format = detectFormat(url, contentType);

    return {
      content,
      format,
      sourceUrl: url,
    };
  } catch (error) {
    // Re-throw our own errors
    if (error instanceof RemoteServerSpecError) {
      throw error;
    }

    // Network or other fetch errors
    throw new RemoteServerSpecError(
      "network-error",
      `Network error fetching from ${url}: ${error instanceof Error ? error.message : String(error)}`,
      url
    );
  }
}

/**
 * Checks if a URL looks like a direct file URL (has a file extension)
 */
export function isDirectFileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const ext = extname(parsed.pathname).toLowerCase();
    return [".json", ".yaml", ".yml", ".toml"].includes(ext);
  } catch {
    return false;
  }
}
