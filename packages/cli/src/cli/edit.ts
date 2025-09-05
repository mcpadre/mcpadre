// pattern: Imperative Shell
// CLI command for editing mcpadre configuration files

import { Command } from "@commander-js/extra-typings";
import { spawn } from "child_process";
import { copyFile, mkdtemp, rmdir, unlink } from "fs/promises";
import * as jsondiffpatch from "jsondiffpatch";
import { tmpdir } from "os";
import { basename, join } from "path";

import { promptForConfirmation } from "../cli-helpers/interactive-prompts.js";
import { withProjectConfigAndErrorHandling } from "../cli-helpers/with-project-config-and-error-handling.js";
import {
  loadSettingsProjectFromFile,
  validateSettingsProjectObject,
} from "../config/loaders/settings-project.js";
import {
  findUserConfig,
  loadSettingsUserFromFile,
  validateSettingsUserObject,
} from "../config/loaders/settings-user-loader.js";
import { writeSettingsUserToFile } from "../config/writers/settings-user-writer.js";

import { CLI_LOGGER } from "./_deps.js";
import { getUserDir, isUserMode } from "./_globals.js";

import type { SettingsProject, SettingsUser } from "../config/types/index.js";

/**
 * Create the 'mcpadre edit' command
 */
export function makeEditCommand(): Command {
  return new Command("edit")
    .description("Edit mcpadre configuration file in your default editor")
    .addHelpText(
      "before",
      `
Opens your mcpadre configuration file in the system's default editor ($EDITOR).

By default, edits the project configuration (mcpadre.yaml in current directory).
Use --user to edit the user-level configuration instead.

The file is validated after editing. If validation fails, you'll be prompted to:
- Continue editing to fix the issues, or
- Discard changes and exit
      `
    )
    .addHelpText(
      "after",
      `
Examples:
  mcpadre edit              Edit project configuration
  mcpadre edit --user       Edit user configuration

Environment Variables:
  EDITOR                   Your preferred editor (defaults to system default)
      `
    )
    .action(() => {
      const userMode = isUserMode();

      if (userMode) {
        // User-level edit
        return handleUserEdit();
      } else {
        // Project-level edit
        return withProjectConfigAndErrorHandling(handleProjectEdit)();
      }
    });
}

/**
 * Handle user-level configuration editing
 */
async function handleUserEdit(): Promise<void> {
  CLI_LOGGER.info("Opening user configuration for editing...");

  try {
    let userConfigPath = await findUserConfig();

    // If no user config exists, create a stub one
    if (!userConfigPath) {
      const userDir = getUserDir();
      userConfigPath = join(userDir, "mcpadre.yaml");

      CLI_LOGGER.info(
        `No user configuration found. Creating stub config at ${userConfigPath}`
      );

      // Create stub user configuration
      const stubConfig: SettingsUser = {
        version: 1,
        mcpServers: {},
        hosts: {},
      };

      await writeSettingsUserToFile(userConfigPath, stubConfig);
    }

    await editConfigFile(userConfigPath, "user");
  } catch (error) {
    CLI_LOGGER.error("Failed to edit user configuration:");
    CLI_LOGGER.error(error);
    process.exit(1);
  }
}

/**
 * Handle project-level configuration editing
 */
async function handleProjectEdit(
  _config: SettingsProject,
  _projectDir: string,
  configPath: string
): Promise<void> {
  CLI_LOGGER.info("Opening project configuration for editing...");

  try {
    await editConfigFile(configPath, "project");
  } catch (error) {
    CLI_LOGGER.error("Failed to edit project configuration:");
    CLI_LOGGER.error(error);
    process.exit(1);
  }
}

/**
 * Core editing workflow: copy to temp, edit, validate, copy back
 */
