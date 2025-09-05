// pattern: Imperative Shell
// Passthrough implementation that doesn't actually sandbox.
// Used for unsupported platforms or when sandboxing is disabled.

import { SandboxImplementation } from "./base.js";
import { getPlatform, SandboxPlatform } from "./platform.js";

import type { SandboxArgs } from "./types.js";

/**
 * Passthrough sandbox implementation that doesn't apply any sandboxing.
 * Used when sandboxing is disabled or on unsupported platforms.
 */
export class PassthroughSandbox extends SandboxImplementation {
  private hasLoggedWarning = false;

  readonly name = "passthrough";

  buildSandboxArgs(_command: string, _args: string[]): SandboxArgs | null {
    // Log warning for Windows users if sandbox was requested but unavailable
    if (!this.hasLoggedWarning && this.config.enabled) {
      const platform = getPlatform();
      if (platform === SandboxPlatform.Windows) {
        this.logger.warn(
          "Sandboxing requested but not available on Windows. " +
            "Commands will run without isolation. " +
            "Consider running mcpadre in a VM or container for better security."
        );
        this.hasLoggedWarning = true;
      } else if (platform === SandboxPlatform.Unknown) {
        this.logger.warn(
          "Sandboxing requested but platform is not recognized. " +
            "Commands will run without isolation."
        );
        this.hasLoggedWarning = true;
      }
    }

    // Return null to indicate no sandboxing
    return null;
  }

  async validate(): Promise<boolean> {
    // Passthrough is always "valid" since it doesn't do anything
    return true;
  }
}
