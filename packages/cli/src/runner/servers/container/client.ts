// pattern: Mixed (unavoidable)
// Container MCP client integrates Docker container management with JSON-RPC communication

import { randomUUID } from "node:crypto";
import { PassThrough, Writable } from "node:stream";

import Docker from "dockerode";

import { ContainerError } from "../../../utils/errors.js";
import { JsonRpcStreamHandler } from "../../session/stream-handler.js";
import { BaseMcpClient } from "../common/base-client.js";

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../../test-utils/json-rpc/types.js";
import type { FinalizedSandboxConfig } from "../../../utils/sandbox/index.js";
import type { ResolvedPath } from "../../types/index.js";
import type { Container } from "dockerode";
import type { Logger } from "pino";

export interface ContainerMcpClientOptions {
  /** Docker image name */
  image: string;
  /** Docker image tag */
  tag: string;
  /** Optional command to override container default */
  command?: string[];
  /** Environment variables for the container */
  env: Record<string, string>;
  /** Volume mounts for the container */
  volumes?: Record<
    string,
    { hostPath: string; containerPath: string; readOnly?: boolean }
  >;
  /** Working directory context */
  cwd: ResolvedPath;
  /** Sandbox configuration (currently unused for containers but kept for consistency) */
  sandboxConfig: FinalizedSandboxConfig;
  /** Logger instance */
  logger: Logger;
  /** Server name for logging context */
  serverName: string;
}

/**
 * Container MCP client that spawns Docker containers and communicates over stdin/stdout
 * using JSON-RPC protocol. Follows the same pattern as ShellMcpClient but uses Docker.
 */
export class ContainerMcpClient extends BaseMcpClient {
  private docker: Docker;
  private container: Container | null = null;
  private streamHandler: JsonRpcStreamHandler | null = null;
  private isStarted = false;
  private containerName: string;

  constructor(private readonly options: ContainerMcpClientOptions) {
    super(options.logger, options.serverName);

    // Initialize Docker client with DOCKER_HOST support
    const dockerHost = process.env["DOCKER_HOST"];

    if (dockerHost) {
      options.logger.debug(
        { dockerHost },
        "Using DOCKER_HOST environment variable"
      );
      // Parse DOCKER_HOST format (e.g., tcp://127.0.0.1:2376)
      if (dockerHost.startsWith("tcp://")) {
        const url = new URL(dockerHost);
        this.docker = new Docker({
          host: url.hostname,
          port: parseInt(url.port, 10),
          protocol: "http", // Docker daemon typically uses HTTP even over TCP
        });
      } else if (dockerHost.startsWith("unix://")) {
        this.docker = new Docker({
          socketPath: dockerHost.replace("unix://", ""),
        });
      } else {
        // Assume it's a socket path
        this.docker = new Docker({
          socketPath: dockerHost,
        });
      }
    } else {
      // Use default Docker configuration
      this.docker = new Docker();
    }

    // Generate unique container name with timestamp to avoid collisions
    const timestamp = Date.now();
    const uuid = randomUUID().substring(0, 8); // Short UUID for readability
    this.containerName = `mcpadre-${options.image.replace(/[^a-zA-Z0-9_-]/g, "_")}-${timestamp}-${uuid}`;
  }

  protected getClientType(): string {
    return "container-client";
  }

  /**
   * Send a JSON-RPC request to the container server and wait for response
   */
  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.options.logger.debug(
      {
        requestId: request.id,
        method: request.method,
        containerName: this.containerName,
        isStarted: this.isStarted,
        hasStreamHandler: !!this.streamHandler,
      },
      "Container client: sending JSON-RPC request"
    );

    if (!this.isStarted || !this.streamHandler) {
      this.options.logger.debug(
        { containerName: this.containerName },
        "Container client: starting container before sending request"
      );
      await this.startContainer();
    }

    if (!this.streamHandler) {
      this.options.logger.error(
        { containerName: this.containerName },
        "Container client: no stream handler after container start"
      );
      throw new ContainerError("Failed to start container MCP server");
    }

