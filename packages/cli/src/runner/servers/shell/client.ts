// pattern: Mixed (unavoidable)
// Shell MCP client integrates process spawning with JSON-RPC communication

import { type ChildProcess, spawn } from "node:child_process";
import { chmodSync, existsSync, unlinkSync, writeFileSync } from "node:fs";

import tempfile from "tempfile";

import { createSandbox } from "../../../utils/sandbox/index.js";
import { JsonRpcStreamHandler } from "../../session/stream-handler.js";
import { BaseMcpClient } from "../common/base-client.js";

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../../test-utils/json-rpc/types.js";
import type { FinalizedSandboxConfig } from "../../../utils/sandbox/index.js";
import type { ResolvedCommandParts, ResolvedPath } from "../../types/index.js";
import type { Logger } from "pino";

/**
 * Shell MCP client that spawns child processes and communicates over stdin/stdout
 * using JSON-RPC protocol. Integrates with the sandboxing system for secure execution.
 */
export class ShellMcpClient extends BaseMcpClient {
  private process: ChildProcess | null = null;
  private streamHandler: JsonRpcStreamHandler | null = null;
  private isStarted = false;
  private tempScriptPath: string | null = null;
  private tempScriptCleanupTimer: NodeJS.Timeout | null = null;
  private stderrBuffer: string[] = [];

  constructor(
    private readonly command: ResolvedCommandParts,
    private readonly env: Record<string, string>,
    private readonly cwd: ResolvedPath,
    private readonly sandboxConfig: FinalizedSandboxConfig,
    logger: Logger,
    serverName = "shell-server"
  ) {
    super(logger, serverName);
  }

  protected getClientType(): string {
    return "shell-client";
  }

