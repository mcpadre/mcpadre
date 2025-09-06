// pattern: Functional Core
// Types for diagnosis data structures

export interface SystemInfo {
  mcpadre: {
    version: string;
  };
  nodejs: {
    version: string;
  };
  os: {
    type: string;
    platform: string;
    arch: string;
    version: string;
    distribution?: string; // Linux distributions
  };
  packageManager: {
    pnpm?: string;
    npm?: string;
  };
  workingDirectory: {
    hasProjectConfig: boolean;
    isGitRepository: boolean;
  };
}

export interface ToolStatus {
  name: string;
  available: boolean;
  version?: string;
  versionManager?: {
    type: "asdf" | "mise" | "unknown";
    hasProjectVersion: boolean;
    error?: string;
  };
  error?: string;
}

export interface SandboxCapabilities {
  platform: string;
  bubblewrap?: {
    available: boolean;
    version?: string;
    functionalTest: {
      passed: boolean;
      error?: string;
    };
  };
  sandboxExec?: {
    available: boolean;
    functionalTest: {
      passed: boolean;
      error?: string;
    };
  };
}

export interface DockerStatus {
  available: boolean;
  version?: string;
  daemon: {
    running: boolean;
    error?: string;
  };
}

export interface ConfigValidation {
  userConfig: {
    exists: boolean;
    valid: boolean;
    error?: string;
  };
  projectConfig: {
    exists: boolean;
    valid: boolean;
    error?: string;
  };
}

export interface DiagnosticReport {
  timestamp: string;
  system: SystemInfo;
  tools: ToolStatus[];
  sandbox: SandboxCapabilities;
  docker: DockerStatus;
  config: ConfigValidation;
}

export interface ExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}
