// pattern: Functional Core
// Generic path resolution utilities for converting template strings to resolved paths

import { applyTemplate } from "../string-templating/index.js";

import type { DirectoryResolver } from "../../runner/directory-resolver/index.js";
import type { ResolvedPath } from "../../runner/types/index.js";

/**
 * Options for resolving template paths
 */
export interface PathResolverOptions {
  /** Directory resolver providing system and workspace paths */
  directoryResolver: DirectoryResolver;
  /** Parent environment variables (usually process.env) */
  parentEnv: Record<string, string | undefined>;
}

/**
 * Resolves a single path template to a ResolvedPath.
 * Uses the same template variables as env resolution:
 * - {{dirs.*}} for directory paths
 * - {{parentEnv.*}} for environment variables
 *
 * @param pathTemplate The template string to resolve
 * @param options Resolution options including template variables
 * @returns Resolved path
 */
export function resolvePathTemplate(
  pathTemplate: string,
  options: PathResolverOptions
): ResolvedPath {
  const { directoryResolver, parentEnv } = options;

  // Prepare template variables (same as env resolution)
  const templateVars = {
    dirs: directoryResolver,
    parentEnv,
  };

  const resolved = applyTemplate(pathTemplate, templateVars);
  // Cast to ResolvedPath since we've resolved all templates
  return resolved as ResolvedPath;
}

/**
 * Resolves an array of path templates to ResolvedPaths.
 * Filters out empty or whitespace-only paths that result from undefined template variables.
 *
 * @param pathTemplates Array of template strings to resolve
 * @param options Resolution options including template variables
 * @returns Array of resolved paths, excluding empty strings
 */
export function resolvePathTemplates(
  pathTemplates: string[],
  options: PathResolverOptions
): ResolvedPath[] {
  return pathTemplates
    .map(template => resolvePathTemplate(template, options))
    .filter(path => path.trim() !== "");
}

/**
 * Resolves an optional path template to an optional ResolvedPath.
 *
 * @param pathTemplate Optional template string to resolve
 * @param options Resolution options including template variables
 * @returns Optional resolved path
 */
export function resolveOptionalPathTemplate(
  pathTemplate: string | undefined,
  options: PathResolverOptions
): ResolvedPath | undefined {
  if (!pathTemplate) {
    return undefined;
  }
  return resolvePathTemplate(pathTemplate, options);
}
