// pattern: Imperative Shell

import { createWorkspaceContext } from "./with-config-base.js";
import { withErrorHandling } from "./with-error-handling.js";

import type { WorkspaceContext } from "../../config/types/index.js";

/**
 * Convenience function to wrap a Commander action with WorkspaceContext and error handling
 *
 * This creates the appropriate WorkspaceContext (user or project) based on the current mode,
 * loads the configuration, and wraps the action with error handling.
 *
 * @param configAction Action that requires workspace context
 * @param options Options for creating the context
 * @returns Action wrapped with context creation, config loading, and error handling
 */
export function withConfigContextAndErrorHandling<T extends unknown[]>(
  configAction: (
    context: WorkspaceContext,
    config: WorkspaceContext["mergedConfig"],
    ...args: T
  ) => Promise<void> | void,
  options?: {
    target?: string;
  }
): (...args: T) => Promise<void> {
  return withErrorHandling(async (...args: T) => {
    // Create the appropriate WorkspaceContext based on the current mode
    const context = await createWorkspaceContext(options);

    // Call the action with the workspace context and merged config
    await configAction(context, context.mergedConfig, ...args);
  });
}