async function editConfigFile(
  originalPath: string,
  configType: "user" | "project"
): Promise<void> {
  // Create temporary directory and file
  const tempDir = await mkdtemp(join(tmpdir(), "mcpadre-edit-"));
  const tempPath = join(tempDir, basename(originalPath));

  try {
    // Copy original to temporary location
    await copyFile(originalPath, tempPath);
    CLI_LOGGER.debug(`Created temporary copy at ${tempPath}`);

    // Load original configuration for diff comparison
    const originalConfig = await loadConfigForDiff(originalPath, configType);

    let editSuccessful = false;
    while (!editSuccessful) {
      // Open file in editor
      await openInEditor(tempPath);

      // Validate the edited file
      const validationResult = await validateEditedFile(tempPath, configType);

      if (validationResult.isValid) {
        // Load edited configuration and show diff
        const editedConfig = await loadConfigForDiff(tempPath, configType);
        showConfigDiff(originalConfig, editedConfig);

        // Copy validated file back to original location
        await copyFile(tempPath, originalPath);
        CLI_LOGGER.info(
          `✅ Configuration updated successfully: ${originalPath}`
        );
        editSuccessful = true;
      } else {
        // Show validation errors
        CLI_LOGGER.error("❌ Configuration validation failed:");
        CLI_LOGGER.error(validationResult.error);

        // Ask user if they want to continue editing or discard changes
        const continueEditing = await promptForConfirmation(
          "Do you want to continue editing to fix these issues? (No will discard changes and exit)"
        );

        if (!continueEditing) {
          CLI_LOGGER.info("Changes discarded.");
          process.exit(1);
        }

        // Loop continues for another edit attempt
      }
    }
  } finally {
    // Cleanup temporary files (best effort)
    try {
      await unlink(tempPath);
      await rmdir(tempDir);
      CLI_LOGGER.debug("Cleaned up temporary files");
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Open file in system editor
 */
async function openInEditor(filePath: string): Promise<void> {
  const editor = process.env["EDITOR"] ?? getDefaultEditor();

  CLI_LOGGER.info(`Opening ${filePath} in ${editor}...`);

  return new Promise((resolve, reject) => {
    const editorProcess = spawn(editor, [filePath], {
      stdio: "inherit", // Allow editor to use terminal directly
    });

    editorProcess.on("exit", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });

    editorProcess.on("error", error => {
      reject(new Error(`Failed to launch editor: ${error.message}`));
    });
  });
}

/**
 * Get default editor for the current platform
 */
function getDefaultEditor(): string {
  if (process.platform === "win32") {
    return "notepad";
  }
  return "nano"; // Safe default for Unix-like systems
}

/**
 * Validate edited configuration file
 */
async function validateEditedFile(
  filePath: string,
  configType: "user" | "project"
): Promise<{ isValid: boolean; error?: string }> {
  try {
    if (configType === "user") {
      const data = await loadSettingsUserFromFile(filePath);
      if (validateSettingsUserObject(data)) {
        return { isValid: true };
      }
    } else {
      const data = await loadSettingsProjectFromFile(filePath);
      if (validateSettingsProjectObject(data)) {
        return { isValid: true };
      }
    }

    // This shouldn't be reached due to validation function throwing
    return { isValid: false, error: "Unknown validation error" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { isValid: false, error: message };
  }
}

/**
 * Load configuration file for diff comparison (returns parsed JSON)
 */
async function loadConfigForDiff(
  filePath: string,
  configType: "user" | "project"
): Promise<unknown> {
  if (configType === "user") {
    return await loadSettingsUserFromFile(filePath);
  } else {
    return await loadSettingsProjectFromFile(filePath);
  }
}

/**
 * Display a structured diff between original and edited configurations
 */
function showConfigDiff(originalConfig: unknown, editedConfig: unknown): void {
  const delta = jsondiffpatch.diff(originalConfig, editedConfig);

  if (!delta) {
    CLI_LOGGER.info("📄 No changes detected");
    return;
  }

  CLI_LOGGER.info("📄 Changes detected:");

  // Show a simple representation of the changes
  CLI_LOGGER.info(JSON.stringify(delta, null, 2));
}
