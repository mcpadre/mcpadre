// pattern: Functional Core

/**
 * Base class for mcpadre application errors
 * Follows the NavigationError pattern with proper instanceof support
 */
export abstract class MCPadreError extends Error {
  public readonly category: string;

  protected constructor(category: string, message: string) {
    super(message);
    this.name = this.constructor.name;
    this.category = category;

    // Maintain proper stack trace for where our error was thrown
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Errors related to configuration files and project setup
 */
export class ConfigurationError extends MCPadreError {
  constructor(message: string) {
    super("configuration", message);
  }
}

/**
 * Errors related to installation and dependency management
 */
export class InstallationError extends MCPadreError {
  public readonly component?: string;

  constructor(message: string, component?: string) {
    super("installation", message);
    if (component) {
      this.component = component;
    }
  }
}

/**
 * Errors related to container operations (Docker, etc.)
 */
export class ContainerError extends InstallationError {
  constructor(message: string) {
    super(message, "container");
  }
}

/**
 * Errors related to Node.js package management
 */
export class NodePackageError extends InstallationError {
  constructor(message: string) {
    super(message, "node");
  }
}

/**
 * Errors related to Python package management
 */
export class PythonPackageError extends InstallationError {
  constructor(message: string) {
    super(message, "python");
  }
}

/**
 * Errors related to file system operations
 */
export class FileSystemError extends MCPadreError {
  public readonly operation?: string;
  public readonly filePath?: string;

  constructor(message: string, operation?: string, filePath?: string) {
    super("filesystem", message);
    if (operation) {
      this.operation = operation;
    }
    if (filePath) {
      this.filePath = filePath;
    }
  }
}

/**
 * Errors related to host configuration and support
 */
export class HostError extends MCPadreError {
  public readonly hostName?: string;

  constructor(message: string, hostName?: string) {
    super("host", message);
    if (hostName) {
      this.hostName = hostName;
    }
  }
}

/**
 * Errors related to server detection and validation
 */
export class ServerError extends MCPadreError {
  public readonly serverName?: string;

  constructor(message: string, serverName?: string) {
    super("server", message);
    if (serverName) {
      this.serverName = serverName;
    }
  }
}

/**
 * Errors related to version management and lock files
 */
export class VersionError extends InstallationError {
  constructor(message: string) {
    super(message, "version");
  }
}

/**
 * Errors related to network operations and connectivity
 */
export class NetworkError extends MCPadreError {
  public readonly endpoint?: string;

  constructor(message: string, endpoint?: string) {
    super("network", message);
    if (endpoint) {
      this.endpoint = endpoint;
    }
  }
}

/**
 * Errors related to process operations and permissions
 */
export class ProcessError extends MCPadreError {
  public readonly processName?: string;
  public readonly exitCode?: number;

  constructor(message: string, processName?: string, exitCode?: number) {
    super("process", message);
    if (processName) {
      this.processName = processName;
    }
    if (exitCode !== undefined) {
      this.exitCode = exitCode;
    }
  }
}

/**
 * Errors related to validation failures
 */
export class ValidationError extends MCPadreError {
  public readonly validationErrors?: string[];

  constructor(message: string, validationErrors?: string[]) {
    super("validation", message);
    if (validationErrors) {
      this.validationErrors = validationErrors;
    }
  }
}

/**
 * Errors related to user cancellation (Ctrl+C, Escape)
 */
export class UserCancellationError extends MCPadreError {
  public readonly silent: boolean;

  constructor(message: string, silent = true) {
    super("cancellation", message);
    this.silent = silent;
  }
}
