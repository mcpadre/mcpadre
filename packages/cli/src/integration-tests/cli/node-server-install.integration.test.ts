// pattern: Imperative Shell

import { access, constants, readFile } from "fs/promises";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import { withProcess } from "../helpers/spawn-cli-v2.js";

import type { EnvStringTemplate } from "../../config/types/index.js";
import type { TempProject } from "../../test-utils/project/temp-project.js";

describe("Node.js server install integration", () => {
  let tempProject: TempProject;

  beforeEach(async () => {
    // Create test project with Node.js server configuration
    const config = {
      version: 1 as const,
      mcpServers: {
        "express-server": {
          node: {
            package: "@modelcontextprotocol/server-memory",
            version: "0.6.0",
            nodeVersion: "20.10.0",
          },
          env: {
            MEMORY_DIR: "/tmp/memory" as EnvStringTemplate,
          },
        },
      },
      hosts: {
        "claude-code": true,
      },
      installImplicitlyUpgradesChangedPackages: false,
    };

    tempProject = await createTempProject({
      config,
      format: "yaml",
      prefix: "node-install-integration-",
    });
  });

  afterEach(async () => {
    await tempProject.cleanup();
  });

  it(
    "should install Node.js server with new package.json",
    withProcess(async spawn => {
      const proc = spawn(["install"], {
        cwd: tempProject.path,
      });

      const result = await proc;

      // Debug output to understand why test is failing
      if (result.exitCode !== 0) {
        console.log("FAILED COMMAND STDERR:", result.stderr);
        console.log("Exit code:", result.exitCode);
      }

      expect(result.exitCode).toBe(0);

      // Check that server directory was created
      const serverDir = join(
        tempProject.path,
        ".mcpadre",
        "servers",
        "express-server"
      );
      await access(serverDir, constants.F_OK);

      // Check .node-version file
      const nodeVersionPath = join(serverDir, ".node-version");
      await access(nodeVersionPath, constants.F_OK);
      const nodeVersionContent = await readFile(nodeVersionPath, "utf8");
      expect(nodeVersionContent.trim()).toBe("20.10.0");

      // Check .tool-versions file
      const toolVersionsPath = join(serverDir, ".tool-versions");
      await access(toolVersionsPath, constants.F_OK);
      const toolVersionsContent = await readFile(toolVersionsPath, "utf8");
      expect(toolVersionsContent.trim()).toBe("nodejs 20.10.0");

      // Check package.json file
      const packageJsonPath = join(serverDir, "package.json");
      await access(packageJsonPath, constants.F_OK);
      const packageJsonContent = await readFile(packageJsonPath, "utf8");
      const packageJson = JSON.parse(packageJsonContent);

      expect(packageJson.name).toBe("mcpadre-deps-express-server");
      expect(packageJson.engines.node).toBe(">=20.10.0");
      expect(
        packageJson.dependencies["@modelcontextprotocol/server-memory"]
      ).toBe("0.6.0");

      // Check that .mcp.json was created with correct server reference
      const claudeConfigPath = join(tempProject.path, ".mcp.json");
      await access(claudeConfigPath, constants.F_OK);
      const claudeConfigContent = await readFile(claudeConfigPath, "utf-8");
      const claudeConfig = JSON.parse(claudeConfigContent);

      expect(claudeConfig.mcpServers["express-server"]).toEqual({
        command: "mcpadre",
        args: ["run", "express-server"],
      });
    })
  );

  it(
    "should create Node.js server without nodeVersion constraint when not specified",
    withProcess(async spawn => {
      // Create a project configuration without nodeVersion
      const configWithoutNodeVersion = {
        version: 1 as const,
        mcpServers: {
          "simple-server": {
            node: {
              package: "@modelcontextprotocol/server-memory",
              version: "0.6.0",
            },
          },
        },
        hosts: {
          "claude-code": true,
        },
        installImplicitlyUpgradesChangedPackages: false,
      };

      const simpleProject = await createTempProject({
        config: configWithoutNodeVersion,
        format: "yaml",
        prefix: "node-simple-install-",
      });

      try {
        const proc = spawn(["install"], {
          cwd: simpleProject.path,
        });

        const result = await proc;
        expect(result.exitCode).toBe(0);

        const serverDir = join(
          simpleProject.path,
          ".mcpadre",
          "servers",
          "simple-server"
        );

        // Check package.json was created without engines constraint
        const packageJsonPath = join(serverDir, "package.json");
        const packageJsonContent = await readFile(packageJsonPath, "utf8");
        const packageJson = JSON.parse(packageJsonContent);

        expect(packageJson.name).toBe("mcpadre-deps-simple-server");
        expect(packageJson.engines).toBeUndefined();
        expect(
          packageJson.dependencies["@modelcontextprotocol/server-memory"]
        ).toBe("0.6.0");

        // Verify version files were NOT created
        const nodeVersionExists = await access(
          join(serverDir, ".node-version"),
          constants.F_OK
        )
          .then(() => true)
          .catch(() => false);
        expect(nodeVersionExists).toBe(false);

        const toolVersionsExists = await access(
          join(serverDir, ".tool-versions"),
          constants.F_OK
        )
          .then(() => true)
          .catch(() => false);
        expect(toolVersionsExists).toBe(false);
      } finally {
        await simpleProject.cleanup();
      }
    })
  );

  it(
    "should sync environment when no version changes detected",
    withProcess(async spawn => {
      // First install to create initial state
      const installProc = spawn(["install"], {
        cwd: tempProject.path,
      });
      const installResult = await installProc;
      expect(installResult.exitCode).toBe(0);

      // Run install again - should sync without changes
      const syncProc = spawn(["install"], {
        cwd: tempProject.path,
      });
      const syncResult = await syncProc;
      expect(syncResult.exitCode).toBe(0);

      // Verify the environment was actually synchronized by checking package.json
      const serverDir = join(
        tempProject.path,
        ".mcpadre",
        "servers",
        "express-server"
      );
      const packageJsonPath = join(serverDir, "package.json");
      const packageJsonContent = await readFile(packageJsonPath, "utf8");
      const packageJson = JSON.parse(packageJsonContent);

      // Verify sync maintained the correct package configuration
      expect(packageJson.name).toBe("mcpadre-deps-express-server");
      expect(packageJson.engines.node).toBe(">=20.10.0");
      expect(
        packageJson.dependencies["@modelcontextprotocol/server-memory"]
      ).toBe("0.6.0");
    })
  );

  it(
    "should refuse upgrade when version changes without force or installImplicitlyUpgradesChangedPackages",
    withProcess(async spawn => {
      // Create project with different version configuration
      const configWithOldVersion = {
        version: 1 as const,
        mcpServers: {
          "express-server": {
            node: {
              package: "@modelcontextprotocol/server-memory",
              version: "0.5.0",
              nodeVersion: "18.19.0",
            },
          },
        },
        hosts: {
          "claude-code": true,
        },
        installImplicitlyUpgradesChangedPackages: false,
      };

      // Create project with old version first
      const oldProject = await createTempProject({
        config: configWithOldVersion,
        format: "yaml",
        prefix: "node-upgrade-test-",
      });

      try {
        // Install with old version
        const installProc = spawn(["install"], {
          cwd: oldProject.path,
        });
        const installResult = await installProc;
        expect(installResult.exitCode).toBe(0);

        // Update config to new version
        const newConfig = {
          ...configWithOldVersion,
          mcpServers: {
            "express-server": {
              node: {
                package: "@modelcontextprotocol/server-memory",
                version: "0.6.0",
                nodeVersion: "20.10.0",
              },
            },
          },
        };

        await oldProject.updateConfig(newConfig);

        // Try to install with new version - should refuse
        const upgradeProc = spawn(["install"], {
          cwd: oldProject.path,
        });
        const upgradeResult = await upgradeProc;
        expect(upgradeResult.exitCode).toBe(0); // Should succeed but not upgrade

        const stderr = upgradeResult.stderr ?? "";
        expect(stderr).toContain(
          "Package/Node version changed but installImplicitlyUpgradesChangedPackages=false"
        );
        expect(stderr).toContain("Package version: 0.5.0 → 0.6.0");
        expect(stderr).toContain("Node.js version: >=18.19.0 → >=20.10.0");

        // Verify old versions are still in package.json
        const serverDir = join(
          oldProject.path,
          ".mcpadre",
          "servers",
          "express-server"
        );
        const packageJsonContent = await readFile(
          join(serverDir, "package.json"),
          "utf8"
        );
        const packageJson = JSON.parse(packageJsonContent);
        expect(packageJson.engines.node).toBe(">=18.19.0");
        expect(
          packageJson.dependencies["@modelcontextprotocol/server-memory"]
        ).toBe("0.5.0");
      } finally {
        await oldProject.cleanup();
      }
    })
  );

  it(
    "should upgrade when version changes with --force flag",
    withProcess(async spawn => {
      // Install with initial version
      const installProc = spawn(["install"], {
        cwd: tempProject.path,
      });
      const installResult = await installProc;
      expect(installResult.exitCode).toBe(0);

      // Update config to older version to test upgrade
      const configWithOldVersion = {
        version: 1 as const,
        mcpServers: {
          "express-server": {
            node: {
              package: "@modelcontextprotocol/server-memory",
              version: "0.5.0",
              nodeVersion: "18.19.0",
            },
          },
        },
        hosts: {
          "claude-code": true,
        },
        installImplicitlyUpgradesChangedPackages: false,
      };

      await tempProject.updateConfig(configWithOldVersion);

      // Run install with --force flag
      const forceProc = spawn(["install", "--force"], {
        cwd: tempProject.path,
      });
      const forceResult = await forceProc;
      expect(forceResult.exitCode).toBe(0);

      const stderr = forceResult.stderr ?? "";
      expect(stderr).toContain(
        "Upgrading Node.js project due to version changes"
      );
      expect(stderr).toContain("Package version:");
      expect(stderr).toContain("Node.js version:");

      // Verify new versions are in package.json
      const serverDir = join(
        tempProject.path,
        ".mcpadre",
        "servers",
        "express-server"
      );
      const packageJsonContent = await readFile(
        join(serverDir, "package.json"),
        "utf8"
      );
      const packageJson = JSON.parse(packageJsonContent);
      expect(packageJson.engines.node).toBe(">=18.19.0");
      expect(
        packageJson.dependencies["@modelcontextprotocol/server-memory"]
      ).toBe("0.5.0");
    })
  );

  it(
    "should upgrade when installImplicitlyUpgradesChangedPackages=true",
    withProcess(async spawn => {
      // Create config with implicit upgrade enabled
      const configWithImplicitUpgrade = {
        version: 1 as const,
        mcpServers: {
          "express-server": {
            node: {
              package: "@modelcontextprotocol/server-memory",
              version: "0.5.0",
              nodeVersion: "18.19.0",
            },
            installImplicitlyUpgradesChangedPackages: true,
          },
        },
        hosts: {
          "claude-code": true,
        },
        installImplicitlyUpgradesChangedPackages: false, // Global setting overridden by server setting
      };

      const upgradeProject = await createTempProject({
        config: configWithImplicitUpgrade,
        format: "yaml",
        prefix: "node-implicit-upgrade-",
      });

      try {
        // First install
        const installProc = spawn(["install"], {
          cwd: upgradeProject.path,
        });
        const installResult = await installProc;
        expect(installResult.exitCode).toBe(0);

        // Update to new version
        const newConfig = {
          ...configWithImplicitUpgrade,
          mcpServers: {
            "express-server": {
              node: {
                package: "@modelcontextprotocol/server-memory",
                version: "0.6.0",
                nodeVersion: "20.10.0",
              },
              installImplicitlyUpgradesChangedPackages: true,
            },
          },
        };

        await upgradeProject.updateConfig(newConfig);

        // Second install - should automatically upgrade
        const upgradeProc = spawn(["install"], {
          cwd: upgradeProject.path,
        });
        const upgradeResult = await upgradeProc;
        expect(upgradeResult.exitCode).toBe(0);

        const stderr = upgradeResult.stderr ?? "";
        expect(stderr).toContain(
          "Upgrading Node.js project due to version changes"
        );

        // Verify new versions are in package.json
        const serverDir = join(
          upgradeProject.path,
          ".mcpadre",
          "servers",
          "express-server"
        );
        const packageJsonContent = await readFile(
          join(serverDir, "package.json"),
          "utf8"
        );
        const packageJson = JSON.parse(packageJsonContent);
        expect(packageJson.engines.node).toBe(">=20.10.0");
        expect(
          packageJson.dependencies["@modelcontextprotocol/server-memory"]
        ).toBe("0.6.0");
      } finally {
        await upgradeProject.cleanup();
      }
    })
  );
});
