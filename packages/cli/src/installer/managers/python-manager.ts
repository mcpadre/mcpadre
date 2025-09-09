// pattern: Imperative Shell

import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import { join } from "path";

import { createCommand } from "../../utils/command/index.js";
import { PythonPackageError } from "../../utils/errors.js";
import { addToServerGitignore } from "../gitignore-manager.js";

import {
  determinePythonUpgrade,
  generatePyprojectToml,
  generateVersionFiles,
  parsePyprojectToml,
} from "./python-manager-logic.js";

import type { PythonOptionsV1 } from "../../config/types/v1/server/index.js";
import type { Logger } from "pino";

/**
 * Options for Python MCP server installation
 */
export interface PythonInstallOptions {
  /** Server name for directory structure */
  serverName: string;
  /** Python configuration from mcpadre config */
  python: PythonOptionsV1;
  /** Base directory where .mcpadre is located */
  projectDir: string;
  /** Server directory path (project: .mcpadre/servers/$serverName, user: servers/$serverName) */
  serverDir: string;
  /** Logger instance */
  logger: Logger;
  /** Force flag override from CLI */
  force?: boolean;
  /** Configuration setting for automatic upgrades */
  installImplicitlyUpgradesChangedPackages?: boolean;
}

/**
 * Result of Python installation
 */
export interface PythonInstallResult {
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
 * Manages Python environment setup and dependency management for mcpadre install
 */
export class PythonManager {
  /**
   * Create a uv command that falls back to python -m uv if direct uv access fails
   */
  private createUvCommand(
    args: string[],
    serverDir: string,
    logger: Logger
  ): { output(): Promise<string> } {
    // Try direct uv first
    const directUvCmd = createCommand("uv", logger)
      .addArgs(args)
      .currentDir(serverDir);

    // Create fallback python -m uv command
    const pythonUvCmd = createCommand("python", logger)
      .addArgs(["-m", "uv", ...args])
      .currentDir(serverDir);

    return {
      async output(): Promise<string> {
        try {
          return await directUvCmd.output();
        } catch {
          logger.debug("Direct uv command failed, trying python -m uv...");
          return await pythonUvCmd.output();
        }
      },
    };
  }

