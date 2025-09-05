// pattern: Functional Core
// Types for upgrade system

import type { OutdatedServerInfo } from "../outdated/types.js";

/**
 * Options for the upgrade operation
 */
export interface UpgradeOptions {
  /** Upgrade all outdated servers */
  upgradeAll: boolean;
  /** Specific server names to upgrade */
  serverNames: string[];
  /** Skip confirmation prompts */
  skipConfirmation: boolean;
  /** Skip post-upgrade security audits */
  skipAudit: boolean;
}

/**
 * Information about a server upgrade
 */
export interface ServerUpgradeInfo {
  serverName: string;
  serverType: "node" | "python" | "container" | "shell" | "http";
  oldVersion: string;
  newVersion: string;
  upgradeType?: "major" | "minor" | "patch";
  digestInfo?: {
    oldDigest?: string;
    newDigest?: string;
    digestChanged?: boolean;
  };
}

/**
 * Result of a single server upgrade
 */
export interface SingleUpgradeResult {
  serverName: string;
  success: boolean;
  oldVersion: string;
  newVersion?: string;
  error?: string;
  upgradeType?: "major" | "minor" | "patch";
  digestInfo?: {
    oldDigest?: string;
    newDigest?: string;
    digestChanged?: boolean;
  };
}

/**
 * Warning message from upgrade process
 */
export interface UpgradeWarning {
  serverName: string;
  message: string;
}

/**
 * Complete result of upgrade operation
 */
export interface UpgradeResult {
  successful: ServerUpgradeInfo[];
  failed: {
    serverName: string;
    error: string;
  }[];
  warnings: UpgradeWarning[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    warnings: number;
  };
}

/**
 * Node.js server upgrade options
 */
export interface NodeUpgradeOptions {
  serverName: string;
  packageName: string;
  currentVersion: string;
  targetVersion: string;
  serverDir: string;
  skipAudit: boolean;
}

/**
 * Python server upgrade options
 */
export interface PythonUpgradeOptions {
  serverName: string;
  packageName: string;
  currentVersion: string;
  targetVersion: string;
  serverDir: string;
  pythonVersion?: string;
  skipAudit: boolean;
}

/**
 * Docker container upgrade options
 */
export interface DockerUpgradeOptions {
  serverName: string;
  image: string;
  currentTag: string;
  targetTag: string;
  serverDir: string;
  digestInfo?: {
    currentDigest?: string;
    latestDigest?: string;
    digestChanged?: boolean;
  };
}

/**
 * Upgradeable server information (extends OutdatedServerInfo)
 */
export interface UpgradeableServerInfo extends OutdatedServerInfo {
  /** Whether this server can be upgraded */
  canUpgrade: boolean;
  /** Human-readable upgrade description */
  upgradeDescription: string;
}
