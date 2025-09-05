// pattern: Mixed (unavoidable)
// Bubblewrap sandbox implementation for Linux.
// Builds command-line arguments for bwrap while also performing validation.

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

import { SandboxImplementation } from "./base.js";

import type { SandboxArgs } from "./types.js";

/**
 * Bubblewrap (bwrap) sandbox implementation for Linux.
 * Provides namespace isolation, capability dropping, and filesystem restrictions.
 */
export class BwrapSandbox extends SandboxImplementation {
  private bwrapPath: string | null = null;
  private validated = false;

  readonly name = "bubblewrap";

  buildSandboxArgs(command: string, args: string[]): SandboxArgs | null {
    if (!this.config.enabled) {
      return null;
    }

    const bwrapArgs: string[] = [];

    // Security flags - these come first for maximum isolation
    this.addSecurityFlags(bwrapArgs);

    // Network configuration
    this.addNetworkConfiguration(bwrapArgs);

    // Filesystem mounts
    this.addFilesystemMounts(bwrapArgs);

    // Add the command and its arguments at the end
    bwrapArgs.push("--");
    bwrapArgs.push(command);
    bwrapArgs.push(...args);

    return {
      executable: this.bwrapPath ?? "bwrap",
      args: bwrapArgs,
      appendCommand: false, // Command is already included in args
    };
  }

  /**
   * Add security-related flags for namespace isolation and capability dropping
   */
  private addSecurityFlags(args: string[]): void {
    // Create new session to prevent terminal access
    args.push("--new-session");

    // Die with parent process
    args.push("--die-with-parent");

    // Unshare user namespace for UID/GID isolation
    args.push("--unshare-user");

    // Unshare PID namespace for process isolation
    args.push("--unshare-pid");

    // Unshare IPC namespace
    args.push("--unshare-ipc");

    // Unshare UTS namespace (hostname)
    args.push("--unshare-uts");

    // Unshare cgroup namespace
    args.push("--unshare-cgroup");

    // Drop all capabilities
    args.push("--cap-drop", "ALL");

    // Set hostname
    args.push("--hostname", "sandbox");

    // Note: We don't use --clearenv because the parent process will provide
    // the properly merged environment via spawn() env parameter
  }

  /**
   * Add network configuration based on sandbox settings
   */
  private addNetworkConfiguration(args: string[]): void {
    if (!this.config.networking) {
      // Unshare network namespace to disable networking
      args.push("--unshare-net");
    }
    // Note: DNS files are now handled centrally by the resolver
    // and included in allowRead paths when networking is enabled
  }

  /**
   * Add filesystem mount configurations
   */
  private addFilesystemMounts(args: string[]): void {
    // Mount /proc and /dev for basic system functionality
    args.push("--proc", "/proc");
    args.push("--dev", "/dev");

    // Create tmpfs for /tmp
    args.push("--tmpfs", "/tmp");

    // Add explicitly allowed read-only paths
    for (const path of this.config.allowRead) {
      if (existsSync(path)) {
        args.push("--ro-bind", path, path);
      } else {
        this.logger.warn({ path }, "Skipping non-existent read-only path");
      }
    }

    // Add explicitly allowed read-write paths
    for (const path of this.config.allowReadWrite) {
      if (existsSync(path)) {
        args.push("--bind", path, path);
      } else {
        this.logger.warn({ path }, "Skipping non-existent read-write path");
      }
    }

    // Note: We don't replace the entire home directory with tmpfs because
    // it would conflict with explicitly allowed paths like ~/.asdf, ~/.npm, etc.
    // The sandbox isolation is already provided by the explicit path allowlists.
  }

  async validate(): Promise<boolean> {
    if (this.validated) {
      return this.bwrapPath !== null;
    }

    try {
      // Check if bwrap is installed
      const result = execSync("which bwrap", { encoding: "utf-8" }).trim();
      if (result) {
        this.bwrapPath = result;
        this.logger.debug({ bwrapPath: this.bwrapPath }, "Found bwrap binary");

        // Test basic functionality with a minimal sandbox
        try {
          execSync(`${this.bwrapPath} --ro-bind / / --unshare-net /bin/true`, {
            encoding: "utf-8",
            stdio: "pipe",
          });
          this.logger.debug("Bwrap validation successful");
          this.validated = true;
          return true;
        } catch (testError) {
          // Check for specific AppArmor permission error
          const errorMessage =
            testError instanceof Error ? testError.message : String(testError);
          if (this.isAppArmorPermissionError(errorMessage)) {
            this.logAppArmorGuidance(errorMessage);
          } else {
            this.logger.error(
              { error: testError },
              "Bwrap is installed but failed basic functionality test"
            );
          }
          this.bwrapPath = null;
          this.validated = true;
          return false;
        }
      }
    } catch {
      this.logger.debug("Bwrap not found in PATH");
      this.bwrapPath = null;
      this.validated = true;
      return false;
    }

    return false;
  }

  /**
   * Check if the error is related to AppArmor user namespace restrictions
   */
  private isAppArmorPermissionError(errorMessage: string): boolean {
    const appArmorIndicators = [
      "loopback: Failed RTM_NEWADDR: Operation not permitted",
      "setting up uid map: Permission denied",
      "No permissions to create new namespace",
      "Operation not permitted",
    ];

    return appArmorIndicators.some(indicator =>
      errorMessage.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * Log helpful guidance for AppArmor permission issues
   */
  private logAppArmorGuidance(errorMessage: string): void {
    this.logger.warn(
      { error: errorMessage },
      "Bubblewrap failed due to user namespace restrictions, likely AppArmor policy"
    );

    this.logger.info(
      "Bubblewrap sandbox is blocked by system security policy. " +
        "This is likely caused by AppArmor restricting unprivileged user namespaces. " +
        "Future mcpadre packages will include proper AppArmor policies to resolve this automatically."
    );

    this.logger.info(
      "Temporary workaround: Run 'sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0' " +
        "to disable AppArmor user namespace restrictions (requires reboot or policy reload)"
    );

    this.logger.debug(
      "See https://ubuntu.com/blog/ubuntu-23-10-restricted-unprivileged-user-namespaces for more details"
    );
  }
}
