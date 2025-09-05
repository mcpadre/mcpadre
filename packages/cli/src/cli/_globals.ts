// pattern: Imperative Shell

import { statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

// Global workspace directory override
let WORKSPACE_DIR: string | undefined;

// Global user directory override
let USER_DIR: string | undefined;

// Global no-parent flag
let NO_PARENT_FLAG = false;

// Global user mode flag
let USER_MODE = false;

/**
 * Set the workspace directory override
 * This affects where config files are searched and where commands run
 */
export function setWorkspaceDir(dir: string | undefined): void {
  WORKSPACE_DIR = dir ? resolve(dir) : process.cwd();
  if (WORKSPACE_DIR) {
    if (statSync(WORKSPACE_DIR).isDirectory()) {
      process.chdir(WORKSPACE_DIR);
    } else {
      throw new Error(`Invalid workspace directory: ${WORKSPACE_DIR}`);
    }
  }
}

/**
 * Get the current workspace directory override
 * Returns undefined if no override is set
 */
export function getWorkspaceDir(): string | undefined {
  return WORKSPACE_DIR;
}

/**
 * Set the no-parent flag
 * This affects whether config file search climbs parent directories
 */
export function setNoParentFlag(noParent: boolean): void {
  NO_PARENT_FLAG = noParent;
}

/**
 * Get the current no-parent flag setting
 */
export function getNoParentFlag(): boolean {
  return NO_PARENT_FLAG;
}

/**
 * Set the user directory override
 * This affects where user config files are located
 */
export function setUserDir(dir: string | undefined): void {
  USER_DIR = dir ? resolve(dir) : undefined;
}

/**
 * Get the user directory path
 * Uses override, then MCPADRE_USER_DIR env var, then defaults to $HOME/.mcpadre
 */
export function getUserDir(): string {
  if (USER_DIR) {
    return USER_DIR;
  }

  const envUserDir = process.env["MCPADRE_USER_DIR"];
  if (envUserDir) {
    return resolve(envUserDir);
  }

  return resolve(homedir(), ".mcpadre");
}

/**
 * Set the user mode flag
 * This affects whether commands operate on user or project configs
 */
export function setUserMode(userMode: boolean): void {
  USER_MODE = userMode;
}

/**
 * Get the current user mode setting
 */
export function isUserMode(): boolean {
  return USER_MODE;
}
