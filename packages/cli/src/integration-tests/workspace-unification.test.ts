// pattern: Imperative Shell
// Tests for workspace unification - verify both user and project modes use identical path structures

import * as fc from "fast-check";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
  getConfigPath,
  getMcpTrafficRecordingPath,
  getServerDataPath,
  getServerPath,
} from "../config/types/workspace.js";

import type {
  ProjectWorkspaceContext,
  UserWorkspaceContext,
  WorkspaceContext,
} from "../config/types/workspace.js";

describe("Workspace Unification", () => {
  // Sample contexts for testing
  const userContext: UserWorkspaceContext = {
    workspaceType: "user",
    workspaceDir: "/home/user/.mcpadre",
    userConfigPath: "/home/user/.mcpadre/mcpadre.yaml",
    userConfig: {
      version: 1,
      mcpServers: {},
      hosts: {},
      options: {},
    },
    mergedConfig: {
      version: 1,
      mcpServers: {},
      hosts: {},
      options: {},
    },
  };

  const projectContext: ProjectWorkspaceContext = {
    workspaceType: "project",
    workspaceDir: "/projects/myapp",
    projectConfigPath: "/projects/myapp/mcpadre.yaml",
    projectConfig: {
      version: 1,
      mcpServers: {},
      hosts: {},
      options: {},
    },
    userConfig: {
      version: 1,
      mcpServers: {},
      hosts: {},
      options: {},
    },
    mergedConfig: {
      version: 1,
      mcpServers: {},
      hosts: {},
      options: {},
    },
  };

  describe("Path Structure Consistency", () => {
    it("should use identical relative paths for both modes", () => {
      const serverName = "test-server";

      expect(getServerPath(userContext, serverName)).toBe(
        "/home/user/.mcpadre/.mcpadre/servers/test-server"
      );

      expect(getServerPath(projectContext, serverName)).toBe(
        "/projects/myapp/.mcpadre/servers/test-server"
      );

      // Verify both paths end with the same relative structure
      const userRelative = getServerPath(userContext, serverName).replace(
        userContext.workspaceDir,
        ""
      );
      const projectRelative = getServerPath(projectContext, serverName).replace(
        projectContext.workspaceDir,
        ""
      );

      expect(userRelative).toBe(projectRelative);
      expect(userRelative).toBe("/.mcpadre/servers/test-server");
    });

    it("should maintain path structure invariant for server logs", () => {
      const serverName = "log-server";

      const userLogsPath = getMcpTrafficRecordingPath(userContext, serverName);
      const projectLogsPath = getMcpTrafficRecordingPath(
        projectContext,
        serverName
      );

      expect(userLogsPath).toBe(
        "/home/user/.mcpadre/.mcpadre/traffic/log-server"
      );
      expect(projectLogsPath).toBe(
        "/projects/myapp/.mcpadre/traffic/log-server"
      );

      // Verify identical relative paths
      const userRelative = userLogsPath.replace(userContext.workspaceDir, "");
      const projectRelative = projectLogsPath.replace(
        projectContext.workspaceDir,
        ""
      );

      expect(userRelative).toBe(projectRelative);
      expect(userRelative).toBe("/.mcpadre/traffic/log-server");
    });

    it("should maintain path structure invariant for server data", () => {
      const serverName = "data-server";

      const userDataPath = getServerDataPath(userContext, serverName);
      const projectDataPath = getServerDataPath(projectContext, serverName);

      expect(userDataPath).toBe(
        "/home/user/.mcpadre/.mcpadre/servers/data-server/data"
      );
      expect(projectDataPath).toBe(
        "/projects/myapp/.mcpadre/servers/data-server/data"
      );

      // Verify identical relative paths
      const userRelative = userDataPath.replace(userContext.workspaceDir, "");
      const projectRelative = projectDataPath.replace(
        projectContext.workspaceDir,
        ""
      );

      expect(userRelative).toBe(projectRelative);
      expect(userRelative).toBe("/.mcpadre/servers/data-server/data");
    });

    it("should maintain config path structure invariant", () => {
      const userConfigPath = getConfigPath(userContext);
      const projectConfigPath = getConfigPath(projectContext);

      expect(userConfigPath).toBe("/home/user/.mcpadre/mcpadre.yaml");
      expect(projectConfigPath).toBe("/projects/myapp/mcpadre.yaml");

      // Verify identical relative paths
      const userRelative = userConfigPath.replace(userContext.workspaceDir, "");
      const projectRelative = projectConfigPath.replace(
        projectContext.workspaceDir,
        ""
      );

      expect(userRelative).toBe(projectRelative);
      expect(userRelative).toBe("/mcpadre.yaml");
    });
  });

  describe("Path Helper Functions", () => {
    it("should work with any server name", () => {
      const testCases = [
        "simple-server",
        "complex_server-123",
        "server.with.dots",
        "Server-With-CAPS",
        "server@with@symbols",
      ];

      testCases.forEach(serverName => {
        const userPath = getServerPath(userContext, serverName);
        const projectPath = getServerPath(projectContext, serverName);

        // Should both contain the server name
        expect(userPath).toContain(serverName);
        expect(projectPath).toContain(serverName);

        // Should both use .mcpadre/servers structure
        expect(userPath).toContain("/.mcpadre/servers/");
        expect(projectPath).toContain("/.mcpadre/servers/");

        // Should maintain relative structure invariant
        const userRelative = userPath.replace(userContext.workspaceDir, "");
        const projectRelative = projectPath.replace(
          projectContext.workspaceDir,
          ""
        );
        expect(userRelative).toBe(projectRelative);
      });
    });

    it("should handle edge cases safely", () => {
      // Empty server name (though this shouldn't happen in practice)
      expect(() => getServerPath(userContext, "")).not.toThrow();
      expect(() => getServerPath(projectContext, "")).not.toThrow();

      // Server names with path separators (should be handled by path.join)
      const userPath = getServerPath(userContext, "server/with/slashes");
      const projectPath = getServerPath(projectContext, "server/with/slashes");

      expect(userPath).toContain("server/with/slashes");
      expect(projectPath).toContain("server/with/slashes");
    });
  });

  describe("Type Discrimination", () => {
    it("should properly discriminate workspace types", () => {
      function processWorkspace(context: WorkspaceContext): string {
        if (context.workspaceType === "user") {
          // TypeScript should narrow the type here
          return `User workspace at ${context.workspaceDir} with ${Object.keys(context.userConfig.mcpServers).length} servers`;
        } else {
          // TypeScript should narrow the type here
          return `Project workspace at ${context.workspaceDir} with ${Object.keys(context.projectConfig.mcpServers).length} servers`;
        }
      }

      const userResult = processWorkspace(userContext);
      const projectResult = processWorkspace(projectContext);

      expect(userResult).toContain("User workspace");
      expect(userResult).toContain("/home/user/.mcpadre");
      expect(projectResult).toContain("Project workspace");
      expect(projectResult).toContain("/projects/myapp");
    });

    it("should provide correct config access based on type", () => {
      // This test verifies TypeScript compile-time safety
      // The discriminated union ensures proper config access

      // User context should have userConfig
      expect(userContext.userConfig).toBeDefined();
      expect(userContext.workspaceType).toBe("user");

      // Project context should have projectConfig
      expect(projectContext.projectConfig).toBeDefined();
      expect(projectContext.workspaceType).toBe("project");
    });
  });

  describe("Directory Structure Verification", () => {
    it("should create consistent directory hierarchies", () => {
      const serverName = "hierarchy-test";

      // Expected directory structure for both modes (relative to workspace)
      const expectedServerDir = ".mcpadre/servers/hierarchy-test";
      const expectedRecordingDir = ".mcpadre/traffic/hierarchy-test";
      const expectedDataDir = ".mcpadre/servers/hierarchy-test/data";

      // User mode paths
      const userServerPath = getServerPath(userContext, serverName);
      const userRecordingPath = getMcpTrafficRecordingPath(
        userContext,
        serverName
      );
      const userDataPath = getServerDataPath(userContext, serverName);

      expect(userServerPath.endsWith(expectedServerDir)).toBe(true);
      expect(userRecordingPath.endsWith(expectedRecordingDir)).toBe(true);
      expect(userDataPath.endsWith(expectedDataDir)).toBe(true);

      // Project mode paths
      const projectServerPath = getServerPath(projectContext, serverName);
      const projectRecordingPath = getMcpTrafficRecordingPath(
        projectContext,
        serverName
      );
      const projectDataPath = getServerDataPath(projectContext, serverName);

      expect(projectServerPath.endsWith(expectedServerDir)).toBe(true);
      expect(projectRecordingPath.endsWith(expectedRecordingDir)).toBe(true);
      expect(projectDataPath.endsWith(expectedDataDir)).toBe(true);

      // Verify data hierarchy is consistent (recording dir is separate from server dir)
      expect(userDataPath.startsWith(userServerPath)).toBe(true);
      expect(projectDataPath.startsWith(projectServerPath)).toBe(true);
    });

    it("should handle nested server structures", () => {
      const serverName = "complex-server";

      const contexts = [userContext, projectContext];

      contexts.forEach(context => {
        const basePath = getServerPath(context, serverName);
        const recordingPath = getMcpTrafficRecordingPath(context, serverName);
        const dataPath = getServerDataPath(context, serverName);

        // Data path should be under the base server path
        expect(dataPath.startsWith(basePath)).toBe(true);

        // Recording path is separate from server path (in .mcpadre/traffic/)
        expect(recordingPath.includes("/traffic/")).toBe(true);
        expect(recordingPath.endsWith(serverName)).toBe(true);

        // Data path should end with expected suffix
        expect(dataPath.endsWith("/data")).toBe(true);

        // Verify path construction using join for data
        expect(dataPath).toBe(join(basePath, "data"));
      });
    });
  });

  describe("Cross-Platform Compatibility", () => {
    it("should handle different workspace directory formats", () => {
      // Windows-style paths
      const windowsUserContext: UserWorkspaceContext = {
        ...userContext,
        workspaceDir: "C:\\Users\\user\\.mcpadre",
      };

      const windowsProjectContext: ProjectWorkspaceContext = {
        ...projectContext,
        workspaceDir: "C:\\projects\\myapp",
      };

      const serverName = "cross-platform-test";

      // Should work with Windows paths
      expect(() => getServerPath(windowsUserContext, serverName)).not.toThrow();
      expect(() =>
        getServerPath(windowsProjectContext, serverName)
      ).not.toThrow();

      // Should maintain relative structure invariant
      const userPath = getServerPath(windowsUserContext, serverName);
      const projectPath = getServerPath(windowsProjectContext, serverName);

      const userRelative = userPath.replace(
        windowsUserContext.workspaceDir,
        ""
      );
      const projectRelative = projectPath.replace(
        windowsProjectContext.workspaceDir,
        ""
      );

      // Path separators might differ, but structure should be equivalent
      expect(userRelative.replace(/\\/g, "/")).toBe(
        projectRelative.replace(/\\/g, "/")
      );
    });
  });

  describe("Property-Based Test Invariants", () => {
    // Generator for valid server names
    const serverNameArbitrary = fc
      .string({ minLength: 1, maxLength: 50 })
      .filter(name => name.trim().length > 0)
      .filter(name => !name.includes("/") && !name.includes("\\"))
      .filter(name => name !== "." && name !== ".."); // Exclude path components that get normalized

    // Generator for workspace directories
    const workspaceDirArbitrary = fc.oneof(
      fc.constant("/home/user/.mcpadre"), // User mode
      fc.constant("/projects/myapp"), // Project mode
      fc.constant("C:\\Users\\user\\.mcpadre"), // Windows user mode
      fc.constant("C:\\projects\\myapp"), // Windows project mode
      fc.string({ minLength: 1, maxLength: 100 }).map(s => `/tmp/test-${s}`) // Random paths
    );

    it("should maintain relative path structure invariant for all server names", () => {
      fc.assert(
        fc.property(serverNameArbitrary, serverName => {
          const userPath = getServerPath(userContext, serverName);
          const projectPath = getServerPath(projectContext, serverName);

          // Remove workspace roots and compare relative paths
          const userRelative = userPath.replace(userContext.workspaceDir, "");
          const projectRelative = projectPath.replace(
            projectContext.workspaceDir,
            ""
          );

          // Must be identical after normalizing path separators
          expect(userRelative.replace(/\\/g, "/")).toBe(
            projectRelative.replace(/\\/g, "/")
          );

          // Must follow expected structure
          expect(userRelative.replace(/\\/g, "/")).toBe(
            `/.mcpadre/servers/${serverName}`
          );
        }),
        { numRuns: 100 }
      );
    });

    it("should maintain traffic recording path structure invariant", () => {
      fc.assert(
        fc.property(serverNameArbitrary, serverName => {
          const userRecordingPath = getMcpTrafficRecordingPath(
            userContext,
            serverName
          );
          const projectRecordingPath = getMcpTrafficRecordingPath(
            projectContext,
            serverName
          );

          // Remove workspace roots and compare
          const userRelative = userRecordingPath.replace(
            userContext.workspaceDir,
            ""
          );
          const projectRelative = projectRecordingPath.replace(
            projectContext.workspaceDir,
            ""
          );

          // Must be identical
          expect(userRelative.replace(/\\/g, "/")).toBe(
            projectRelative.replace(/\\/g, "/")
          );

          // Must include /traffic/
          expect(userRelative.replace(/\\/g, "/")).toMatch(/\/traffic\//);
        }),
        { numRuns: 100 }
      );
    });

    it("should maintain data path structure invariant", () => {
      fc.assert(
        fc.property(serverNameArbitrary, serverName => {
          const userDataPath = getServerDataPath(userContext, serverName);
          const projectDataPath = getServerDataPath(projectContext, serverName);

          // Remove workspace roots and compare
          const userRelative = userDataPath.replace(
            userContext.workspaceDir,
            ""
          );
          const projectRelative = projectDataPath.replace(
            projectContext.workspaceDir,
            ""
          );

          // Must be identical
          expect(userRelative.replace(/\\/g, "/")).toBe(
            projectRelative.replace(/\\/g, "/")
          );

          // Must end with /data
          expect(userRelative.replace(/\\/g, "/")).toMatch(/\/data$/);
        }),
        { numRuns: 100 }
      );
    });

    it("should maintain config path structure invariant", () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const userConfigPath = getConfigPath(userContext);
          const projectConfigPath = getConfigPath(projectContext);

          // Remove workspace roots and compare
          const userRelative = userConfigPath.replace(
            userContext.workspaceDir,
            ""
          );
          const projectRelative = projectConfigPath.replace(
            projectContext.workspaceDir,
            ""
          );

          // Must be identical
          expect(userRelative.replace(/\\/g, "/")).toBe(
            projectRelative.replace(/\\/g, "/")
          );

          // Must be exactly /mcpadre.yaml
          expect(userRelative.replace(/\\/g, "/")).toBe("/mcpadre.yaml");
        }),
        { numRuns: 10 }
      );
    });

    it("should create consistent hierarchical paths", () => {
      fc.assert(
        fc.property(serverNameArbitrary, serverName => {
          const serverPath = getServerPath(userContext, serverName);
          const recordingPath = getMcpTrafficRecordingPath(
            userContext,
            serverName
          );
          const dataPath = getServerDataPath(userContext, serverName);

          // Only data path must be under server path
          expect(dataPath.startsWith(serverPath)).toBe(true);

          // Data must be exactly a subdirectory of server path
          expect(dataPath).toBe(join(serverPath, "data"));

          // Recording path is in separate traffic directory
          expect(recordingPath.includes("/traffic/")).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should handle various workspace directory formats", () => {
      fc.assert(
        fc.property(
          workspaceDirArbitrary,
          serverNameArbitrary,
          (workspaceDir, serverName) => {
            const testContext: UserWorkspaceContext = {
              workspaceType: "user",
              workspaceDir,
              userConfigPath: `${workspaceDir}/mcpadre.yaml`,
              userConfig: {
                version: 1,
                mcpServers: {},
                hosts: {},
                options: {},
              },
              mergedConfig: {
                version: 1,
                mcpServers: {},
                hosts: {},
                options: {},
              },
            };

            // Should not throw for any valid workspace directory
            expect(() => getServerPath(testContext, serverName)).not.toThrow();
            expect(() => getConfigPath(testContext)).not.toThrow();

            const serverPath = getServerPath(testContext, serverName);
            const configPath = getConfigPath(testContext);

            // Should start with the workspace directory
            expect(serverPath.startsWith(workspaceDir)).toBe(true);
            expect(configPath.startsWith(workspaceDir)).toBe(true);

            // Should contain expected components
            expect(serverPath).toContain(serverName);
            expect(configPath).toContain("mcpadre.yaml");
          }
        ),
        { numRuns: 50 }
      );
    });

    it("should ensure path consistency across different server names", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(serverNameArbitrary, { minLength: 2, maxLength: 10 }),
          serverNames => {
            const paths = serverNames.map(name =>
              getServerPath(userContext, name)
            );

            // All paths should have the same structure relative to workspace
            const relativePaths = paths.map(path =>
              path.replace(userContext.workspaceDir, "")
            );

            // Each path should follow the expected pattern
            relativePaths.forEach((relativePath, index) => {
              expect(relativePath.replace(/\\/g, "/")).toBe(
                `/.mcpadre/servers/${serverNames[index]}`
              );
            });

            // All paths should be unique (no collisions)
            expect(new Set(paths).size).toBe(paths.length);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
