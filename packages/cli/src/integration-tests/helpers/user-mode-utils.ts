// pattern: Imperative Shell
// Integration test utilities for user mode functionality

import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import YAML from "yaml";

import type { SettingsUser } from "../../config/types/index.js";
import type { SpawnFunction } from "./spawn-cli-v2.js";

/**
 * Creates a temporary user directory for testing user mode functionality
 */
export async function createTempUserDir(): Promise<string> {
  const userDir = join(
    tmpdir(),
    `mcpadre-user-test-${Date.now()}-${Math.random().toString(36).substring(2)}`
  );
  await mkdir(userDir, { recursive: true });
  return userDir;
}

/**
 * Creates a temporary project directory for testing isolation
 */
export async function createTempProjectDir(): Promise<string> {
  const projectDir = join(
    tmpdir(),
    `mcpadre-project-test-${Date.now()}-${Math.random().toString(36).substring(2)}`
  );
  await mkdir(projectDir, { recursive: true });
  return projectDir;
}

/**
 * Creates a user configuration file in the specified user directory
 */
export async function createUserConfig(
  userDir: string,
  config: SettingsUser
): Promise<string> {
  const configPath = join(userDir, "mcpadre.yaml");
  const yamlContent = YAML.stringify(config);
  await writeFile(configPath, yamlContent, "utf8");
  return configPath;
}

/**
 * Creates a complete temporary user environment with config
 */
export async function createTempUserEnvironment(config: SettingsUser): Promise<{
  userDir: string;
  configPath: string;
  cleanup: () => Promise<void>;
}> {
  const userDir = await createTempUserDir();
  const configPath = await createUserConfig(userDir, config);

  const cleanup = async (): Promise<void> => {
    await rm(userDir, { recursive: true, force: true });
  };

  return { userDir, configPath, cleanup };
}

/**
 * Returns spawn options for user mode commands with --user-dir flag
 */
export function getUserModeSpawnArgs(
  userDir: string,
  baseArgs: string[]
): string[] {
  return ["--user-dir", userDir, ...baseArgs];
}

/**
 * Test configuration templates for common scenarios
 */
export const TEST_CONTAINER_SERVER_CONFIG: SettingsUser = {
  version: 1,
  mcpServers: {
    "test-container": {
      container: {
        image: "alpine",
        tag: "latest",
      },
    },
  },
  hosts: {
    "claude-code": true,
  },
};

export const TEST_NODE_SERVER_CONFIG: SettingsUser = {
  version: 1,
  mcpServers: {
    "test-node": {
      node: {
        package: "@modelcontextprotocol/server-filesystem",
        version: "0.6.0",
      },
    },
  },
  hosts: {
    "claude-code": true,
  },
};

export const TEST_PYTHON_SERVER_CONFIG: SettingsUser = {
  version: 1,
  mcpServers: {
    "test-python": {
      python: {
        package: "mcp-server-git",
        version: "0.6.0",
      },
    },
  },
  hosts: {
    "claude-code": true,
  },
};

export const TEST_MULTI_SERVER_CONFIG: SettingsUser = {
  version: 1,
  mcpServers: {
    "container-server": {
      container: {
        image: "alpine",
        tag: "latest",
      },
    },
    "node-server": {
      node: {
        package: "@modelcontextprotocol/server-filesystem",
        version: "0.6.0",
      },
    },
    "python-server": {
      python: {
        package: "mcp-server-git",
        version: "0.6.0",
      },
    },
  },
  hosts: {
    "claude-code": true,
  },
};

/**
 * Verifies that files exist in user directory structure (unified approach)
 */
export async function verifyUserModeFiles(
  userDir: string,
  serverName: string,
  expectedFiles: string[]
): Promise<boolean> {
  const fs = await import("fs/promises");
  const serverPath = join(userDir, ".mcpadre", "servers", serverName);

  try {
    // Check if server directory exists
    await fs.access(serverPath);

    // Check if all expected files exist
    for (const fileName of expectedFiles) {
      const filePath = join(serverPath, fileName);
      await fs.access(filePath);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Verifies that files do NOT exist in project directory structure
 */
export async function verifyProjectModeFilesAbsent(
  projectDir: string,
  serverName: string,
  fileNames: string[]
): Promise<boolean> {
  const fs = await import("fs/promises");
  const serverPath = join(projectDir, ".mcpadre", "servers", serverName);

  try {
    // Check if any of the files exist (they shouldn't)
    for (const fileName of fileNames) {
      const filePath = join(serverPath, fileName);
      try {
        await fs.access(filePath);
        return false; // File exists when it shouldn't
      } catch {
        // File doesn't exist, which is what we want
      }
    }

    return true; // None of the files exist (correct)
  } catch {
    return true; // Directory doesn't exist, which is fine
  }
}

/**
 * Creates a test configuration with specified server names for testing orphans
 */
export function createConfigWithServers(serverNames: string[]): SettingsUser {
  const mcpServers: SettingsUser["mcpServers"] = {};

  serverNames.forEach((name, index) => {
    // Alternate between different server types for variety
    switch (index % 3) {
      case 0:
        mcpServers[name] = {
          container: { image: "alpine", tag: "latest" },
        };
        break;
      case 1:
        mcpServers[name] = {
          node: { package: "test-package", version: "1.0.0" },
        };
        break;
      case 2:
        mcpServers[name] = {
          python: { package: "test-package", version: "1.0.0" },
        };
        break;
    }
  });

  return {
    version: 1,
    mcpServers,
    hosts: {
      "claude-code": true,
    },
  };
}

/**
 * Helper to run user mode CLI commands with proper --user-dir flag
 */
export async function runUserModeCommand(
  spawn: SpawnFunction,
  userDir: string,
  projectDir: string,
  command: string[],
  options: {
    buffer?: boolean;
  } = {}
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const args = getUserModeSpawnArgs(userDir, command);

  const result = await spawn(args, {
    cwd: projectDir,
    buffer: options.buffer ?? true,
  });

  return {
    exitCode: result.exitCode ?? 0,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

/**
 * Waits for Docker to be available (for container tests)
 */
export async function waitForDocker(timeoutMs = 5000): Promise<boolean> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        await execAsync("docker version", { timeout: 1000 });
        return true;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Skips Docker-based tests if Docker is not available
 */
export function skipIfDockerUnavailable(): void {
  // This function should be called in test setup to conditionally skip tests
  // Implementation depends on the test framework's skip mechanism
}

/**
 * Creates directories and files to simulate server installations
 */
export async function createMockServerInstallation(
  baseDir: string,
  serverName: string,
  files: { name: string; content: string }[] = []
): Promise<string> {
  // With unified approach, both user and project modes use .mcpadre/servers
  const serverDir = join(baseDir, ".mcpadre", "servers", serverName);

  await mkdir(serverDir, { recursive: true });

  // Create default files if none specified
  if (files.length === 0) {
    files = [
      { name: "package.json", content: "{}" },
      {
        name: "container.lock",
        content: JSON.stringify({ digest: "sha256:test" }),
      },
    ];
  }

  for (const file of files) {
    await writeFile(join(serverDir, file.name), file.content);
  }

  return serverDir;
}

/**
 * Cleanup helper for test environments
 */
export async function cleanupTestEnvironment(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(async path => {
      try {
        await rm(path, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    })
  );
}
