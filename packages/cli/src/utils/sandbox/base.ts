// pattern: Mixed (unavoidable)
// Abstract base class for sandbox implementations. While it defines pure interfaces,
// concrete implementations will need to perform I/O operations for sandbox execution.

import type { FinalizedSandboxConfig, SandboxArgs } from "./types.js";
import type { Logger } from "pino";

/**
 * Abstract base class for platform-specific sandbox implementations.
 * Provides the interface for building sandbox command arguments.
 */
export abstract class SandboxImplementation {
  protected logger: Logger;
  protected config: FinalizedSandboxConfig;

  constructor(logger: Logger, config: FinalizedSandboxConfig) {
    this.logger = logger;
    this.config = config;
  }

  /**
   * Build the sandbox arguments for the given command.
   * This prepares the sandbox executable and its arguments.
   *
   * @param command The command to be sandboxed
   * @param args The arguments for the command
   * @returns The sandbox executable and arguments, or null if sandboxing is disabled
   */
  abstract buildSandboxArgs(
    command: string,
    args: string[]
  ): SandboxArgs | null;

  /**
   * Validate that the sandbox binary is available and functional.
   * This should be called before attempting to use the sandbox.
   */
  abstract validate(): Promise<boolean>;

  /**
   * Get a human-readable name for this sandbox implementation
   */
  abstract get name(): string;
}