  /**
   * Send a JSON-RPC request to the shell server and wait for response
   */
  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.isStarted || !this.streamHandler) {
      await this.startProcess();
    }

    if (!this.streamHandler) {
      throw new Error("Failed to start shell MCP server process");
    }

    const response = await this.streamHandler.sendRequest(request);

    if (!response) {
      throw new Error(
        `No response received for request ${request.id} (notifications should not be sent through send() method)`
      );
    }

    return response;
  }

  /**
   * Start the shell MCP server process with sandbox integration
   */
  private async startProcess(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.logger.debug(
      {
        command: this.command,
        cwd: this.cwd,
        sandboxEnabled: this.sandboxConfig.enabled,
      },
      "Starting shell MCP server process"
    );

    try {
      // Build the full command string with proper quoting for arguments with spaces
      const fullCommand = [this.command.command, ...this.command.args]
        .map(arg => {
          // Quote arguments that contain spaces
          if (arg.includes(" ")) {
            // Escape any existing quotes in the argument
            const escaped = arg.replace(/"/g, '\\"');
            return `"${escaped}"`;
          }
          return arg;
        })
        .join(" ");

      this.logger.debug(
        { fullCommand },
        "Built command string for tempfile execution"
      );

      // Create temporary script file
      const tempScriptPath = tempfile({ extension: ".sh" });
      this.tempScriptPath = tempScriptPath;

      // Write command to tempfile (no shebang, just the command)
      writeFileSync(tempScriptPath, fullCommand, "utf8");

      // Set executable permissions (owner read/write/execute only)
      chmodSync(tempScriptPath, 0o700);

      this.logger.debug(
        { tempScriptPath, fullCommand },
        "Created temporary script file"
      );

      // Get shell from environment with platform-specific detection
      let shell: string;
      if (process.platform === "win32") {
        // On Windows, detect PowerShell vs CMD based on COMSPEC
        const comspec = process.env["COMSPEC"];

        // COMSPEC typically points to cmd.exe by default
        // If it contains 'cmd', use cmd.exe; otherwise prefer PowerShell
        if (comspec?.toLowerCase().includes("cmd")) {
          shell = "cmd.exe";
        } else {
          // Default to PowerShell if COMSPEC is unset or points to PowerShell
          shell = "powershell.exe";
        }
      } else {
        // Unix/macOS: use SHELL or fallback to /bin/sh
        shell = process.env["SHELL"] ?? "/bin/sh";
      }

      // Set up the shell command and args to execute tempfile
      let actualCommand = shell;
      let actualArgs = [tempScriptPath];

      // Set up environment with merged variables
      const mergedEnv = {
        ...process.env,
        ...this.env,
      } as Record<string, string>;

      // Apply sandbox if enabled - sandbox wraps the shell command
      if (this.sandboxConfig.enabled) {
        // Add tempfile and shell to sandbox allowRead
        const enhancedSandboxConfig = {
          ...this.sandboxConfig,
          allowRead: [
            ...this.sandboxConfig.allowRead,
            tempScriptPath as ResolvedPath,
            shell as ResolvedPath,
          ],
        };

        const sandbox = createSandbox(this.logger, enhancedSandboxConfig);

        const isValid = await sandbox.validate();
        if (!isValid) {
          this.logger.warn(
            `Sandbox ${sandbox.name} validation failed, proceeding without sandboxing`
          );
        } else {
          // Sandbox wraps the shell command
          const sandboxArgs = sandbox.buildSandboxArgs(
            actualCommand,
            actualArgs
          );
          if (sandboxArgs) {
            actualCommand = sandboxArgs.executable;
            actualArgs = sandboxArgs.args;

            this.logger.debug(
              {
                sandbox: sandbox.name,
                shellCommand: shell,
                sandboxCommand: actualCommand,
                fullSandboxArgs: actualArgs,
              },
              "Applying sandbox to tempfile MCP server"
            );
          }
        }
      }

      this.logger.debug(
        {
          finalCommand: actualCommand,
          finalArgs: actualArgs,
          tempScriptPath: this.tempScriptPath,
          shell,
        },
        "Spawning shell MCP server process"
      );

      this.process = spawn(actualCommand, actualArgs, {
        cwd: this.cwd,
        env: mergedEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.logger.trace(
        {
          pid: this.process.pid,
          spawnfile: this.process.spawnfile,
          spawnargs: this.process.spawnargs,
        },
        "Process spawned successfully"
      );

      if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
        throw new Error("Failed to create process stdio streams");
      }

      // Set up JSON-RPC stream handler
      this.streamHandler = new JsonRpcStreamHandler(
        this.process.stdout,
        this.process.stdin,
        this.logger.child({ component: "shell-stream-handler" })
      );

      // Track if process exits very quickly (indicates sandbox-exec failure)
      let hasExitedEarly = false;
      const earlyExitTimer = setTimeout(() => {
        // Process survived past 100ms, consider it started successfully
        this.logger.trace("Process survived past early-exit threshold");
      }, 100);

      // Handle process events
      this.process.on("error", error => {
        clearTimeout(earlyExitTimer);
        this.logger.error({ error }, "Shell MCP server process error");
        this.cleanup();
      });

      this.process.on("exit", (code, signal) => {
        clearTimeout(earlyExitTimer);

        // Detect early exit (< 100ms) which suggests sandbox-exec rejection
        if (!hasExitedEarly) {
          hasExitedEarly = true;
          this.logger.error(
            {
              exitCode: code,
              signal,
              stderr: this.stderrBuffer.join("\n"),
              timing: "early-exit-detected",
            },
            "Process exited within 100ms - possible sandbox-exec policy rejection"
          );
        }

        // Log exit at appropriate level based on whether we expected it
        const logLevel = this.isStarted && code === 0 ? "debug" : "error";
        const logData = {
          exitCode: code,
          signal,
          stderr: this.stderrBuffer.join("\n"),
        };

        if (logLevel === "error") {
          this.logger.error(
            logData,
            "Shell MCP server process exited unexpectedly"
          );
        } else {
          this.logger.debug(logData, "Shell MCP server process exited");
        }

        this.cleanup();
      });

      // Capture stderr output for error reporting
      this.process.stderr.on("data", (chunk: Buffer) => {
        const stderr = chunk.toString("utf8").trim();
        if (stderr) {
          // Buffer stderr lines for exit reporting
          this.stderrBuffer.push(stderr);

          // Also log immediately at error level for visibility
          this.logger.error({ stderr }, "Shell MCP server stderr");
        }
      });

      // Platform-specific tempfile cleanup
      if (process.platform !== "win32") {
        // Unix: Set timer to unlink tempfile after 150ms
        this.tempScriptCleanupTimer = setTimeout(() => {
          if (this.tempScriptPath && existsSync(this.tempScriptPath)) {
            try {
              unlinkSync(this.tempScriptPath);
              this.logger.debug(
                { tempScriptPath: this.tempScriptPath },
                "Unlinked temporary script file"
              );
            } catch (error) {
              this.logger.warn(
                { error, tempScriptPath: this.tempScriptPath },
                "Failed to unlink temporary script file"
              );
            }
          }
        }, 150);
      }
      // Windows: Keep tempfile until cleanup (no immediate unlink)

      // Start the stream handler to listen for JSON-RPC responses
      // Note: We don't await this as it runs indefinitely until stopped
      this.streamHandler.start().catch(error => {
        this.logServerError(error, "Stream handler failed");
        this.cleanup();
      });

      this.isStarted = true;
      this.logServerStartup({
        command: this.command,
        cwd: this.cwd,
        sandboxEnabled: this.sandboxConfig.enabled,
      });
    } catch (error) {
      this.logServerError(error, "Failed to start shell MCP server process");
      this.cleanup();
      throw error;
    }
  }

  /**
   * Stop the shell MCP server process and clean up resources
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.logger.debug("Stopping shell MCP server process");

    // Stop stream handler first
    if (this.streamHandler) {
      await this.streamHandler.stop();
      this.streamHandler = null;
    }

    // Terminate process
    if (this.process && !this.process.killed) {
      this.process.kill("SIGTERM");

      // Give process time to exit gracefully
      const timeout = setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.logger.warn("Force killing shell MCP server process");
          this.process.kill("SIGKILL");
        }
      }, 5000);

      // Wait for process to exit
      await new Promise<void>(resolve => {
        if (!this.process || this.process.killed) {
          resolve();
          return;
        }

        this.process.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    this.cleanup();
    this.logger.info("Shell MCP server process stopped");
  }

  /**
   * Clean up internal state
   */
  private cleanup(): void {
    // Clear tempfile cleanup timer if it exists
    if (this.tempScriptCleanupTimer) {
      clearTimeout(this.tempScriptCleanupTimer);
      this.tempScriptCleanupTimer = null;
    }

    // Remove tempfile if it still exists
    if (this.tempScriptPath && existsSync(this.tempScriptPath)) {
      try {
        unlinkSync(this.tempScriptPath);
        this.logger.debug(
          { tempScriptPath: this.tempScriptPath },
          "Cleaned up temporary script file"
        );
      } catch (error) {
        this.logger.warn(
          { error, tempScriptPath: this.tempScriptPath },
          "Failed to clean up temporary script file"
        );
      }
    }

    this.isStarted = false;
    this.process = null;
    this.streamHandler = null;
    this.tempScriptPath = null;
    // Note: Preserve stderr buffer for error reporting in case cleanup is called multiple times
  }
}
