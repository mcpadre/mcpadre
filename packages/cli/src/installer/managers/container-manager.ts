// pattern: Mixed (unavoidable)
// Container management integrates Docker API with filesystem operations

import Docker from "dockerode";

import { getServerPath } from "../../config/types/workspace.js";
import { ContainerError } from "../../utils/errors.js";
import { ContainerLockManager } from "../container-lock.js";

import type { WorkspaceContext } from "../../config/types/index.js";
import type { ContainerOptionsV1 } from "../../config/types/v1/server/index.js";
import type { Logger } from "pino";

/**
 * Options for pulling and managing container images
 */
export interface ContainerInstallOptions {
  /** Server name for directory structure */
  serverName: string;
  /** Container configuration from mcpadre config */
  container: ContainerOptionsV1;
  /** Workspace context containing configuration and directory paths */
  context: WorkspaceContext;
  /** Logger instance */
  logger: Logger;
  /** Dry run mode - don't actually pull images */
}

/**
 * Result of container installation
 */
export interface ContainerInstallResult {
  /** Whether the image was pulled */
  imagePulled: boolean;
  /** Human-readable status message */
  message: string;
  /** Image digest after pull (if pulled) */
  digest?: string;
}

/**
 * Manages container image pulling and lock file management for mcpadre install
 */
export class ContainerManager {
  private docker: Docker;

  constructor(logger: Logger) {
    // Initialize Docker client with DOCKER_HOST support
    const dockerHost = process.env["DOCKER_HOST"];

    if (dockerHost) {
      logger.debug({ dockerHost }, "Using DOCKER_HOST environment variable");
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
  }

  /**
   * Install (pull if needed) container image based on trust-on-first-use model
   */
  async installContainer(
    options: ContainerInstallOptions
  ): Promise<ContainerInstallResult> {
    const { serverName, container, context, logger } = options;
    const { image, tag, pullWhenDigestChanges = false } = container;

    logger.debug(
      { serverName, image, tag, pullWhenDigestChanges },
      "Installing container image"
    );

    // Warn if using non-fully-qualified versions
    if (!tag.match(/^v?\d+\.\d+\.\d+/)) {
      if (tag.match(/^v?\d+(\.\d+)?$/)) {
        logger.warn(
          `Container ${image}:${tag} uses a partial version tag. Consider using a fully qualified semantic version (X.Y.Z) for better reproducibility.`
        );
      } else if (tag === "latest" || tag === "main" || tag === "master") {
        logger.warn(
          `Container ${image}:${tag} uses a mutable tag. Consider using a specific version tag for better reproducibility.`
        );
      }
    }

    // Set up lock manager with correct path based on mode
    const serverDir = getServerPath(context, serverName);
    const lockManager = new ContainerLockManager(serverDir, this.docker);

    try {
      // Check if we should pull the image (includes remote digest checking)
      const pullDecision = await lockManager.shouldPullImage(image, {
        tag,
        pullWhenDigestChanges,
      });

      if (pullDecision.isError) {
        throw new ContainerError(pullDecision.reason);
      }

      if (!pullDecision.shouldPull) {
        logger.debug({ reason: pullDecision.reason }, "Skipping image pull");
        return {
          imagePulled: false,
          message: pullDecision.reason,
        };
      }

      // Pull the image
      logger.info(`Pulling container image ${image}:${tag}...`);
      const digest = await this.pullImage(image, tag, logger);

      // Update lock file after successful pull
      await lockManager.updateLockAfterPull(image, tag, digest);

      logger.info(
        `Successfully pulled ${image}:${tag} (${digest.substring(0, 19)}...)`
      );

      return {
        imagePulled: true,
        message: `Pulled ${image}:${tag} - ${pullDecision.reason}`,
        digest,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const errorMessage = `Failed to install container ${image}:${tag}: ${message}`;
      logger.error({ error, serverName, image, tag }, errorMessage);
      throw new ContainerError(errorMessage);
    }
  }

  /**
   * Pull container image and return its digest
   */
  private async pullImage(
    image: string,
    tag: string,
    logger: Logger
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const imageRef = `${image}:${tag}`;

      // Set a 60-second timeout for Docker pull operations
      const pullTimeout = setTimeout(() => {
        reject(
          new Error(`Docker pull timeout after 60 seconds for ${imageRef}`)
        );
      }, 60000);

      const cleanup = (): void => {
        clearTimeout(pullTimeout);
      };

      this.docker.pull(imageRef, (err: unknown, stream: unknown) => {
        if (err) {
          cleanup();
          reject(err);
          return;
        }

        if (!stream) {
          cleanup();
          reject(new Error("No stream returned from Docker pull"));
          return;
        }

        // Track pull progress
        this.docker.modem.followProgress(
          stream as NodeJS.ReadableStream,
          // onFinished
          async (err: unknown, _output: unknown) => {
            cleanup();

            if (err) {
              reject(err);
              return;
            }

            try {
              // Get the pulled image to extract its digest
              const pulledImage = this.docker.getImage(imageRef);
              const imageData = await pulledImage.inspect();

              // Extract digest from RepoDigests
              const repoDigests = imageData.RepoDigests;
              if (!Array.isArray(repoDigests) || repoDigests.length === 0) {
                reject(
                  new Error(`No digest available for pulled image ${imageRef}`)
                );
                return;
              }

              const firstDigest = repoDigests[0];
              if (firstDigest === undefined) {
                reject(
                  new Error(`Empty digest in RepoDigests for ${imageRef}`)
                );
                return;
              }

              const digestMatch = firstDigest.match(/@(sha256:[a-f0-9]+)$/);
              if (!digestMatch?.[1]) {
                reject(new Error(`Could not parse digest from ${firstDigest}`));
                return;
              }

              resolve(digestMatch[1]);
            } catch (inspectError) {
              reject(inspectError);
            }
          },
          // onProgress
          event => {
            // Log progress for debugging
            if (event.status && event.progress) {
              logger.debug(
                { status: event.status, progress: event.progress },
                `Pulling ${imageRef}`
              );
            } else if (event.status) {
              logger.debug({ status: event.status }, `Pulling ${imageRef}`);
            }
          }
        );
      });
    });
  }
}