  /**
   * Install Python MCP server with uv dependency management
   */
  async installPython(
    options: PythonInstallOptions
  ): Promise<PythonInstallResult> {
    const {
      serverName,
      python,
      serverDir,
      logger,
      force = false,
      installImplicitlyUpgradesChangedPackages = false,
    } = options;

    logger.debug(
      {
        serverName,
        package: python.package,
        version: python.version,
        pythonVersion: python.pythonVersion,
      },
      "Installing Python MCP server"
    );

    try {
      // Ensure server directory exists
      await mkdir(serverDir, { recursive: true });

      // Check if we need to handle upgrade scenarios first
      const pyprojectPath = join(serverDir, "pyproject.toml");
      let pyprojectExists = false;
      try {
        await stat(pyprojectPath);
        pyprojectExists = true;
      } catch {
        pyprojectExists = false;
      }

      // For fresh installs, we can check prerequisites first
      if (!pyprojectExists) {
        // Write Python version file first (needed for asdf/mise)
        if (python.pythonVersion) {
          await this.managePythonVersionFile(
            serverDir,
            python.pythonVersion,
            logger
          );
        }
        // Check system prerequisites before attempting install
        await this.checkSystemPrerequisites(serverDir, logger);
      }

      // Handle dependency management
      const dependencyResult = await this.manageDependencies({
        python,
        serverDir,
        force,
        installImplicitlyUpgradesChangedPackages,
        logger,
      });

      // For existing projects, only check prerequisites if upgrade was allowed
      if (
        pyprojectExists &&
        (dependencyResult.dependenciesInstalled ||
          dependencyResult.environmentSynced)
      ) {
        await this.checkSystemPrerequisites(serverDir, logger);
      }

      // Add server-specific gitignore patterns for Python files
      try {
        const pythonPatterns = [".venv/", "*.pyc", "__pycache__/", "*.pyo"];
        await addToServerGitignore(serverDir, pythonPatterns);
        logger.debug(
          { patterns: pythonPatterns },
          "Added Python gitignore patterns"
        );
      } catch (error) {
        logger.warn({ error }, "Failed to update server .gitignore for Python");
      }

      return {
        dependenciesInstalled: dependencyResult.dependenciesInstalled,
        environmentSynced: dependencyResult.environmentSynced,
        message: dependencyResult.message,
        upgradeOccurred: dependencyResult.upgradeOccurred,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const errorMessage = `Failed to install Python server ${serverName}: ${message}`;
      logger.error({ error, serverName }, errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Manage .python-version file for mise/asdf integration
   * This must happen BEFORE any python/uv commands are executed
   */
  private async managePythonVersionFile(
    serverDir: string,
    pythonVersion: string,
    logger: Logger
  ): Promise<void> {
    const pythonVersionPath = join(serverDir, ".python-version");
    const toolVersionsPath = join(serverDir, ".tool-versions");

    try {
      // Generate version file contents using pure function
      const versionFiles = generateVersionFiles(pythonVersion);

      // Write .python-version file
      await writeFile(pythonVersionPath, versionFiles.pythonVersion, "utf8");
      logger.debug(
        { pythonVersion, path: pythonVersionPath },
        "Written .python-version file"
      );

      // Write .tool-versions for asdf compatibility
      await writeFile(toolVersionsPath, versionFiles.toolVersions, "utf8");
      logger.debug(
        { pythonVersion, path: toolVersionsPath },
        "Written .tool-versions file"
      );
    } catch (error) {
      throw new PythonPackageError(
        `Failed to write Python version files: ${error}`
      );
    }
  }

  /**
   * Check system prerequisites (python and uv) in the server directory
   * This must happen AFTER .python-version is set up for mise/asdf
   */
  private async checkSystemPrerequisites(
    serverDir: string,
    logger: Logger
  ): Promise<void> {
    // Check python --version in server directory
    try {
      const pythonCmd = createCommand("python", logger)
        .addArgs(["--version"])
        .currentDir(serverDir);

      const pythonResult = await pythonCmd.output();
      const pythonVersion = pythonResult.trim();
      logger.debug({ pythonVersion }, "Python version check successful");
    } catch (error) {
      throw new Error(
        `Python is not available or not working. Make sure Python is installed and accessible via PATH, or use a tool like mise/asdf to manage Python versions. Error: ${error}`
      );
    }

    // Check uv --version in server directory, install via pip if not available
    try {
      const uvCmd = createCommand("uv", logger)
        .addArgs(["--version"])
        .currentDir(serverDir);

      const uvResult = await uvCmd.output();
      const uvVersion = uvResult.trim();
      logger.debug({ uvVersion }, "uv version check successful");
    } catch (error) {
      logger.info("uv not found, installing via pip...");
      try {
        // Install uv using pip
        const pipInstallCmd = createCommand("python", logger)
          .addArgs(["-m", "pip", "install", "uv"])
          .currentDir(serverDir);

        await pipInstallCmd.output();
        logger.info("Successfully installed uv via pip");

        // Try to verify uv is available, but don't fail if asdf can't find it
        // Since we installed via pip, it should be accessible via python -m uv
        try {
          const uvVerifyCmd = createCommand("uv", logger)
            .addArgs(["--version"])
            .currentDir(serverDir);

          const uvVersion = await uvVerifyCmd.output();
          logger.debug(
            { uvVersion: uvVersion.trim() },
            "uv installation verified via direct access"
          );
        } catch {
          // If direct uv access fails (common with asdf), try python -m uv
          logger.debug(
            "Direct uv access failed, verifying via python -m uv..."
          );
          const pythonUvCmd = createCommand("python", logger)
            .addArgs(["-m", "uv", "--version"])
            .currentDir(serverDir);

          const uvVersion = await pythonUvCmd.output();
          logger.debug(
            { uvVersion: uvVersion.trim() },
            "uv installation verified via python -m uv"
          );
        }
      } catch (pipError) {
        throw new Error(
          `Failed to install uv via pip. Please ensure Python and pip are working. Original uv error: ${error}. Pip installation error: ${pipError}`
        );
      }
    }
  }

  /**
   * Manage dependencies using pyproject.toml and uv
   */
  private async manageDependencies(options: {
    python: PythonOptionsV1;
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
      python,
      serverDir,
      force,
      installImplicitlyUpgradesChangedPackages,
      logger,
    } = options;
    const pyprojectPath = join(serverDir, "pyproject.toml");

    // Read existing configuration if it exists
    let existingToml = null;
    try {
      const existingContent = await readFile(pyprojectPath, "utf8");
      existingToml = parsePyprojectToml(existingContent);
    } catch {
      // File doesn't exist or can't be read
      existingToml = null;
    }

    // Determine what action to take using pure function
    const upgradeDecision = determinePythonUpgrade(existingToml, python, {
      force,
      implicitUpgrade: installImplicitlyUpgradesChangedPackages,
    });

    // Execute the determined action
    switch (upgradeDecision.action) {
      case "CREATE":
        return await this.createNewProject(python, serverDir, logger);
      case "UPGRADE":
        return await this.upgradeProject(
          python,
          serverDir,
          upgradeDecision.changes,
          logger
        );
      case "SYNC":
        return await this.syncEnvironment(python, serverDir, logger);
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
   * Create new Python project with pyproject.toml and uv.lock
   */
  private async createNewProject(
    python: PythonOptionsV1,
    serverDir: string,
    logger: Logger
  ): Promise<{
    dependenciesInstalled: boolean;
    environmentSynced: boolean;
    message: string;
    upgradeOccurred: boolean;
  }> {
    // Write Python version file first (needed for asdf/mise before any python commands)
    if (python.pythonVersion) {
      await this.managePythonVersionFile(
        serverDir,
        python.pythonVersion,
        logger
      );
    }

    const pyprojectPath = join(serverDir, "pyproject.toml");
    const serverName = serverDir.split("/").pop() ?? "unknown";

    // Generate pyproject.toml content using pure function
    const pyprojectContent = generatePyprojectToml(serverName, python);

    // Write pyproject.toml
    await writeFile(pyprojectPath, pyprojectContent, "utf8");
    logger.debug({ path: pyprojectPath }, "Created pyproject.toml");

    // Run uv lock
    const lockCmd = this.createUvCommand(["lock"], serverDir, logger);
    await lockCmd.output();
    logger.info("Created uv.lock file");

    return {
      dependenciesInstalled: true,
      environmentSynced: false,
      message: "Created new Python project with exact dependencies",
      upgradeOccurred: false,
    };
  }

  /**
   * Sync existing environment without version changes
   */
  private async syncEnvironment(
    python: PythonOptionsV1,
    serverDir: string,
    logger: Logger
  ): Promise<{
    dependenciesInstalled: boolean;
    environmentSynced: boolean;
    message: string;
    upgradeOccurred: boolean;
  }> {
    // Write Python version file (needed for asdf/mise before any python commands)
    if (python.pythonVersion) {
      await this.managePythonVersionFile(
        serverDir,
        python.pythonVersion,
        logger
      );
    }

    const syncCmd = this.createUvCommand(["sync"], serverDir, logger);
    await syncCmd.output();
    logger.debug("Synchronized environment with uv sync");

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
    python: PythonOptionsV1,
    serverDir: string,
    changes: string[],
    logger: Logger
  ): Promise<{
    dependenciesInstalled: boolean;
    environmentSynced: boolean;
    message: string;
    upgradeOccurred: boolean;
  }> {
    const pyprojectPath = join(serverDir, "pyproject.toml");
    const uvLockPath = join(serverDir, "uv.lock");

    logger.warn({ changes }, "Upgrading Python project due to version changes");

    // Write Python version file first (needed for asdf/mise before any python commands)
    if (python.pythonVersion) {
      await this.managePythonVersionFile(
        serverDir,
        python.pythonVersion,
        logger
      );
    }

    // Remove existing lock file
    try {
      await unlink(uvLockPath);
      logger.debug("Removed existing uv.lock file");
    } catch {
      // File might not exist, that's okay
    }

    // Generate new pyproject.toml content using pure function
    const serverName = serverDir.split("/").pop() ?? "unknown";
    const newPyprojectContent = generatePyprojectToml(serverName, python);
    await writeFile(pyprojectPath, newPyprojectContent, "utf8");
    logger.debug("Updated pyproject.toml with new versions");

    // Run uv lock to regenerate lock file
    const lockCmd = this.createUvCommand(["lock"], serverDir, logger);
    await lockCmd.output();
    logger.info("Regenerated uv.lock with new versions");

    return {
      dependenciesInstalled: true,
      environmentSynced: false,
      message: `Upgraded project: ${changes.join(", ")}`,
      upgradeOccurred: true,
    };
  }
}
