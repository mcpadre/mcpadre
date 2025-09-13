// pattern: Functional Core

import {
  ConfigurationError,
  ContainerError,
  FileSystemError,
  HostError,
  InstallationError,
  MCPadreError,
  NetworkError,
  NodePackageError,
  ProcessError,
  PythonPackageError,
  ServerError,
  UserCancellationError,
  ValidationError,
} from "../../utils/errors.js";

/**
 * Represents a categorized error with user-friendly messaging
 */
export interface AnalyzedError {
  category:
    | "filesystem"
    | "network"
    | "process"
    | "validation"
    | "configuration"
    | "installation"
    | "host"
    | "server"
    | "cancellation"
    | "unknown";
  userMessage: string;
  technicalMessage: string;
  suggestions: string[];
}

/**
 * Analyzes an error and provides structured information with user-friendly messages
 *
 * This function categorizes errors commonly encountered in CLI operations and provides
 * actionable error messages and suggestions to help users resolve issues.
 *
 * @param error The error to analyze (can be Error, string, or unknown)
 * @returns Structured error information with category and user-friendly messaging
 */
export function analyzeError(error: unknown): AnalyzedError {
  // First check for typed mcpadre errors
  if (error instanceof MCPadreError) {
    // Get the error message
    const errorMessage = error.message;

    // Handle specific error types
    if (error instanceof FileSystemError) {
      // Use the actual error message
      const userMessage = errorMessage;
      const suggestions = [
        "Verify the file or directory path exists",
        "Check that you have the necessary permissions",
      ];

      if (error.operation === "read") {
        suggestions.push("Ensure the file exists and is readable");
      } else if (error.operation === "write") {
        suggestions.push("Ensure the directory is writable");
      } else if (error.operation === "delete") {
        suggestions.push("Ensure the file is not in use by another process");
      }

      return {
        category: "filesystem",
        userMessage,
        technicalMessage: errorMessage,
        suggestions,
      };
    }

    if (error instanceof NetworkError) {
      // Use the actual error message
      const userMessage = errorMessage;
      const suggestions = [
        "Check your internet connection",
        "Verify the server is accessible",
        "Try again as this may be a temporary issue",
      ];

      return {
        category: "network",
        userMessage,
        technicalMessage: errorMessage,
        suggestions,
      };
    }

    if (error instanceof ProcessError) {
      // Use the actual error message
      const userMessage = errorMessage;
      const suggestions = [
        "Check that required processes are running",
        "Verify you have the necessary permissions",
      ];

      return {
        category: "process",
        userMessage,
        technicalMessage: errorMessage,
        suggestions,
      };
    }

    if (error instanceof ValidationError) {
      // Use the actual error message
      const userMessage = errorMessage;
      const suggestions = [
        "Check your configuration file syntax",
        "Verify all required fields are present",
        "Refer to documentation for correct configuration format",
      ];

      if (error.validationErrors && error.validationErrors.length > 0) {
        suggestions.push(...error.validationErrors.map(e => `- ${e}`));
      }

      return {
        category: "validation",
        userMessage,
        technicalMessage: errorMessage,
        suggestions,
      };
    }

    if (error instanceof ConfigurationError) {
      // Use the actual error message, not a generic one
      const userMessage = errorMessage;
      let suggestions = [
        "Check your mcpadre.yaml file for errors",
        "Verify that all required configuration is present",
        "Run with --log-level debug for more detailed information",
      ];

      // Provide specific suggestions based on the error message
      const errorLower = errorMessage.toLowerCase();
      if (errorLower.includes("user configuration directory does not exist")) {
        suggestions = [
          "Create the user configuration directory and initialize it: mcpadre init --user",
          "Check that the MCPADRE_USER_DIR environment variable points to a valid directory",
          "Verify the user has permissions to create directories in the parent location",
        ];
      } else if (
        errorLower.includes("no mcpadre configuration file found") ||
        errorLower.includes("no project configuration found")
      ) {
        suggestions = [
          "Run this command from a directory containing mcpadre.yaml, mcpadre.json, or mcpadre.toml",
          "Create a configuration file using: mcpadre init",
          "Check that the configuration file name is spelled correctly",
        ];
      } else if (
        errorLower.includes("no mcpadre user configuration file found")
      ) {
        suggestions = [
          "Create a user configuration file using: mcpadre init --user",
          "Check that the user configuration directory contains mcpadre.yaml, mcpadre.json, or mcpadre.toml",
          "Verify the MCPADRE_USER_DIR environment variable points to the correct directory",
        ];
      }

      return {
        category: "configuration",
        userMessage,
        technicalMessage: errorMessage,
        suggestions,
      };
    }

    if (error instanceof InstallationError) {
      // Use the actual error message
      const userMessage = errorMessage;
      const suggestions = [
        "Check that all dependencies are installed",
        "Verify you have the necessary permissions",
        "Run with --log-level debug for more detailed information",
      ];

      return {
        category: "installation",
        userMessage,
        technicalMessage: errorMessage,
        suggestions,
      };
    }

    if (error instanceof ContainerError) {
      // Use the actual error message
      const userMessage = errorMessage;
      return {
        category: "installation",
        userMessage,
        technicalMessage: errorMessage,
        suggestions: [
          "Verify Docker is installed and running",
          "Check that the container image exists and is accessible",
          "Ensure you have permission to pull and run containers",
        ],
      };
    }

    if (error instanceof NodePackageError) {
      // Use the actual error message
      const userMessage = errorMessage;
      return {
        category: "installation",
        userMessage,
        technicalMessage: errorMessage,
        suggestions: [
          "Verify Node.js is installed and in your PATH",
          "Check that npm or pnpm is installed and working",
          "Ensure the package exists in the registry",
        ],
      };
    }

    if (error instanceof PythonPackageError) {
      // Use the actual error message
      const userMessage = errorMessage;
      return {
        category: "installation",
        userMessage,
        technicalMessage: errorMessage,
        suggestions: [
          "Verify Python is installed and in your PATH",
          "Check that pip is installed and working",
          "Ensure the package exists in the registry",
        ],
      };
    }

    if (error instanceof HostError) {
      // Use the actual error message
      const userMessage = errorMessage;

      return {
        category: "host",
        userMessage,
        technicalMessage: errorMessage,
        suggestions: [
          "Check that the host application is installed",
          "Verify the host configuration is correct",
          "Ensure the host application is running",
        ],
      };
    }

    if (error instanceof ServerError) {
      // Use the actual error message
      const userMessage = errorMessage;

      return {
        category: "server",
        userMessage,
        technicalMessage: errorMessage,
        suggestions: [
          "Check that the server is properly configured",
          "Verify the server dependencies are installed",
          "Ensure the server is compatible with your system",
        ],
      };
    }

    if (error instanceof UserCancellationError) {
      // For cancellation, we respect the silent flag
      return {
        category: "cancellation",
        userMessage: error.silent ? "" : errorMessage,
        technicalMessage: errorMessage,
        suggestions: [],
      };
    }

    // Generic MCPadreError handling - use the actual error message
    return {
      category: error.category as AnalyzedError["category"],
      userMessage: errorMessage,
      technicalMessage: errorMessage,
      suggestions: [
        "Check the error message for details",
        "Run with --log-level debug for more information",
      ],
    };
  }

  // Fall back to string-based analysis for non-mcpadre errors
  const errorMessage = getErrorMessage(error);
  const errorString = errorMessage.toLowerCase();

  // File system errors
  if (
    errorString.includes("eacces") ||
    errorString.includes("permission denied")
  ) {
    return {
      category: "filesystem",
      userMessage: "Permission denied accessing files or directories",
      technicalMessage: errorMessage,
      suggestions: [
        "Check that you have write permissions to the target directories",
        "Try running with appropriate permissions (sudo may be needed)",
        "Verify the file or directory ownership is correct",
      ],
    };
  }

  if (errorString.includes("enoent")) {
    return {
      category: "filesystem",
      userMessage: "Required file or directory not found",
      technicalMessage: errorMessage,
      suggestions: [
        "Verify the file or directory path exists",
        "Check that prerequisite applications are installed",
        "Ensure host applications have been run at least once to create config directories",
      ],
    };
  }

  if (errorString.includes("eisdir")) {
    return {
      category: "filesystem",
      userMessage: "Expected a file but found a directory",
      technicalMessage: errorMessage,
      suggestions: [
        "Check the file path is correct",
        "Remove any conflicting directories with the same name",
      ],
    };
  }

  if (errorString.includes("enotdir")) {
    return {
      category: "filesystem",
      userMessage: "Expected a directory but found a file",
      technicalMessage: errorMessage,
      suggestions: [
        "Check the directory path is correct",
        "Remove any conflicting files with the same name",
      ],
    };
  }

  // Network errors
  if (errorString.includes("econnrefused")) {
    return {
      category: "network",
      userMessage: "Connection refused by the server",
      technicalMessage: errorMessage,
      suggestions: [
        "Verify the server is running and accessible",
        "Check the URL or port number is correct",
        "Ensure no firewall is blocking the connection",
      ],
    };
  }

  if (errorString.includes("etimedout")) {
    return {
      category: "network",
      userMessage: "Connection timed out",
      technicalMessage: errorMessage,
      suggestions: [
        "Check your internet connection",
        "Verify the server is responsive",
        "Try again as this may be a temporary issue",
      ],
    };
  }

  if (
    errorString.includes("ehostunreach") ||
    errorString.includes("getaddrinfo")
  ) {
    return {
      category: "network",
      userMessage: "Unable to reach the specified host",
      technicalMessage: errorMessage,
      suggestions: [
        "Check the URL or hostname is correct",
        "Verify your DNS settings",
        "Ensure you have internet connectivity",
      ],
    };
  }

  // Process errors
  if (errorString.includes("eperm")) {
    return {
      category: "process",
      userMessage: "Operation not permitted",
      technicalMessage: errorMessage,
      suggestions: [
        "Check you have the necessary permissions",
        "Try running with elevated privileges if appropriate",
        "Verify the operation is allowed by system security policies",
      ],
    };
  }

  if (errorString.includes("esrch")) {
    return {
      category: "process",
      userMessage: "Process not found",
      technicalMessage: errorMessage,
      suggestions: [
        "Check that the required process or service is running",
        "Verify the process ID is correct",
        "Restart any prerequisite services",
      ],
    };
  }

  // User cancellation (Ctrl+C in interactive prompts)
  if (
    errorString.includes("user force closed the prompt") ||
    errorString.includes("force closed")
  ) {
    return {
      category: "cancellation",
      userMessage: "", // Silent - no error message for user cancellation
      technicalMessage: errorMessage,
      suggestions: [], // No suggestions needed for user cancellation
    };
  }

  // JSON/YAML/TOML parsing errors
  if (
    errorString.includes("json") &&
    (errorString.includes("unexpected") ||
      errorString.includes("expected") ||
      errorString.includes("syntax") ||
      error instanceof SyntaxError)
  ) {
    return {
      category: "validation",
      userMessage: "Settings validation failed",
      technicalMessage: errorMessage,
      suggestions: [
        "Check your configuration file for JSON syntax errors",
        "Verify all brackets, braces, and quotes are properly closed",
        "Remove any trailing commas in JSON files",
        "Use a JSON validator to check file syntax",
      ],
    };
  }

  if (
    errorString.includes("yaml") &&
    (errorString.includes("unexpected") ||
      errorString.includes("expected") ||
      errorString.includes("syntax"))
  ) {
    return {
      category: "validation",
      userMessage: "Settings validation failed",
      technicalMessage: errorMessage,
      suggestions: [
        "Check your configuration file for YAML syntax errors",
        "Verify proper indentation (use spaces, not tabs)",
        "Check that lists and mappings are properly formatted",
        "Use a YAML validator to check file syntax",
      ],
    };
  }

  if (
    errorString.includes("toml") &&
    (errorString.includes("unexpected") ||
      errorString.includes("expected") ||
      errorString.includes("syntax"))
  ) {
    return {
      category: "validation",
      userMessage: "Settings validation failed",
      technicalMessage: errorMessage,
      suggestions: [
        "Check your configuration file for TOML syntax errors",
        "Verify proper key-value pair formatting",
        "Check that strings are properly quoted",
        "Use a TOML validator to check file syntax",
      ],
    };
  }

  // Configuration/validation errors
  if (
    errorString.includes("no mcpadre configuration file found") ||
    errorString.includes("no mcpadre project configuration file found")
  ) {
    return {
      category: "configuration",
      userMessage: "No mcpadre configuration file found",
      technicalMessage: errorMessage,
      suggestions: [
        "Run this command from a directory containing mcpadre.yaml, mcpadre.json, or mcpadre.toml",
        "Create a configuration file using: mcpadre init",
        "Check that the configuration file name is spelled correctly",
      ],
    };
  }

  if (errorString.includes("user configuration directory does not exist")) {
    return {
      category: "configuration",
      userMessage: "User configuration directory does not exist",
      technicalMessage: errorMessage,
      suggestions: [
        "Create the user configuration directory and initialize it: mcpadre init --user",
        "Check that the MCPADRE_USER_DIR environment variable points to a valid directory",
        "Verify the user has permissions to create directories in the parent location",
      ],
    };
  }

  if (errorString.includes("no mcpadre user configuration file found")) {
    return {
      category: "configuration",
      userMessage: "No mcpadre user configuration file found",
      technicalMessage: errorMessage,
      suggestions: [
        "Create a user configuration file using: mcpadre init --user",
        "Check that the user configuration directory contains mcpadre.yaml, mcpadre.json, or mcpadre.toml",
        "Verify the MCPADRE_USER_DIR environment variable points to the correct directory",
      ],
    };
  }

  if (errorString.includes("invalid") || errorString.includes("validation")) {
    return {
      category: "validation",
      userMessage: "Configuration or input validation failed",
      technicalMessage: errorMessage,
      suggestions: [
        "Check your configuration file syntax",
        "Verify all required fields are present",
        "Refer to documentation for correct configuration format",
      ],
    };
  }

  // Unknown errors
  return {
    category: "unknown",
    userMessage: "An unexpected error occurred",
    technicalMessage: errorMessage,
    suggestions: [
      "Try the operation again",
      "Check the command syntax and arguments",
      "Run with --log-level debug for more detailed information",
    ],
  };
}

/**
 * Extracts a string message from various error types
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}
