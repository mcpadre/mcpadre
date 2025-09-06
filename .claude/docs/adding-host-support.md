# Adding New Host Support to mcpadre

This guide explains how to add support for a new MCP client (host) to mcpadre's installation system.

## Overview

mcpadre uses a generic, configuration-driven approach to support different MCP hosts. Each host has its own configuration file format and location, but they all follow the same integration pattern.

## Step-by-Step Implementation

### 1. Add Host to Type Definitions

First, add your new host to the supported hosts list:

**File:** `packages/cli/src/config/types/v1/hosts.ts`

```typescript
export const SUPPORTED_HOSTS_V1 = [
  "claude-code",
  "cursor",
  "zed",
  "vscode",
  "your-new-host", // Add here
] as const;
```

This automatically updates the `SupportedHostV1` union type used throughout the codebase.

### 2. Determine Host Configuration Format

Research your host's MCP configuration requirements:

- **Configuration file location** (e.g., `.myhost/mcp.json`, `.myhost-config.json`)
- **JSON structure** for MCP servers
- **Server entry format** (simple, stdio, or custom)
- **Whether the config preserves other settings** (like user preferences)

### 3. Create Host Updater Module

Create a new file for your host's updater:

**File:** `packages/cli/src/cli/install/updaters/your-new-host.ts`

```typescript
// pattern: Functional Core

import {
  createHostConfigUpdater,
  createHostConfigUpdaterWithAnalysis,
} from "./generic-updater.js";

/**
 * Updates YourNewHost's configuration file to include mcpadre servers
 * All servers are configured to redirect through "mcpadre run <server-name>"
 *
 * @param existingContent Current config content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Updated config content as JSON string
 */
export const updateYourNewHostConfig = createHostConfigUpdater({
  serversKey: "mcp_servers", // Key where MCP servers are stored
  serverFormat: "simple", // Format type (see below)
  preserveOtherKeys: false, // Set to true if config has user settings
});

/**
 * Updates YourNewHost's configuration file with server analysis
 * All servers are configured to redirect through "mcpadre run <server-name>"
 *
 * @param existingContent Current config content (empty string if file doesn't exist)
 * @param servers mcpadre server configurations to add/update
 * @returns Object with updated config and analysis of existing servers
 */
export const updateYourNewHostConfigWithAnalysis =
  createHostConfigUpdaterWithAnalysis({
    serversKey: "mcp_servers",
    serverFormat: "simple",
    preserveOtherKeys: false,
  });
```

#### Server Format Options

Choose the appropriate `serverFormat` based on your host's requirements:

- **`"simple"`** - Basic format used by Claude Code and Cursor:

  ```json
  {
    "command": "mcpadre",
    "args": ["run", "server-name"]
  }
  ```

- **`"stdio"`** - VS Code format with type field:

  ```json
  {
    "type": "stdio",
    "command": "mcpadre",
    "args": ["run", "server-name"]
  }
  ```

- **`"zed"`** - Nested command structure:
  ```json
  {
    "command": {
      "path": "mcpadre",
      "args": ["run", "server-name"]
    }
  }
  ```

If your host needs a different format, you'll need to extend the `formatServerEntry` function in `generic-updater.ts`.

### 4. Add Comprehensive Tests

Create test files for your updater:

**File:** `packages/cli/src/cli/install/updaters/your-new-host.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import {
  updateYourNewHostConfig,
  updateYourNewHostConfigWithAnalysis,
} from "./your-new-host.js";

describe("YourNewHost config updater", () => {
  const mockServers = {
    "test-server": {
      // Add mock server config based on McpServerV1 type
    },
  };

  describe("updateYourNewHostConfig", () => {
    it("should create new config when file doesn't exist", () => {
      const result = updateYourNewHostConfig("", mockServers);
      const parsed = JSON.parse(result);

      expect(parsed.mcp_servers["test-server"]).toEqual({
        command: "mcpadre",
        args: ["run", "test-server"],
      });
    });

    it("should merge with existing config", () => {
      const existing = JSON.stringify({
        mcp_servers: {
          "existing-server": { command: "some-command" },
        },
      });

      const result = updateYourNewHostConfig(existing, mockServers);
      const parsed = JSON.parse(result);

      expect(parsed.mcp_servers["existing-server"]).toEqual({
        command: "some-command",
      });
      expect(parsed.mcp_servers["test-server"]).toEqual({
        command: "mcpadre",
        args: ["run", "test-server"],
      });
    });

    // Add tests for preserveOtherKeys behavior if applicable
    // Add tests for malformed JSON handling
    // Add tests for empty configs
  });

  describe("updateYourNewHostConfigWithAnalysis", () => {
    it("should return config and analysis", () => {
      const result = updateYourNewHostConfigWithAnalysis("", mockServers);

      expect(result.updatedConfig).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(result.analysis.mcpadreManaged).toHaveLength(1);
    });

    // Add tests for orphaned server cleanup
    // Add tests for external server detection
  });
});
```

### 5. Register Host Configuration

Add your host to the central registry:

**File:** `packages/cli/src/cli/install/host-configs.ts`

