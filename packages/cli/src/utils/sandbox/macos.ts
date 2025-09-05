// pattern: Mixed (unavoidable)
// macOS sandbox-exec implementation.
// Generates S-expression policies and validates sandbox availability.

import { execSync } from "node:child_process";
import { realpathSync } from "node:fs";

import { SandboxImplementation } from "./base.js";

import type { SandboxArgs } from "./types.js";

/**
 * Helper class for building S-expressions for sandbox-exec policies
 */
class SExpressionBuilder {
  private expressions: string[] = [];

  /**
   * Add a raw S-expression string
   */
  add(expr: string): this {
    this.expressions.push(expr);
    return this;
  }

  /**
   * Add an allow rule for a specific operation
   */
  allow(operation: string, ...args: string[]): this {
    if (args.length === 0) {
      this.expressions.push(`(allow ${operation})`);
    } else {
      const argsStr = args.join(" ");
      this.expressions.push(`(allow ${operation} ${argsStr})`);
    }
    return this;
  }

  /**
   * Add a deny rule for a specific operation
   */
  deny(operation: string, ...args: string[]): this {
    if (args.length === 0) {
      this.expressions.push(`(deny ${operation})`);
    } else {
      const argsStr = args.join(" ");
      this.expressions.push(`(deny ${operation} ${argsStr})`);
    }
    return this;
  }

  /**
   * Add a path-based rule
   */
  path(operation: string, permission: string, paths: string[]): this {
    for (const path of paths) {
      // Escape special characters in paths
      const escapedPath = path.replace(/"/g, '\\"');
      this.expressions.push(
        `(allow ${operation} (${permission} "${escapedPath}"))`
      );
    }
    return this;
  }

  /**
   * Add a subpath-based rule (includes all subdirectories)
   */
  subpath(operation: string, permission: string, paths: string[]): this {
    for (const path of paths) {
      // Canonicalize path to resolve symlinks like /tmp -> /private/tmp
      let canonicalPath: string;
      try {
        canonicalPath = realpathSync(path);
      } catch {
        // If canonicalization fails, use the original path
        canonicalPath = path;
      }

      // Escape special characters in paths
      const escapedPath = canonicalPath.replace(/"/g, '\\"');
      this.expressions.push(
        `(allow ${operation} (${permission} "${escapedPath}/"))`
      );
    }
    return this;
  }

  /**
   * Build the final S-expression policy
   */
  build(): string {
    return `(version 1)\n${this.expressions.join("\n")}`;
  }
}

/**
 * macOS sandbox-exec implementation.
 * Generates S-expression policies for sandboxing on macOS.
 */
export class MacOSSandbox extends SandboxImplementation {
  private sandboxExecPath: string | null = null;
  private validated = false;

  readonly name = "sandbox-exec";

  buildSandboxArgs(command: string, args: string[]): SandboxArgs | null {
    if (!this.config.enabled) {
      return null;
    }

    // Generate the S-expression policy
    const policy = this.generatePolicy();

    // sandbox-exec arguments
    const sandboxArgs: string[] = [
      "-p",
      policy, // Policy as inline string
      command, // The command to run
      ...args, // Command arguments
    ];

    return {
      executable: this.sandboxExecPath ?? "sandbox-exec",
      args: sandboxArgs,
      appendCommand: false, // Command is already included in args
    };
  }

  /**
   * Generate an S-expression policy based on the sandbox configuration
   * Based on the working Rust implementation
   */
  private generatePolicy(): string {
    const builder = new SExpressionBuilder();

    // Start with base policy from Rust implementation
    builder.add('(import "system.sb")');
    builder.add("(deny default)");
    builder.allow("mach*");
    builder.allow("ipc*");
    builder.allow("signal", "(target others)");
    builder.allow("process-fork");
    builder.allow("sysctl*");
    builder.allow("system*");
    builder.allow("file-read-metadata");
    builder.add("(system-network)");

    // Allow file reads from allowed paths
    if (this.config.allowRead.length > 0) {
      builder.subpath("file-read*", "subpath", this.config.allowRead);
    }

    // Allow file reads and writes to allowed read-write paths
    if (this.config.allowReadWrite.length > 0) {
      builder.subpath("file-read*", "subpath", this.config.allowReadWrite);
      builder.subpath("file-write*", "subpath", this.config.allowReadWrite);
    }

    // Allow process execution from allowed paths (needed for running binaries)
    if (this.config.allowRead.length > 0) {
      builder.subpath("process-exec", "subpath", this.config.allowRead);
    }

    // Allow network access if enabled
    if (this.config.networking) {
      builder.allow("network*");
    }

    return builder.build();
  }

  async validate(): Promise<boolean> {
    if (this.validated) {
      return this.sandboxExecPath !== null;
    }

    try {
      // Check if sandbox-exec is available (it's usually at /usr/bin/sandbox-exec on macOS)
      const result = execSync("which sandbox-exec", {
        encoding: "utf-8",
      }).trim();
      if (result) {
        this.sandboxExecPath = result;
        this.logger.debug(
          { sandboxExecPath: this.sandboxExecPath },
          "Found sandbox-exec binary"
        );

        // Test basic functionality with a minimal policy
        try {
          const testPolicy = "(version 1)(allow default)";
          execSync(`${this.sandboxExecPath} -p '${testPolicy}' /usr/bin/true`, {
            encoding: "utf-8",
            stdio: "pipe",
          });
          this.logger.debug("sandbox-exec validation successful");
          this.validated = true;
          return true;
        } catch (testError) {
          this.logger.error(
            { error: testError },
            "sandbox-exec is installed but failed basic functionality test"
          );
          this.sandboxExecPath = null;
          this.validated = true;
          return false;
        }
      }
    } catch {
      this.logger.debug("sandbox-exec not found in PATH");
      this.sandboxExecPath = null;
      this.validated = true;
      return false;
    }

    return false;
  }
}
