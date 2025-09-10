// pattern: Functional Core
import envPaths from "env-paths";
import { existsSync } from "fs";
import { homedir } from "os";
import { dirname } from "path";

import { FileSystemError } from "../../utils/errors.js";

import type { WorkspaceContext } from "../../config/types/index.js";
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
  /** Workspace directory from context */
  workspace: ResolvedPath;
}

/**
 * Creates a directory resolver that provides access to standard system directories
 * using the workspace directory from the provided context.
 *
 * @param context - WorkspaceContext containing the workspace directory
 * @returns Object containing all resolved directory paths as branded strings
 * @throws Error if workspace directory doesn't exist
 */
export function createDirectoryResolver(
  context: WorkspaceContext
): DirectoryResolver {
  // Get base directories using env-paths, then use dirname to get parent directories
  const paths = envPaths("mcpadre");

  // Use workspace directory from context
  const workspaceDir = context.workspaceDir;

  // Validate workspace path exists
  if (!existsSync(workspaceDir)) {
    throw new FileSystemError(
      `Workspace directory does not exist: ${workspaceDir}`,
      "access",
      workspaceDir
    );
  }

  return {
    home: homedir() as ResolvedPath,
    config: dirname(paths.config) as ResolvedPath,
    cache: dirname(paths.cache) as ResolvedPath,
    data: dirname(paths.data) as ResolvedPath,
    log: dirname(paths.log) as ResolvedPath,
    temp: dirname(paths.temp) as ResolvedPath,
    workspace: workspaceDir as ResolvedPath,
  };
}
