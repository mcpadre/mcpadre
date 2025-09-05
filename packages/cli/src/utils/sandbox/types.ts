// pattern: Functional Core
// Defines the types and interfaces for the sandboxing system.
// These types describe the configuration and behavior of sandboxes
// without performing any I/O or side effects.

import type { ResolvedPath } from "../../runner/types/index.js";

/**
 * Permission levels for filesystem access within a sandbox
 */
export enum PermissionType {
  /** Read and execute permissions only */
  ReadExecute = "read-execute",
  /** Read, write, and execute permissions */
  ReadWriteExecute = "read-write-execute",
}

/**
 * Represents a filesystem path with associated permissions
 */
export interface SandboxPath {
  /** The filesystem path */
  path: ResolvedPath;
  /** The permission level for this path */
  permission: PermissionType;
}

/**
 * Raw configuration for sandbox execution, before path resolution.
 * This matches the user-provided SandboxOptions from the config.
 */
export interface SandboxConfig {
  /** Whether sandboxing is enabled */
  enabled: boolean;
  /** Whether to allow network access */
  networking: boolean;
  /** Whether to omit the project path from the sandbox */
  omitProjectPath: boolean;
  /** Template paths with read-execute permissions (unresolved) */
  allowRead: string[];
  /** Template paths with read-write-execute permissions (unresolved) */
  allowReadWrite: string[];
}

/**
 * Finalized configuration for sandbox execution after path resolution.
 * All paths have been resolved from templates to actual filesystem paths.
 */
export interface FinalizedSandboxConfig {
  /** Whether sandboxing is enabled */
  enabled: boolean;
  /** Whether to allow network access */
  networking: boolean;
  /** Resolved paths with read-execute permissions */
  allowRead: ResolvedPath[];
  /** Resolved paths with read-write-execute permissions */
  allowReadWrite: ResolvedPath[];
}

/**
 * Platform identifiers for sandbox implementations
 */
export enum SandboxPlatform {
  Linux = "linux",
  MacOS = "darwin",
  Windows = "win32",
  Unknown = "unknown",
}

/**
 * Result of sandbox binary validation
 */
export interface SandboxValidation {
  /** Whether the sandbox binary is available and functional */
  isAvailable: boolean;
  /** The path to the sandbox binary, if found */
  binaryPath?: string;
  /** Error message if validation failed */
  error?: string;
  /** The version of the sandbox binary, if available */
  version?: string;
}

/**
 * Arguments prepared for sandbox execution
 */
export interface SandboxArgs {
  /** The sandbox executable (e.g., 'bwrap', 'sandbox-exec') */
  executable: string;
  /** Arguments to pass to the sandbox executable */
  args: string[];
  /** Whether to pass the original command as additional arguments */
  appendCommand: boolean;
}
