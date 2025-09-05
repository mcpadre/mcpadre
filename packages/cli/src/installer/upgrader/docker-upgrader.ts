// pattern: Imperative Shell
// Docker container upgrade logic

import { ContainerManager } from "../managers/container-manager.js";

import type { DockerUpgradeOptions, SingleUpgradeResult } from "./types.js";
import type { Logger } from "pino";

/**
 * Upgrade a Docker container server to a new version
 */
export async function upgradeDockerServer(
  options: DockerUpgradeOptions,
  logger: Logger
): Promise<SingleUpgradeResult> {
  const { serverName, image, currentTag, targetTag, serverDir, digestInfo } =
    options;

  logger.debug(
    `Upgrading Docker server ${serverName} from ${currentTag} to ${targetTag}`
  );

  try {
    // Handle two different cases:
    // 1. Tag change (e.g., v1.0 -> v2.0): Just pull new image and update lock
    // 2. Same tag but digest change (e.g., latest with new digest): Pull updated image

    const containerManager = new ContainerManager(logger);

    let pullResult: { imagePulled: boolean; message: string; digest?: string };

    if (currentTag !== targetTag) {
      // Case 1: Tag change - always pull new tag
      logger.debug(
        `Tag changed from ${currentTag} to ${targetTag}, pulling new image`
      );

      pullResult = await containerManager.installContainer({
        serverName,
        container: {
          image,
          tag: targetTag,
          pullWhenDigestChanges: true, // Allow pulling for explicit upgrades
        },
        projectDir: serverDir, // Use server dir directly
        logger,
      });
    } else if (digestInfo?.digestChanged) {
      // Case 2: Same tag but digest changed (e.g., latest tag updated)
      logger.debug(
        `Digest changed for ${currentTag} tag, pulling updated image`
      );

      pullResult = await containerManager.installContainer({
        serverName,
        container: {
          image,
          tag: targetTag,
          pullWhenDigestChanges: true, // Allow pulling for digest updates
        },
        projectDir: serverDir, // Use server dir directly
        logger,
      });
    } else {
      // Case 3: No actual change detected (shouldn't happen in upgrade flow)
      logger.warn("No tag or digest change detected, skipping Docker pull");
      pullResult = {
        imagePulled: false,
        message: "No changes detected",
      };
    }

    // Determine the version info to return
    const upgradeType = determineUpgradeType(currentTag, targetTag);

    const result: SingleUpgradeResult = {
      serverName,
      success:
        pullResult.imagePulled || pullResult.message !== "No changes detected",
      oldVersion: currentTag,
      newVersion: targetTag,
      ...(upgradeType && { upgradeType }),
    };

    // Add digest info if available
    if (pullResult.digest || digestInfo) {
      const digestResult: {
        oldDigest?: string;
        newDigest?: string;
        digestChanged?: boolean;
      } = {};

      if (digestInfo?.currentDigest) {
        digestResult.oldDigest = digestInfo.currentDigest;
      }

      if (pullResult.digest) {
        digestResult.newDigest = pullResult.digest;
      } else if (digestInfo?.latestDigest) {
        digestResult.newDigest = digestInfo.latestDigest;
      }

      if (digestInfo?.digestChanged !== undefined) {
        digestResult.digestChanged = digestInfo.digestChanged;
      }

      result.digestInfo = digestResult;
    }

    if (result.success) {
      logger.info(
        `Successfully upgraded ${serverName} from ${currentTag} to ${targetTag}`
      );
    } else {
      logger.info(`Docker upgrade for ${serverName}: ${pullResult.message}`);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { error, serverName, image, currentTag, targetTag },
      `Failed to upgrade Docker server: ${message}`
    );

    return {
      serverName,
      success: false,
      oldVersion: currentTag,
      error: `Docker upgrade failed: ${message}`,
    };
  }
}

/**
 * Determine upgrade type based on version tags
 */
function determineUpgradeType(
  currentTag: string,
  targetTag: string
): "major" | "minor" | "patch" | undefined {
  // If tags are the same, it's a digest-only update
  if (currentTag === targetTag) {
    return undefined;
  }

  // Simple semver detection (handles v1.2.3 and 1.2.3 formats)
  const semverRegex = /^v?(\d+)\.(\d+)\.(\d+)/;
  const currentMatch = currentTag.match(semverRegex);
  const targetMatch = targetTag.match(semverRegex);

  if (!currentMatch || !targetMatch) {
    // Not semver, return undefined (unknown upgrade type)
    return undefined;
  }

  const currentMajor = parseInt(currentMatch[1] ?? "0", 10);
  const currentMinor = parseInt(currentMatch[2] ?? "0", 10);
  const currentPatch = parseInt(currentMatch[3] ?? "0", 10);

  const targetMajor = parseInt(targetMatch[1] ?? "0", 10);
  const targetMinor = parseInt(targetMatch[2] ?? "0", 10);
  const targetPatch = parseInt(targetMatch[3] ?? "0", 10);

  if (targetMajor > currentMajor) return "major";
  if (targetMinor > currentMinor) return "minor";
  if (targetPatch > currentPatch) return "patch";

  return undefined;
}