    try {
      this.options.logger.debug(
        {
          requestId: request.id,
          method: request.method,
          containerName: this.containerName,
        },
        "Container client: delegating to stream handler"
      );

      const response = await this.streamHandler.sendRequest(request);

      if (!response) {
        throw new Error(
          `No response received for request ${request.id} (notifications should not be sent through send() method)`
        );
      }

      this.options.logger.debug(
        {
          requestId: request.id,
          responseId: response.id,
          hasResult: "result" in response,
          hasError: "error" in response,
          containerName: this.containerName,
        },
        "Container client: received response from stream handler"
      );

      return response;
    } catch (error) {
      this.options.logger.error(
        {
          error,
          requestId: request.id,
          method: request.method,
          containerName: this.containerName,
        },
        "Container client: error sending request through stream handler"
      );
      throw error;
    }
  }

  /**
   * Start the container MCP server with proper lifecycle management
   */
  private async startContainer(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.options.logger.debug(
      {
        image: this.options.image,
        tag: this.options.tag,
        containerName: this.containerName,
        cwd: this.options.cwd,
      },
      "Starting container MCP server"
    );

    try {
      const imageRef = `${this.options.image}:${this.options.tag}`;

      // Prepare environment variables
      const containerEnv: string[] = [];
      for (const [key, value] of Object.entries(this.options.env)) {
        containerEnv.push(`${key}=${value}`);
      }

      // Prepare command arguments
      let containerCmd = this.options.command;
      containerCmd ??= undefined;

      // Prepare volume binds for Docker
      const binds: string[] = [];
      if (this.options.volumes) {
        for (const [volumeKey, volume] of Object.entries(
          this.options.volumes
        )) {
          const readOnlyFlag = volume.readOnly ? ":ro" : "";
          const bind = `${volume.hostPath}:${volume.containerPath}${readOnlyFlag}`;
          binds.push(bind);
          this.options.logger.debug(
            {
              volumeKey,
              hostPath: volume.hostPath,
              containerPath: volume.containerPath,
              readOnly: volume.readOnly,
            },
            "Adding volume mount"
          );
        }
      }

      // Create container with proper configuration for MCP communication
      this.container = await this.docker.createContainer({
        Image: imageRef,
        Cmd: containerCmd,
        Env: containerEnv,
        WorkingDir: "/tmp", // Default working directory inside container
        name: this.containerName,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        OpenStdin: true,
        StdinOnce: false,
        Tty: false, // Important: TTY must be false for proper JSON-RPC stream demuxing
        // Clean up automatically when container exits
        HostConfig: {
          AutoRemove: true,
          // Apply basic security restrictions
          ReadonlyRootfs: false, // Some MCP servers may need to write temp files
          // Mount volumes
          Binds: binds.length > 0 ? binds : undefined,
          // TODO: Consider adding more security constraints
        },
      });

      // Start the container
      this.options.logger.debug(
        { containerName: this.containerName },
        "Container client: starting container"
      );
      await this.container.start();
      this.options.logger.info(
        { containerName: this.containerName },
        "Container client: container started successfully"
      );

      // Attach to container streams for JSON-RPC communication
      this.options.logger.debug(
        { containerName: this.containerName },
        "Container client: attaching to container streams"
      );
      const stream = await this.container.attach({
        stream: true,
        stdout: true,
        stderr: true,
        stdin: true,
      });
      this.options.logger.debug(
        { containerName: this.containerName },
        "Container client: stream attachment successful"
      );

      // Since Tty is false, we need to demux the stream
      // Docker multiplexes stdout/stderr into a single stream when Tty=false
      // Create properly typed PassThrough streams for demuxing
      const stdout = new PassThrough();
      const stderr = new PassThrough();

      this.options.logger.debug(
        { containerName: this.containerName },
        "Container client: setting up stream demuxing"
      );

      // Demux the Docker stream using dockerode's standard pattern
      // When Tty=false, Docker multiplexes stdout/stderr into a single stream
      // dockerode provides demuxStream to separate them properly
      this.docker.modem.demuxStream(stream, stdout, stderr);

      this.options.logger.debug(
        { containerName: this.containerName },
        "Container client: stream demuxing setup complete"
      );

      // Add detailed logging for stdout data flow
      stdout.on("data", (chunk: Buffer) => {
        const stdoutText = chunk.toString("utf8");
        this.options.logger.trace(
          {
            containerName: this.containerName,
            chunkLength: chunk.length,
            stdoutText: stdoutText.trim(),
          },
          "Container client: received stdout data chunk"
        );
      });

      // Handle stderr separately for logging
      stderr.on("data", (chunk: Buffer) => {
        const stderrText = chunk.toString("utf8").trim();
        if (stderrText) {
          this.options.logger.warn(
            { stderr: stderrText, containerName: this.containerName },
            "Container MCP server stderr"
          );
        }
      });

      // Add stream event logging
      stdout.on("end", () => {
        this.options.logger.debug(
          { containerName: this.containerName },
          "Container client: stdout stream ended"
        );
      });

      stdout.on("error", error => {
        this.options.logger.error(
          { error, containerName: this.containerName },
          "Container client: stdout stream error"
        );
      });

      stderr.on("end", () => {
        this.options.logger.debug(
          { containerName: this.containerName },
          "Container client: stderr stream ended"
        );
      });

      stderr.on("error", error => {
        this.options.logger.error(
          { error, containerName: this.containerName },
          "Container client: stderr stream error"
        );
      });

      stream.on("end", () => {
        this.options.logger.debug(
          { containerName: this.containerName },
          "Container client: Docker attach stream ended"
        );
      });

      stream.on("error", error => {
        this.options.logger.error(
          { error, containerName: this.containerName },
          "Container client: Docker attach stream error"
        );
      });

      // Set up JSON-RPC stream handler using the properly typed streams
      // stdout: Readable stream for JSON-RPC responses from container
      // stream: The original Docker attach stream for writing JSON-RPC requests to container stdin
      this.streamHandler = new JsonRpcStreamHandler(
        stdout, // Read JSON-RPC from demuxed stdout (properly typed PassThrough)
        stream as unknown as Writable, // Docker attach stream is ReadWriteStream, compatible with Writable interface
        this.options.logger.child({ component: "container-stream-handler" })
      );

      // Handle container events - remove this as dockerode Container doesn't have EventEmitter methods
      // Container cleanup will be handled by AutoRemove and explicit stop() calls

      // Start the stream handler to listen for JSON-RPC responses
      // Note: We don't await this as it runs indefinitely until stopped
      this.streamHandler.start().catch(error => {
        this.options.logger.error(
          { error, containerName: this.containerName },
          "Container stream handler failed"
        );
        this.cleanup();
      });

      this.isStarted = true;
      this.options.logger.info(
        { containerName: this.containerName },
        "Container MCP server started successfully"
      );
    } catch (error) {
      this.options.logger.error(
        { error, containerName: this.containerName },
        "Failed to start container MCP server"
      );
      this.cleanup();
      throw error;
    }
  }

  /**
   * Stop the container MCP server and clean up resources
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.options.logger.debug(
      { containerName: this.containerName },
      "Stopping container MCP server"
    );

    // Stop stream handler first
    if (this.streamHandler) {
      await this.streamHandler.stop();
      this.streamHandler = null;
    }

    // Stop and remove container
    if (this.container) {
      try {
        // Container should auto-remove due to AutoRemove=true
        // But we'll attempt to stop it gracefully first
        await this.container.stop({ t: 5 }); // 5 second timeout for graceful stop
      } catch (error: unknown) {
        // Container might already be stopped/removed
        const errorWithStatus = error as unknown as { statusCode?: number };
        if (
          error instanceof Error &&
          "statusCode" in error &&
          errorWithStatus.statusCode !== 304 &&
          errorWithStatus.statusCode !== 404
        ) {
          this.options.logger.warn(
            { error, containerName: this.containerName },
            "Error stopping container (may already be stopped)"
          );
        }
      }
    }

    this.cleanup();
    this.options.logger.info(
      { containerName: this.containerName },
      "Container MCP server stopped"
    );
  }

  /**
   * Clean up internal state
   */
  private cleanup(): void {
    this.isStarted = false;
    this.container = null;
    this.streamHandler = null;
  }
}
