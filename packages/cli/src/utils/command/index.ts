// pattern: Mixed (unavoidable)
// Command execution requires integration of pure logic with side effects for performance
import { execa, type ExecaError, type Options } from "execa";

import { createSandbox } from "../sandbox/index.js";

import type { FinalizedSandboxConfig } from "../sandbox/index.js";
import type { Logger } from "pino";

/**
 * A command builder that provides a Rust Command-like API with logging integration.
 * Handles cross-platform execution, environment variables, stderr logging, and sandboxing.
 */
export class CommandBuilder {
  private command: string;
  private args: string[];
  private env: Record<string, string>;
  private childLogger: Logger;
  private cwd?: string;
  private shell?: string | boolean;
  private sandboxConfig?: FinalizedSandboxConfig;

  constructor(command: string, logger: Logger) {
    this.command = command;
    this.args = [];
    this.env = {};

    // Extract process name (first part of command, without path or extension)
    const processName = command.split(/[/\\]/).pop()?.split(".")[0] ?? command;
    this.childLogger = logger.child({ process: processName });
  }

  /**
   * Add command arguments
   */
  arg(arg: string): this {
    this.args.push(arg);
    return this;
  }

  /**
   * Add multiple command arguments
   */
  addArgs(args: string[]): this {
    this.args.push(...args);
    return this;
  }

  /**
   * Set environment variables (merged with parent)
   */
  envs(envVars: Record<string, string>): this {
    Object.assign(this.env, envVars);
    return this;
  }

  /**
   * Set working directory
   */
  currentDir(path: string): this {
    this.cwd = path;
    return this;
  }

  /**
   * Set shell for execution (for future sandboxing support)
   */
  useShell(shell: string | boolean): this {
    this.shell = shell;
    return this;
  }

  /**
   * Enable sandboxing with the specified configuration.
   * The config should have paths already resolved by the runner.
   */
  withSandbox(config: FinalizedSandboxConfig): this {
    this.sandboxConfig = config;
    return this;
  }

  /**
   * Execute the command and return stdout
   * stderr is automatically logged at DEBUG level
   */
  async output(): Promise<string> {
    const mergedEnv = { ...process.env, ...this.env } as Record<string, string>;

    // Determine the actual command and args to execute
    let actualCommand = this.command;
    let actualArgs = [...this.args];

    // Apply sandboxing if configured
    if (this.sandboxConfig) {
      const sandbox = createSandbox(this.childLogger, this.sandboxConfig);

      // Validate sandbox availability
      const isValid = await sandbox.validate();
      if (!isValid && this.sandboxConfig.enabled) {
        this.childLogger.warn(
          `Sandbox ${sandbox.name} validation failed, proceeding without sandboxing`
        );
      }

      // Build sandbox arguments
      const sandboxArgs = sandbox.buildSandboxArgs(this.command, this.args);
      if (sandboxArgs) {
        actualCommand = sandboxArgs.executable;
        actualArgs = sandboxArgs.args;

        this.childLogger.debug(
          {
            sandbox: sandbox.name,
            originalCommand: this.command,
            sandboxCommand: actualCommand,
          },
          "Applying sandbox to command"
        );
      }
    }

    this.childLogger.debug(
      {
        command: actualCommand,
        argCount: actualArgs.length,
        cwd: this.cwd,
        sandboxed: this.sandboxConfig !== undefined,
      },
      "Executing command"
    );

    try {
      const options: Options = {
        env: mergedEnv,
        stderr: "pipe",
        stdout: "pipe",
        ...(this.cwd !== undefined && { cwd: this.cwd }),
        ...(this.shell !== undefined && { shell: this.shell }),
      };

      const result = await execa(actualCommand, actualArgs, options);

      // Log stderr at debug level if present
      if (typeof result.stderr === "string" && result.stderr.trim()) {
        this.childLogger.debug(
          { stderr: result.stderr },
          "Command stderr output"
        );
      }

      this.childLogger.debug(
        {
          exitCode: result.exitCode,
          duration: result.durationMs,
        },
        "Command completed successfully"
      );

      // Since we set stdout: 'pipe', it should be a string
      if (typeof result.stdout === "string") {
        return result.stdout.trim();
      }
      return "";
    } catch (error) {
      const execaError = error as ExecaError;
      // Log error details including stderr
      this.childLogger.debug(
        {
          error: execaError.message,
          stderr: execaError.stderr,
          exitCode: execaError.exitCode,
        },
        "Command execution failed"
      );

      throw error;
    }
  }
}

/**
 * Create a new command builder with the specified command and logger
 */
export function createCommand(command: string, logger: Logger): CommandBuilder {
  return new CommandBuilder(command, logger);
}
