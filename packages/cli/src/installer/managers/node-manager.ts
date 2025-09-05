// pattern: Imperative Shell

import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import { join } from "path";

import { createCommand } from "../../utils/command/index.js";
import { NodePackageError } from "../../utils/errors.js";
import { addToServerGitignore } from "../gitignore-manager.js";

import {
  determineNodeUpgrade,
  generatePackageJson,
  generateVersionFiles,
  parsePackageJson,
} from "./node-manager-logic.js";

import type { NodeOptionsV1 } from "../../config/types/v1/server/index.js";
import type { Logger } from "pino";

/**
 * Options for Node.js MCP server installation
 */
export interface NodeInstallOptions {
  /** Server name for directory structure */
  serverName: string;
  /** Node.js configuration from mcpadre config */
  node: NodeOptionsV1;
  /** Base directory where .mcpadre is located */
  projectDir: string;
  /** Server directory path (.mcpadre/servers/$serverName) */
  serverDir: string;
  /** Logger instance */
  logger: Logger;
  /** Force flag override from CLI */
  force?: boolean;
  /** Configuration setting for automatic upgrades */
  installImplicitlyUpgradesChangedPackages?: boolean;
}

/**
 * Result of Node.js installation
 */
export interface NodeInstallResult {
  /** Whether dependencies were installed/updated */
  dependenciesInstalled: boolean;
  /** Whether the environment was synchronized */
  environmentSynced: boolean;
  /** Human-readable status message */
  message: string;
  /** Whether a version upgrade occurred */
  upgradeOccurred?: boolean;
}

/**
 * Manages Node.js environment setup and dependency management for mcpadre install
 */
export class NodeManager {
  /**
   * Create a pnpm command that falls back to npm if pnpm is not available
   */
  private createPnpmCommand(
    args: string[],
    serverDir: string,
    logger: Logger
  ): { output(): Promise<string> } {
    // Try pnpm first
    const pnpmCmd = createCommand("pnpm", logger)
      .addArgs(args)
      .currentDir(serverDir);

    // Create fallback npm command
    const npmCmd = createCommand("npm", logger)
      .addArgs(args)
      .currentDir(serverDir);

    return {
      async output(): Promise<string> {
        try {
          return await pnpmCmd.output();
        } catch {
          logger.debug("pnpm command failed, trying npm...");
          return await npmCmd.output();
        }
      },
    };
  }

