// pattern: Functional Core
// Configuration validation for diagnostics (structure only, no content exposure)

import type { ConfigValidation } from "./types.js";

// Safely import config functions
async function importConfigLoaders(): Promise<{
  findProjectConfig: (startDir?: string) => Promise<string | null>;
  findUserConfig: (userDir: string) => Promise<string | null>;
  loadAndValidateSettingsProject: (filePath: string) => Promise<unknown>;
  loadAndValidateSettingsUser: (filePath: string) => Promise<unknown>;
}> {
  try {
    const [projectModule, userModule] = await Promise.all([
      import("../config/loaders/settings-project.js"),
      import("../config/loaders/settings-user-loader.js"),
    ]);

    return {
      findProjectConfig: projectModule.findProjectConfig,
      findUserConfig: userModule.findUserConfig,
      loadAndValidateSettingsProject:
        projectModule.loadAndValidateSettingsProject,
      loadAndValidateSettingsUser: userModule.loadAndValidateSettingsUser,
    };
  } catch {
    // If we can't import config modules, treat as unavailable
    throw new Error("Config loading modules not available");
  }
}

// Test project configuration
async function validateProjectConfig(): Promise<
  ConfigValidation["projectConfig"]
> {
  try {
    const { findProjectConfig, loadAndValidateSettingsProject } =
      await importConfigLoaders();

    // Check if project config exists
    const configPath = await findProjectConfig();

    if (!configPath) {
      return {
        exists: false,
        valid: false,
      };
    }

    // Try to validate the config structure
    try {
      await loadAndValidateSettingsProject(configPath);
      return {
        exists: true,
        valid: true,
      };
    } catch (validationError) {
      // Config exists but is invalid
      const errorMessage =
        validationError instanceof Error
          ? validationError.message.replace(
              /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
              "[EMAIL]"
            ) // Remove emails
          : "Unknown validation error";

      return {
        exists: true,
        valid: false,
        error: `Config validation failed: ${errorMessage}`,
      };
    }
  } catch (error) {
    // Error in the validation process itself
    return {
      exists: false,
      valid: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error checking project config",
    };
  }
}

// Test user configuration
async function validateUserConfig(): Promise<ConfigValidation["userConfig"]> {
  try {
    const { findUserConfig, loadAndValidateSettingsUser } =
      await importConfigLoaders();

    // Import getUserDir dynamically for diagnostics
    const { getUserDir } = await import("../cli/_globals.js");
    const userDir = getUserDir();

    // Check if user config exists
    let configPath: string | null = null;
    try {
      configPath = await findUserConfig(userDir);
    } catch (findError) {
      // User config directory might not exist
      return {
        exists: false,
        valid: false,
        error:
          findError instanceof Error
            ? findError.message
            : "Error finding user config",
      };
    }

    if (!configPath) {
      return {
        exists: false,
        valid: false,
      };
    }

    // Try to validate the config structure
    try {
      await loadAndValidateSettingsUser(configPath);
      return {
        exists: true,
        valid: true,
      };
    } catch (validationError) {
      // Config exists but is invalid
      const errorMessage =
        validationError instanceof Error
          ? validationError.message.replace(
              /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
              "[EMAIL]"
            ) // Remove emails
          : "Unknown validation error";

      return {
        exists: true,
        valid: false,
        error: `Config validation failed: ${errorMessage}`,
      };
    }
  } catch (error) {
    // Error in the validation process itself
    return {
      exists: false,
      valid: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error checking user config",
    };
  }
}

// Main function to validate all configs
export async function validateConfigs(): Promise<ConfigValidation> {
  // Run validations in parallel
  const [userConfig, projectConfig] = await Promise.all([
    validateUserConfig(),
    validateProjectConfig(),
  ]);

  return {
    userConfig,
    projectConfig,
  };
}
