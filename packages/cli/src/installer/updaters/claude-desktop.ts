// pattern: Functional Core

import type { McpServerV1 } from "../../config/types/v1/server/index.js";
import type { ConfigUpdateWithAnalysis } from "./generic-updater.js";

/**
 * Placeholder updater for claude-desktop.
 * Claude Desktop is a USER-only host and does not support project-level configurations.
 * These functions should never be called in practice.
 */
export function updateClaudeDesktopConfig(
  _existingContent: string,
  _servers: Record<string, McpServerV1>
): string {
  throw new Error(
    "Claude Desktop does not support project-level configurations. Use --user flag instead."
  );
}

export function updateClaudeDesktopConfigWithAnalysis(
  _existingContent: string,
  _servers: Record<string, McpServerV1>
): ConfigUpdateWithAnalysis {
  throw new Error(
    "Claude Desktop does not support project-level configurations. Use --user flag instead."
  );
}