  /**
   * Install Node.js MCP server with pnpm dependency management
   */
  async installNode(options: NodeInstallOptions): Promise<NodeInstallResult> {
    const {
      serverName,
      node,
      serverDir,
      logger,
      force = false,
      installImplicitlyUpgradesChangedPackages = false,
    } = options;

    logger.debug(
      {
        serverName,
        package: node.package,
        version: node.version,
        nodeVersion: node.nodeVersion,
      },
      "Installing Node.js MCP server"
    );

    try {
      // Ensure server directory exists
      await mkdir(serverDir, { recursive: true });

      // Check if we need to handle upgrade scenarios first
      const packageJsonPath = join(serverDir, "package.json");
      let packageJsonExists = false;
      try {
        await stat(packageJsonPath);
        packageJsonExists = true;
      } catch {
        packageJsonExists = false;
      }

      // For fresh installs, we can check prerequisites first
      if (!packageJsonExists) {
        // Write Node.js version file first (needed for asdf/mise)
        if (node.nodeVersion) {
          await this.manageNodeVersionFile(serverDir, node.nodeVersion, logger);
        }
        // Check system prerequisites before attempting install
        await this.checkSystemPrerequisites(serverDir, logger);
      }

      // Handle dependency management
      const dependencyResult = await this.manageDependencies({
        node,
        serverDir,
        force,
        installImplicitlyUpgradesChangedPackages,
        logger,
      });

      // For existing projects, only check prerequisites if upgrade was allowed
      if (
        packageJsonExists &&
        (dependencyResult.dependenciesInstalled ||
          dependencyResult.environmentSynced)
      ) {
        await this.checkSystemPrerequisites(serverDir, logger);
      }

      // Add server-specific gitignore patterns for Node.js files
      try {
        const nodePatterns = ["node_modules/", "*.log", ".pnpm-debug.log*"];
        await addToServerGitignore(serverDir, nodePatterns);
        logger.debug(
          { patterns: nodePatterns },
          "Added Node.js gitignore patterns"
        );
      } catch (error) {
        logger.warn(
          { error },
          "Failed to update server .gitignore for Node.js"
        );
      }

      return {
        dependenciesInstalled: dependencyResult.dependenciesInstalled,
        environmentSynced: dependencyResult.environmentSynced,
        message: dependencyResult.message,
        upgradeOccurred: dependencyResult.upgradeOccurred,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const errorMessage = `Failed to install Node.js server ${serverName}: ${message}`;
      logger.error({ error, serverName }, errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Manage .node-version file for mise/asdf integration
   * This must happen BEFORE any node/pnpm commands are executed
   */
  private async manageNodeVersionFile(
    serverDir: string,
    nodeVersion: string,
    logger: Logger
  ): Promise<void> {
    const nodeVersionPath = join(serverDir, ".node-version");
    const toolVersionsPath = join(serverDir, ".tool-versions");

    try {
      // Generate version file contents using pure function
      const versionFiles = generateVersionFiles(nodeVersion);

      // Write .node-version file
      await writeFile(nodeVersionPath, versionFiles.nodeVersion, "utf8");
      logger.debug(
        { nodeVersion, path: nodeVersionPath },
        "Written .node-version file"
      );

      // Write .tool-versions for asdf compatibility
      await writeFile(toolVersionsPath, versionFiles.toolVersions, "utf8");
      logger.debug(
        { nodeVersion, path: toolVersionsPath },
        "Written .tool-versions file"
      );
    } catch (error) {
      throw new NodePackageError(
        `Failed to write Node.js version files: ${error}`
      );
    }
  }

  /**
   * Check system prerequisites (node and pnpm) in the server directory
   * This must happen AFTER .node-version is set up for mise/asdf
   */
  private async checkSystemPrerequisites(
    serverDir: string,
    logger: Logger
  ): Promise<void> {
    // Check node --version in server directory
    try {
      const nodeCmd = createCommand("node", logger)
        .addArgs(["--version"])
        .currentDir(serverDir);

      const nodeResult = await nodeCmd.output();
      const nodeVersion = nodeResult.trim();
      logger.debug({ nodeVersion }, "Node.js version check successful");
    } catch (error) {
      throw new Error(
        `Node.js is not available or not working. Make sure Node.js is installed and accessible via PATH, or use a tool like mise/asdf to manage Node.js versions. Error: ${error}`
      );
    }

    // Check pnpm --version in server directory, install via npm if not available
    try {
      const pnpmCmd = createCommand("pnpm", logger)
        .addArgs(["--version"])
        .currentDir(serverDir);

      const pnpmResult = await pnpmCmd.output();
      const pnpmVersion = pnpmResult.trim();
      logger.debug({ pnpmVersion }, "pnpm version check successful");
    } catch (error) {
      logger.info("pnpm not found, installing via npm...");
      try {
        // Install pnpm using npm globally
        const npmInstallCmd = createCommand("npm", logger)
          .addArgs(["install", "-g", "pnpm"])
          .currentDir(serverDir);

        await npmInstallCmd.output();
        logger.info("Successfully installed pnpm via npm");

        // Verify pnpm is available
        try {
          const pnpmVerifyCmd = createCommand("pnpm", logger)
            .addArgs(["--version"])
            .currentDir(serverDir);

          const pnpmVersion = await pnpmVerifyCmd.output();
          logger.debug(
            { pnpmVersion: pnpmVersion.trim() },
            "pnpm installation verified"
          );
        } catch (verifyError) {
          throw new Error(
            `pnpm installation succeeded but verification failed: ${verifyError}`
          );
        }
      } catch (npmError) {
        throw new Error(
          `Failed to install pnpm via npm. Please ensure Node.js and npm are working. Original pnpm error: ${error}. npm installation error: ${npmError}`
        );
      }
    }
  }

  /**
   * Manage dependencies using package.json and pnpm
   */
  private async manageDependencies(options: {
    node: NodeOptionsV1;
    serverDir: string;
    force: boolean;
    installImplicitlyUpgradesChangedPackages: boolean;
    logger: Logger;
  }): Promise<{
    dependenciesInstalled: boolean;
    environmentSynced: boolean;
    message: string;
    upgradeOccurred: boolean;
  }> {
    const {
      node,
      serverDir,
      force,
      installImplicitlyUpgradesChangedPackages,
      logger,
    } = options;
    const packageJsonPath = join(serverDir, "package.json");

    // Read existing configuration if it exists
    let existingPackageJson = null;
    try {
      const existingContent = await readFile(packageJsonPath, "utf8");
      existingPackageJson = parsePackageJson(existingContent);
    } catch {
      // File doesn't exist or can't be read
      existingPackageJson = null;
    }

    // Determine what action to take using pure function
    const upgradeDecision = determineNodeUpgrade(existingPackageJson, node, {
      force,
      implicitUpgrade: installImplicitlyUpgradesChangedPackages,
    });

    // Execute the determined action
    switch (upgradeDecision.action) {
      case "CREATE":
        return await this.createNewProject(node, serverDir, logger);
      case "UPGRADE":
        return await this.upgradeProject(
          node,
          serverDir,
          upgradeDecision.changes,
          logger
        );
      case "SYNC":
        return await this.syncEnvironment(node, serverDir, logger);
      case "SKIP":
        return {
          dependenciesInstalled: false,
          environmentSynced: false,
          message: `Version changes detected but upgrade not permitted: ${upgradeDecision.changes.join(", ")}`,
          upgradeOccurred: false,
        };
      default:
        throw new Error(`Unknown upgrade action: ${upgradeDecision.action}`);
    }
  }

  /**
   * Create new Node.js project with package.json and pnpm-lock.yaml
   */
  private async createNewProject(
    node: NodeOptionsV1,
    serverDir: string,
    logger: Logger
  ): Promise<{
    dependenciesInstalled: boolean;
    environmentSynced: boolean;
    message: string;
    upgradeOccurred: boolean;
  }> {
    // Write Node.js version file first (needed for asdf/mise before any node commands)
    if (node.nodeVersion) {
      await this.manageNodeVersionFile(serverDir, node.nodeVersion, logger);
    }

    const packageJsonPath = join(serverDir, "package.json");
    const serverName = serverDir.split("/").pop() ?? "unknown";

    // Generate package.json content using pure function
    const packageJsonContent = generatePackageJson(serverName, node);

    // Write package.json
    await writeFile(packageJsonPath, packageJsonContent, "utf8");
    logger.debug({ path: packageJsonPath }, "Created package.json");

    // Run pnpm install (ignore workspace to install dependencies locally)
    const installCmd = this.createPnpmCommand(
      ["install", "--ignore-workspace"],
      serverDir,
      logger
    );
    await installCmd.output();
    logger.info("Created pnpm-lock.yaml file");

    return {
      dependenciesInstalled: true,
      environmentSynced: false,
      message: "Created new Node.js project with exact dependencies",
      upgradeOccurred: false,
    };
  }

  /**
   * Sync existing environment without version changes
   */
  private async syncEnvironment(
    node: NodeOptionsV1,
    serverDir: string,
    logger: Logger
  ): Promise<{
    dependenciesInstalled: boolean;
    environmentSynced: boolean;
    message: string;
    upgradeOccurred: boolean;
  }> {
    // Write Node.js version file (needed for asdf/mise before any node commands)
    if (node.nodeVersion) {
      await this.manageNodeVersionFile(serverDir, node.nodeVersion, logger);
    }

    const syncCmd = this.createPnpmCommand(
      ["install", "--ignore-workspace"],
      serverDir,
      logger
    );
    await syncCmd.output();
    logger.debug("Synchronized environment with pnpm install");

    return {
      dependenciesInstalled: false,
      environmentSynced: true,
      message: "Environment synchronized with existing dependencies",
      upgradeOccurred: false,
    };
  }

  /**
   * Upgrade project with new versions
   */
  private async upgradeProject(
    node: NodeOptionsV1,
    serverDir: string,
    changes: string[],
    logger: Logger
  ): Promise<{
    dependenciesInstalled: boolean;
    environmentSynced: boolean;
    message: string;
    upgradeOccurred: boolean;
  }> {
    const packageJsonPath = join(serverDir, "package.json");
    const pnpmLockPath = join(serverDir, "pnpm-lock.yaml");

    logger.warn(
      { changes },
      "Upgrading Node.js project due to version changes"
    );

    // Write Node.js version file first (needed for asdf/mise before any node commands)
    if (node.nodeVersion) {
      await this.manageNodeVersionFile(serverDir, node.nodeVersion, logger);
    }

    // Remove existing lock file
    try {
      await unlink(pnpmLockPath);
      logger.debug("Removed existing pnpm-lock.yaml file");
    } catch {
      // File might not exist, that's okay
    }

    // Generate new package.json content using pure function
    const serverName = serverDir.split("/").pop() ?? "unknown";
    const newPackageJsonContent = generatePackageJson(serverName, node);
    await writeFile(packageJsonPath, newPackageJsonContent, "utf8");
    logger.debug("Updated package.json with new versions");

    // Run pnpm install to regenerate lock file
    const installCmd = this.createPnpmCommand(
      ["install", "--ignore-workspace"],
      serverDir,
      logger
    );
    await installCmd.output();
    logger.info("Regenerated pnpm-lock.yaml with new versions");

    return {
      dependenciesInstalled: true,
      environmentSynced: false,
      message: `Upgraded project: ${changes.join(", ")}`,
      upgradeOccurred: true,
    };
  }
}