```typescript
import {
  updateYourNewHostConfig,
  updateYourNewHostConfigWithAnalysis,
} from "./updaters/your-new-host.js";

export const HOST_CONFIGS: Record<SupportedHostV1, HostConfiguration> = {
  // ... existing configs ...

  "your-new-host": {
    projectConfigPath: ".myhost/mcp.json", // Relative path from project root
    shouldGitignore: true, // Should this file be gitignored?
    projectMcpConfigUpdater: updateYourNewHostConfig,
    projectMcpConfigUpdaterWithAnalysis: updateYourNewHostConfigWithAnalysis,
  },
};
```

#### Configuration Guidelines

- **`projectConfigPath`**: Relative path from the project root where the host expects its MCP config
- **`shouldGitignore`**:
  - `true` for machine-specific configs (Claude Code, Cursor, VS Code)
  - `false` for configs containing user settings (Zed)
- **Functions**: Use the updater functions you created in step 3

### 6. Add Integration Tests

Create integration tests to verify end-to-end functionality:

**File:** `packages/cli/src/integration-tests/cli/your-new-host.integration.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { createTempProject } from "../helpers/temp-project.js";
import { spawnCliV2 } from "../helpers/spawn-cli-v2.js";

describe("YourNewHost integration", () => {
  it("should install config for your-new-host", async () => {
    const tempProject = await createTempProject({
      mcpadreConfig: {
        servers: {
          "test-server": {
            // Add test server config
          },
        },
        hosts: {
          "your-new-host": true,
        },
      },
    });

    const result = await spawnCliV2(["install"], {
      cwd: tempProject.path,
    });

    expect(result.exitCode).toBe(0);

    // Verify config file was created
    const configPath = path.join(tempProject.path, ".myhost/mcp.json");
    expect(fs.existsSync(configPath)).toBe(true);

    // Verify config content
    const configContent = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configContent);
    expect(config.mcp_servers["test-server"]).toEqual({
      command: "mcpadre",
      args: ["run", "test-server"],
    });
  });

  // Add tests for:
  // - Config updates when servers change
  // - Handling existing configs
  // - Error cases (invalid JSON, permissions, etc.)
  // - Gitignore management
});
```

### 7. Extend Generic Updater (If Needed)

If your host requires a custom server format not covered by the existing options, extend the `formatServerEntry` function:

**File:** `packages/cli/src/cli/install/updaters/generic-updater.ts`

```typescript
function formatServerEntry(
  serverName: string,
  format: "simple" | "stdio" | "zed" | "your-custom-format"
): Record<string, unknown> {
  const baseEntry = {
    command: "mcpadre",
    args: ["run", serverName],
  };

  switch (format) {
    // ... existing cases ...

    case "your-custom-format":
      // Return your host's specific format
      return {
        executable: baseEntry.command,
        parameters: baseEntry.args,
        // Add any other required fields
      };

    // ... rest of function ...
  }
}
```

## Testing Your Implementation

1. **Run unit tests**: `pnpm test:unit -- your-new-host`
2. **Run integration tests**: `pnpm test:integration -- your-new-host`
3. **Run full test suite**: `pnpm ai:check`
4. **Manual testing**: Create a test project and verify `mcpadre install` works

## Common Patterns and Gotchas

### Configuration File Handling

- Always handle empty/missing files gracefully
- Catch and handle malformed JSON
- Preserve formatting with 2-space indentation and trailing newline
- Use optional chaining (`??=`) when initializing config sections

### Server Classification

The system automatically classifies servers as:

- **mcpadre-managed**: Servers that redirect through `mcpadre run`
- **external**: Servers configured outside mcpadre
- **orphaned**: Old mcpadre servers no longer in the current config

### Error Handling

- Invalid JSON should not crash the updater
- Missing directories should be created automatically
- File permission errors should be reported clearly

### TypeScript Integration

- The host name will be automatically added to the `SupportedHostV1` type
- Import the non-versioned types from the root config module
- Follow existing patterns for type imports and usage

## Example: Adding Support for "Nova Editor"

Let's say we want to add support for a fictional "Nova" editor:

1. **Research**: Nova stores MCP config in `.nova/mcp.json` with this format:

   ```json
   {
     "contextProviders": {
       "server-name": {
         "type": "process",
         "executable": "command",
         "arguments": ["arg1", "arg2"]
       }
     }
   }
   ```

2. **Implementation**:

   ```typescript
   // In hosts.ts
   export const SUPPORTED_HOSTS_V1 = [
     // ...existing...
     "nova",
   ] as const;

   // In updaters/nova.ts
   export const updateNovaConfig = createHostConfigUpdater({
     serversKey: "contextProviders",
     serverFormat: "nova", // Need to add this format
     preserveOtherKeys: false,
   });

   // In generic-updater.ts - add new format
   case "nova":
     return {
       type: "process",
       executable: baseEntry.command,
       arguments: baseEntry.args,
     };

   // In host-configs.ts
   nova: {
     projectConfigPath: ".nova/mcp.json",
     shouldGitignore: true,
     projectMcpConfigUpdater: updateNovaConfig,
     projectMcpConfigUpdaterWithAnalysis: updateNovaConfigWithAnalysis,
   },
   ```

3. **Testing**: Follow the patterns above for comprehensive test coverage

## Summary

Adding host support involves:

1. ✅ Update type definitions
2. ✅ Create host updater module
3. ✅ Add comprehensive tests
4. ✅ Register in host configs
5. ✅ Add integration tests
6. ✅ Extend generic updater if needed

The modular design makes adding new hosts straightforward while maintaining consistency and reliability across all supported MCP clients.
