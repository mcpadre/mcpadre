// pattern: Imperative Shell
// Node.js server upgrade logic

import { readFile, writeFile } from "fs/promises";
import { join } from "path";

import { createCommand } from "../../utils/command/index.js";
import { NodePackageError } from "../../utils/errors.js";
import { auditNpmPackage } from "../outdated/npm-detector.js";

import type { NodeUpgradeOptions, SingleUpgradeResult } from "./types.js";
import type { Logger } from "pino";

/**
 * Upgrade a Node.js server to a new version
 */
export async function upgradeNodeServer(
  options: NodeUpgradeOptions,
  logger: Logger
): Promise<SingleUpgradeResult> {
  const {
    serverName,
    packageName,
    currentVersion,
    targetVersion,
    serverDir,
    skipAudit,
  } = options;

  logger.debug(
    `Upgrading Node.js server ${serverName} from ${currentVersion} to ${targetVersion}`
  );

  try {
    // Step 1: Install new package version using pnpm
    logger.debug(`Installing ${packageName}@${targetVersion} in ${serverDir}`);

    const installCmd = createCommand("pnpm", logger)
      .addArgs([
        "install",
        `${packageName}@${targetVersion}`,
        "--ignore-workspace",
      ])
      .currentDir(serverDir);

    try {
      await installCmd.output();
    } catch {
      // Fallback to npm if pnpm fails
      logger.debug("pnpm install failed, trying npm...");
      const npmCmd = createCommand("npm", logger)
        .addArgs(["install", `${packageName}@${targetVersion}`])
        .currentDir(serverDir);

      await npmCmd.output();
    }

    // Step 2: Update package.json with exact version
    const packageJsonPath = join(serverDir, "package.json");
    let packageJsonContent: string;

    try {
      packageJsonContent = await readFile(packageJsonPath, "utf8");
    } catch (error) {
      throw new NodePackageError(`Failed to read package.json: ${error}`);
    }

    // Parse package.json as generic object to handle all dependency types
    const packageJson = JSON.parse(packageJsonContent) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      [key: string]: unknown;
    };

    // Update the dependency version (could be in dependencies or devDependencies)
    if (packageJson.dependencies?.[packageName]) {
      packageJson.dependencies[packageName] = targetVersion;
    } else if (packageJson.devDependencies?.[packageName]) {
      packageJson.devDependencies[packageName] = targetVersion;
    } else {
      logger.warn(
        `Package ${packageName} not found in package.json dependencies`
      );
    }

    // Write updated package.json
    await writeFile(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8"
    );
    logger.debug("Updated package.json with new version");

    // Step 3: Regenerate lock file
    logger.debug("Regenerating lock file...");

    const lockCmd = createCommand("pnpm", logger)
      .addArgs(["install", "--ignore-workspace"])
      .currentDir(serverDir);

    try {
      await lockCmd.output();
    } catch {
      // Fallback to npm if pnpm fails
      logger.debug("pnpm install failed, trying npm...");
      const npmLockCmd = createCommand("npm", logger)
        .addArgs(["install"])
        .currentDir(serverDir);

      await npmLockCmd.output();
    }

    // Step 4: Run post-upgrade audit if not skipped
    const auditWarnings: string[] = [];
    if (!skipAudit) {
      try {
        logger.debug("Running post-upgrade security audit...");
        const auditResult = await auditNpmPackage(serverDir, logger);

        if (auditResult.hasVulnerabilities) {
          const warningMsg = `Security audit found ${auditResult.vulnerabilityCount} vulnerabilities (highest: ${auditResult.severity})`;
          auditWarnings.push(warningMsg);
          logger.warn(warningMsg);
        } else {
          logger.debug("No vulnerabilities found in security audit");
        }
      } catch (auditError) {
        logger.warn(`Security audit failed: ${auditError}`);
        auditWarnings.push(`Security audit failed: ${auditError}`);
      }
    }

    const result: SingleUpgradeResult = {
      serverName,
      success: true,
      oldVersion: currentVersion,
      newVersion: targetVersion,
    };

    // Add audit warnings to result if any
    if (auditWarnings.length > 0) {
      result.error = auditWarnings.join("; ");
    }

    logger.info(
      `Successfully upgraded ${serverName} from ${currentVersion} to ${targetVersion}`
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { error, serverName, packageName, currentVersion, targetVersion },
      `Failed to upgrade Node.js server: ${message}`
    );

    return {
      serverName,
      success: false,
      oldVersion: currentVersion,
      error: `Upgrade failed: ${message}`,
    };
  }
}
