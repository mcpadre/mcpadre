// pattern: Functional Core
import envPaths from "env-paths";
import { existsSync } from "fs";
import { homedir } from "os";
import { dirname } from "path";

import { getUserDir, getWorkspaceDir } from "../../cli/_globals.js";
import { FileSystemError } from "../../utils/errors.js";

import type { ResolvedPath } from "../types/index.js";

/**
 * Directory resolver result containing all available system directories.
 */
export interface DirectoryResolver {
  /** User's home directory */
  home: ResolvedPath;
  /** Configuration directory (base path) */
  config: ResolvedPath;
  /** Cache directory (base path) */
  cache: ResolvedPath;
  /** Data directory (base path) */
  data: ResolvedPath;
  /** Log directory (base path) */
  log: ResolvedPath;
  /** Temporary directory (base path) */
  temp: ResolvedPath;
  /** Workspace directory (if provided and exists) */
  workspace: ResolvedPath;
  /** User directory from MCPADRE_USER_DIR or ~/.mcpadre */
  user: ResolvedPath;
}

/**
 * Creates a directory resolver that provides access to standard system directories
 * and an optional workspace directory.
 *
 * @param workspacePath - Optional workspace path to include in the resolver
 * @returns Object containing all resolved directory paths as branded strings
 * @throws Error if workspacePath is provided but doesn't exist
 */
export function createDirectoryResolver(
  workspacePath?: string | null
): DirectoryResolver {
  // Get base directories using env-paths, then use dirname to get parent directories
  const paths = envPaths("mcpadre");

  // Use workspace directory override from CLI if available, then parameter, then cwd
  const resolvedWorkspacePath =
    getWorkspaceDir() ?? workspacePath ?? process.cwd();

  // Validate workspace path if provided
  if (resolvedWorkspacePath && !existsSync(resolvedWorkspacePath)) {
    throw new FileSystemError(
      `Workspace path does not exist: ${resolvedWorkspacePath}`,
      "access",
      resolvedWorkspacePath
    );
  }

  return {
    home: homedir() as ResolvedPath,
    config: dirname(paths.config) as ResolvedPath,
    cache: dirname(paths.cache) as ResolvedPath,
    data: dirname(paths.data) as ResolvedPath,
    log: dirname(paths.log) as ResolvedPath,
    temp: dirname(paths.temp) as ResolvedPath,
    workspace: resolvedWorkspacePath as ResolvedPath,
    user: getUserDir() as ResolvedPath,
  };
}
