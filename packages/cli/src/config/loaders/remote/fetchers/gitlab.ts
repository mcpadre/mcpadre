// pattern: Functional Core

import { RemoteServerSpecError } from "../types.js";

import { BaseRepositoryInvestigator } from "./repository-investigator.js";

import type { RemoteFetchResult } from "../types.js";

/**
 * GitLab API response types for repository contents
 */
interface GitLabFileItem {
  id: string;
  name: string;
  type: "blob" | "tree";
  path: string;
  mode: string;
}

/**
 * Repository investigator for GitLab repositories
 */
export class GitLabInvestigator extends BaseRepositoryInvestigator {
  canHandle(url: URL): boolean {
    return url.hostname === "gitlab.com";
  }

  async findServerSpec(url: URL): Promise<RemoteFetchResult> {
    const projectPath = this.parseRepositoryPath(url);
    const encodedPath = encodeURIComponent(projectPath);
    const apiUrl = `https://gitlab.com/api/v4/projects/${encodedPath}/repository/tree`;

    try {
      // Fetch repository contents from GitLab API
      const response = await fetch(apiUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new RemoteServerSpecError(
            "repository-not-found",
            `GitLab repository not found: ${projectPath}`,
            url.toString()
          );
        }
        throw new RemoteServerSpecError(
          "api-error",
          `GitLab API error: ${response.status} ${response.statusText}`,
          url.toString()
        );
      }

      const contents = (await response.json()) as GitLabFileItem[];

      // Filter to only files (blobs) in the root directory
      const rootFiles = contents
        .filter(item => item.type === "blob")
        .map(item => item.name);

      // Find ServerSpec candidates
      const serverSpecCandidates = this.filterServerSpecFiles(rootFiles);
      const serverSpecFile = this.validateSingleFile(
        serverSpecCandidates,
        url.toString()
      );

      // Construct raw file URL for GitLab
      const rawFileUrl = `https://gitlab.com/${projectPath}/-/raw/main/${serverSpecFile}`;

      // Fetch the actual file content
      const fileResponse = await fetch(rawFileUrl);
      if (!fileResponse.ok) {
        // Try with master branch as fallback
        const masterUrl = `https://gitlab.com/${projectPath}/-/raw/master/${serverSpecFile}`;
        const masterResponse = await fetch(masterUrl);

        if (!masterResponse.ok) {
          throw new RemoteServerSpecError(
            "file-fetch-error",
            `Failed to fetch ServerSpec file from main or master branch: ${fileResponse.status} ${fileResponse.statusText}`,
            url.toString()
          );
        }

        const content = await masterResponse.text();
        const format = this.getFormat(serverSpecFile);

        return {
          content,
          format,
          sourceUrl: masterUrl,
        };
      }

      const content = await fileResponse.text();
      const format = this.getFormat(serverSpecFile);

      return {
        content,
        format,
        sourceUrl: rawFileUrl,
      };
    } catch (error) {
      // Re-throw our own errors
      if (error instanceof RemoteServerSpecError) {
        throw error;
      }

      // Network or API errors
      throw new RemoteServerSpecError(
        "network-error",
        `Error accessing GitLab repository: ${error instanceof Error ? error.message : String(error)}`,
        url.toString()
      );
    }
  }

  /**
   * Extract repository path from GitLab URL
   * Supports: https://gitlab.com/owner/repo[.git][/-/tree/branch/...]
   */
  private parseRepositoryPath(url: URL): string {
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (pathParts.length < 2) {
      throw new RemoteServerSpecError(
        "invalid-gitlab-url",
        `Invalid GitLab repository URL format. Expected: https://gitlab.com/owner/repo`,
        url.toString()
      );
    }

    const owner = pathParts[0];
    let repo = pathParts[1];

    if (!owner || !repo) {
      throw new RemoteServerSpecError(
        "invalid-gitlab-url",
        `Invalid GitLab repository URL format. Expected: https://gitlab.com/owner/repo`,
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
