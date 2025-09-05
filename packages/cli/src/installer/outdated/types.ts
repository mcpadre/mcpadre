// pattern: Functional Core
// Type definitions for outdated package detection system

export interface OutdatedServerInfo {
  /** Name of the server from mcpadre config */
  serverName: string;
  /** Type of server (node, python, container, shell, http) */
  serverType: "node" | "python" | "container" | "shell" | "http";
  /** Current version installed locally */
  currentVersion: string;
  /** Latest version available in registry (null if unavailable) */
  latestVersion: string | null;
  /** Whether an update is available */
  isOutdated: boolean;
  /** Type of upgrade: major.minor.patch */
  upgradeType?: "major" | "minor" | "patch";
  /** Docker-specific digest information */
  digestInfo?: {
    currentDigest: string;
    latestDigest: string;
    digestChanged: boolean;
  };
  /** Security audit information */
  auditInfo?: {
    hasVulnerabilities: boolean;
    vulnerabilityCount?: number;
    severity?: "low" | "moderate" | "high" | "critical" | "none";
    message?: string;
  };
  /** Error message if version checking failed */
  error?: string;
}

export interface OutdatedCheckOptions {
  /** Whether to run security audits on packages */
  includeAudit?: boolean;
  /** Skip local cache and fetch fresh data */
  skipCache?: boolean;
  /** Filter to specific server names */
  serverNames?: string[];
  /** Filter to specific server types */
  serverTypes?: ("node" | "python" | "container" | "shell" | "http")[];
}

export interface OutdatedCheckResult {
  /** List of servers with their outdated status */
  servers: OutdatedServerInfo[];
  /** Summary statistics */
  summary: {
    total: number;
    outdated: number;
    withVulnerabilities: number;
    errors: number;
  };
  /** Timestamp when check was performed */
  checkedAt: string;
}

/**
 * Registry response for NPM package version info
 */
export interface NpmVersionResponse {
  "dist-tags": {
    latest?: string;
    [tag: string]: string | undefined;
  };
  versions: Record<string, { version: string }>;
  time: Record<string, string>;
}

/**
 * Registry response for PyPI package version info
 */
export interface PypiVersionResponse {
  info: {
    version: string;
    name: string;
  };
  releases: Record<string, { upload_time: string }[]>;
}

/**
 * Docker registry response for image manifest
 */
export interface DockerManifestResponse {
  mediaType: string;
  schemaVersion: number;
  config: {
    digest: string;
  };
}

/**
 * Audit result for package dependencies
 */
export interface AuditResult {
  hasVulnerabilities: boolean;
  vulnerabilityCount: number;
  severity: "low" | "moderate" | "high" | "critical" | "none";
  message: string;
}
