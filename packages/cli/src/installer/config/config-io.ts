// pattern: Imperative Shell

import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";

/**
 * Reads a configuration file from the project directory
 * @param projectDir Absolute path to the project root directory
 * @param configPath Relative path from project root to config file
 * @returns File content as string, or empty string if file doesn't exist
 * @throws Error if file exists but cannot be read due to permissions or other issues
 */
export async function readConfigFile(
  projectDir: string,
  configPath: string
): Promise<string> {
  const fullPath = `${projectDir}/${configPath}`;

  try {
    return await readFile(fullPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      // File doesn't exist - return empty string
      return "";
    }
    // Re-throw other errors (permissions, etc.)
    throw error;
  }
}

/**
 * Writes content to a configuration file in the project directory
 * Creates parent directories if they don't exist
 * @param projectDir Absolute path to the project root directory
 * @param configPath Relative path from project root to config file
 * @param content Content to write to the file
 * @throws Error if write fails due to permissions or other issues
 */
export async function writeConfigFile(
  projectDir: string,
  configPath: string,
  content: string
): Promise<void> {
  const fullPath = `${projectDir}/${configPath}`;

  // Ensure parent directory exists
  await ensureConfigDir(projectDir, dirname(configPath));

  // Write the file
  await writeFile(fullPath, content, "utf8");
}

/**
 * Ensures a directory exists within the project directory
 * Creates the directory and any parent directories if they don't exist
 * @param projectDir Absolute path to the project root directory
 * @param relativeDirPath Relative path from project root to directory
 */
export async function ensureConfigDir(
  projectDir: string,
  relativeDirPath: string
): Promise<void> {
  if (relativeDirPath === "." || relativeDirPath === "") {
    // No directory to create
    return;
  }

  const fullDirPath = `${projectDir}/${relativeDirPath}`;

  try {
    await mkdir(fullDirPath, { recursive: true });
  } catch (error) {
    // If directory already exists, that's fine
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      return;
    }
    throw error;
  }
}
