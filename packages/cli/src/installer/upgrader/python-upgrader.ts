// pattern: Imperative Shell
// Python server upgrade logic

import { writeFile } from "fs/promises";
import { join } from "path";

import { createCommand } from "../../utils/command/index.js";
import { generatePyprojectToml } from "../managers/python-manager-logic.js";
import { auditPythonPackage } from "../outdated/pypi-detector.js";

import type { PythonOptionsV1 } from "../../config/types/v1/server/index.js";
import type { PythonUpgradeOptions, SingleUpgradeResult } from "./types.js";
import type { Logger } from "pino";

/**
 * Upgrade a Python server to a new version
 */
export async function upgradePythonServer(
  options: PythonUpgradeOptions,
  logger: Logger
): Promise<SingleUpgradeResult> {
  const {
    serverName,
    packageName,
    currentVersion,
    targetVersion,
    serverDir,
    pythonVersion,
    skipAudit,
  } = options;

  logger.debug(
    `Upgrading Python server ${serverName} from ${currentVersion} to ${targetVersion}`
  );

  try {
    // Step 1: Update pyproject.toml with new version
    const pyprojectPath = join(serverDir, "pyproject.toml");

    // Create Python config object with new version
    const pythonConfig: PythonOptionsV1 = {
      package: packageName,
      version: targetVersion,
      ...(pythonVersion && { pythonVersion }),
    };

    // Generate new pyproject.toml content
    const newPyprojectContent = generatePyprojectToml(serverName, pythonConfig);

    // Write updated pyproject.toml
    await writeFile(pyprojectPath, newPyprojectContent, "utf8");
    logger.debug("Updated pyproject.toml with new version");

    // Step 2: Run uv lock to regenerate lock file
    logger.debug("Regenerating uv.lock file...");

    const lockCmd = createCommand("uv", logger)
      .addArgs(["lock"])
      .currentDir(serverDir);

    await lockCmd.output();
    logger.debug("Successfully regenerated uv.lock file");

    // Step 3: Run uv sync to update virtual environment
    logger.debug("Syncing virtual environment...");

    const syncCmd = createCommand("uv", logger)
      .addArgs(["sync"])
      .currentDir(serverDir);

    await syncCmd.output();
    logger.debug("Successfully synced virtual environment");

    // Step 4: Run post-upgrade audit if not skipped
    const auditWarnings: string[] = [];
    if (!skipAudit) {
      try {
        logger.debug("Running post-upgrade security audit...");
        const auditResult = await auditPythonPackage(serverDir, logger);

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
      `Failed to upgrade Python server: ${message}`
    );

    return {
      serverName,
      success: false,
      oldVersion: currentVersion,
      error: `Upgrade failed: ${message}`,
    };
  }
}
