// pattern: Functional Core

import { RemoteServerSpecError } from "../types.js";

import { BaseRepositoryInvestigator } from "./repository-investigator.js";

import type { RemoteFetchResult } from "../types.js";

/**
 * GitHub API response types for repository contents
 */
interface GitHubFileItem {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
  html_url: string;
}

/**
 * Repository investigator for GitHub repositories
 */
export class GitHubInvestigator extends BaseRepositoryInvestigator {
  canHandle(url: URL): boolean {
    return url.hostname === "github.com";
  }

  async findServerSpec(url: URL): Promise<RemoteFetchResult> {
    const repoPath = this.parseRepositoryPath(url);
    const apiUrl = `https://api.github.com/repos/${repoPath}/contents`;

    try {
      // Fetch repository contents from GitHub API
      const response = await fetch(apiUrl, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "mcpadre-cli",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new RemoteServerSpecError(
            "repository-not-found",
            `GitHub repository not found: ${repoPath}`,
            url.toString()
          );
        }
        throw new RemoteServerSpecError(
          "api-error",
          `GitHub API error: ${response.status} ${response.statusText}`,
          url.toString()
        );
      }

      const contents = (await response.json()) as GitHubFileItem[];

      // Filter to only files in the root directory
      const rootFiles = contents
        .filter(item => item.type === "file")
        .map(item => item.name);

      // Find ServerSpec candidates
      const serverSpecCandidates = this.filterServerSpecFiles(rootFiles);
      const serverSpecFile = this.validateSingleFile(
        serverSpecCandidates,
        url.toString()
      );

      // Find the file item with the download URL
      const fileItem = contents.find(item => item.name === serverSpecFile);
      if (!fileItem?.download_url) {
        throw new RemoteServerSpecError(
          "download-url-missing",
          `Could not get download URL for file: ${serverSpecFile}`,
          url.toString()
        );
      }

      // Fetch the actual file content
      const fileResponse = await fetch(fileItem.download_url);
      if (!fileResponse.ok) {
        throw new RemoteServerSpecError(
          "file-fetch-error",
          `Failed to fetch ServerSpec file: ${fileResponse.status} ${fileResponse.statusText}`,
          url.toString()
        );
      }

      const content = await fileResponse.text();
      const format = this.getFormat(serverSpecFile);

      return {
        content,
        format,
        sourceUrl: fileItem.download_url,
      };
    } catch (error) {
      // Re-throw our own errors
      if (error instanceof RemoteServerSpecError) {
        throw error;
      }

      // Network or API errors
      throw new RemoteServerSpecError(
        "network-error",
        `Error accessing GitHub repository: ${error instanceof Error ? error.message : String(error)}`,
        url.toString()
      );
    }
  }

  /**
   * Extract repository path from GitHub URL
   * Supports: https://github.com/owner/repo[.git][/tree/branch/...]
   */
  private parseRepositoryPath(url: URL): string {
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (pathParts.length < 2) {
      throw new RemoteServerSpecError(
        "invalid-github-url",
        `Invalid GitHub repository URL format. Expected: https://github.com/owner/repo`,
        url.toString()
      );
    }

    const owner = pathParts[0];
    let repo = pathParts[1];

    if (!owner || !repo) {
      throw new RemoteServerSpecError(
        "invalid-github-url",
        `Invalid GitHub repository URL format. Expected: https://github.com/owner/repo`,
        url.toString()
      );
    }

    // Remove .git suffix if present
    if (repo.endsWith(".git")) {
      repo = repo.slice(0, -4);
    }

    return `${owner}/${repo}`;
  }
}
