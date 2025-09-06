import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as globals from "../../_globals.js";

import { createConfigContext } from "./index.js";
import { ProjectConfigContext } from "./project-context.js";
import { UserConfigContext } from "./user-context.js";

import type {
  SettingsProject,
  SettingsUser,
} from "../../../config/types/index.js";

describe("ConfigContext implementations", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mcpadre-context-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("UserConfigContext", () => {
    let userDir: string;

    beforeEach(async () => {
      userDir = join(tempDir, "user");
      await mkdir(userDir, { recursive: true });
      vi.spyOn(globals, "getUserDir").mockReturnValue(userDir);
    });

    it("should return correct type", () => {
      const context = new UserConfigContext();
      expect(context.type).toBe("user");
    });

    it("should return user directory as target dir", () => {
      const context = new UserConfigContext();
      expect(context.getTargetDir()).toBe(userDir);
    });

    it("should return user config path", () => {
      const context = new UserConfigContext();
      expect(context.getConfigPath()).toBe(join(userDir, "mcpadre.yaml"));
    });

    it("should ignore path parameter in resolveDirectory", () => {
      const context = new UserConfigContext();
      expect(context.resolveDirectory("some/path")).toBe(userDir);
      expect(context.resolveDirectory()).toBe(userDir);
    });

    it("should return user-capable hosts only", () => {
      const context = new UserConfigContext();
      const hosts = context.getSupportedHosts();

      // User-capable hosts
      expect(hosts).toContain("claude-code");
      expect(hosts).toContain("claude-desktop");
      expect(hosts).toContain("cursor");
      expect(hosts).toContain("opencode");

      // Project-only hosts should not be included
      expect(hosts).not.toContain("zed");
      expect(hosts).not.toContain("vscode");
    });

    it("should correctly identify host capability", () => {
      const context = new UserConfigContext();

      // User-capable hosts
      expect(context.isHostCapable("claude-code")).toBe(true);
      expect(context.isHostCapable("claude-desktop")).toBe(true);
      expect(context.isHostCapable("cursor")).toBe(true);
      expect(context.isHostCapable("opencode")).toBe(true);

      // Project-only hosts
      expect(context.isHostCapable("zed")).toBe(false);
      expect(context.isHostCapable("vscode")).toBe(false);

      // Invalid host
      expect(context.isHostCapable("invalid")).toBe(false);
    });

    it("should return user-specific install command", () => {
      const context = new UserConfigContext();
      expect(context.getInstallCommand()).toBe("mcpadre install --user");
    });

    it("should check config existence", async () => {
      const context = new UserConfigContext();

      // Initially doesn't exist
      expect(await context.configExists()).toBe(false);

      // Create config file
      const configPath = join(userDir, "mcpadre.yaml");
      await writeFile(configPath, "version: 1\nmcpServers: {}\n");

      // Now it exists
      expect(await context.configExists()).toBe(true);
    });

    it("should find existing config files", async () => {
      const context = new UserConfigContext();

      // Initially no config
      expect(await context.findExistingConfig()).toBeNull();

      // Create a JSON config
      const jsonPath = join(userDir, "mcpadre.json");
      await writeFile(jsonPath, "{}");

      // Should find it
      expect(await context.findExistingConfig()).toBe(jsonPath);
    });

    it("should update config path based on existing file via initConfigPath", async () => {
      const context = new UserConfigContext();

      // Config path should default to YAML
      expect(context.getConfigPath()).toBe(join(userDir, "mcpadre.yaml"));

      // Create a JSON config
      const jsonPath = join(userDir, "mcpadre.json");
      await writeFile(jsonPath, "{}");

      // Call initConfigPath to update the config path
      await context.initConfigPath();

      // Config path should now be the JSON file
      expect(context.getConfigPath()).toBe(jsonPath);
    });

    it("should write user config", async () => {
      const context = new UserConfigContext();

      const config: SettingsUser = {
        version: 1,
        mcpServers: {},
        hosts: {
          "claude-code": true,
        },
      };

      await context.writeConfig(config);

      // Verify file was created
      const content = await readFile(context.getConfigPath(), "utf-8");
      expect(content).toContain("version: 1");
      expect(content).toContain("claude-code: true");
    });

    it("should provide user-specific next steps message", () => {
      const context = new UserConfigContext();
      const steps = context.getNextStepsMessage(["claude-code"]);

      expect(steps).toContain("Next steps:");
      expect(steps.some(s => s.includes("mcpadre install --user"))).toBe(true);
      expect(steps.some(s => s.includes("globally"))).toBe(true);
      expect(steps.some(s => s.includes("across all projects"))).toBe(true);
    });
  });

  describe("ProjectConfigContext", () => {
    let projectDir: string;

    beforeEach(async () => {
      projectDir = join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });
    });

    it("should return correct type", () => {
      const context = new ProjectConfigContext(projectDir);
      expect(context.type).toBe("project");
    });

    it("should return project directory as target dir", () => {
      const context = new ProjectConfigContext(projectDir);
      expect(context.getTargetDir()).toBe(projectDir);
    });

    it("should return project config path", () => {
      const context = new ProjectConfigContext(projectDir);
      expect(context.getConfigPath()).toBe(join(projectDir, "mcpadre.yaml"));
    });

    it("should resolve paths relative to project", () => {
      const context = new ProjectConfigContext(projectDir);

      expect(context.resolveDirectory("subdir")).toBe(
        join(projectDir, "subdir")
      );
      expect(context.resolveDirectory()).toBe(projectDir);
    });

    it("should return only project-capable hosts", () => {
      const context = new ProjectConfigContext(projectDir);
      const hosts = context.getSupportedHosts();

      // Should include project-capable hosts
      expect(hosts).toContain("claude-code");
      expect(hosts).toContain("cursor");
      expect(hosts).toContain("opencode");
      expect(hosts).toContain("zed");
      expect(hosts).toContain("vscode");

      // Should NOT include user-only hosts
      expect(hosts).not.toContain("claude-desktop");
    });

    it("should correctly identify host capability", () => {
      const context = new ProjectConfigContext(projectDir);

      // Project-capable hosts should be supported
      expect(context.isHostCapable("claude-code")).toBe(true);
      expect(context.isHostCapable("cursor")).toBe(true);
      expect(context.isHostCapable("opencode")).toBe(true);
      expect(context.isHostCapable("zed")).toBe(true);
      expect(context.isHostCapable("vscode")).toBe(true);

      // User-only hosts should NOT be supported in project mode
      expect(context.isHostCapable("claude-desktop")).toBe(false);

      // Invalid host
      expect(context.isHostCapable("invalid")).toBe(false);
    });

    it("should return project-specific install command", () => {
      const context = new ProjectConfigContext(projectDir);
      expect(context.getInstallCommand()).toBe("mcpadre install");
    });

    it("should write project config", async () => {
      const context = new ProjectConfigContext(projectDir);

      const config: SettingsProject = {
        version: 1,
        mcpServers: {},
        hosts: {
          zed: true,
          cursor: true,
        },
      };

      await context.writeConfig(config);

      // Verify file was created
      const content = await readFile(context.getConfigPath(), "utf-8");
      expect(content).toContain("version: 1");
      expect(content).toContain("zed: true");
      expect(content).toContain("cursor: true");
    });

    it("should update config path based on existing file via initConfigPath", async () => {
      const context = new ProjectConfigContext(projectDir);

      // Config path should default to YAML
      expect(context.getConfigPath()).toBe(join(projectDir, "mcpadre.yaml"));

      // Create a JSON config
      const jsonPath = join(projectDir, "mcpadre.json");
      await writeFile(jsonPath, "{}");

      // Call initConfigPath to update the config path
      await context.initConfigPath();

      // Config path should now be the JSON file
      expect(context.getConfigPath()).toBe(jsonPath);
    });

    it("should provide project-specific next steps message", () => {
      const context = new ProjectConfigContext(projectDir);
      const steps = context.getNextStepsMessage(["zed", "cursor"]);

      expect(steps).toContain("Next steps:");
      expect(
        steps.some(s => s.includes("mcpadre install") && !s.includes("--user"))
      ).toBe(true);
      expect(steps.some(s => s.includes("for this project"))).toBe(true);
    });
  });

  describe("createConfigContext factory", () => {
    beforeEach(() => {
      const userDir = join(tempDir, "user");
      vi.spyOn(globals, "getUserDir").mockReturnValue(userDir);
    });

    it("should create UserConfigContext when isUserMode returns true", () => {
      vi.spyOn(globals, "isUserMode").mockReturnValue(true);

      const context = createConfigContext();
      expect(context).toBeInstanceOf(UserConfigContext);
      expect(context.type).toBe("user");
    });

    it("should create ProjectConfigContext when isUserMode returns false", () => {
      vi.spyOn(globals, "isUserMode").mockReturnValue(false);

      const context = createConfigContext();
      expect(context).toBeInstanceOf(ProjectConfigContext);
      expect(context.type).toBe("project");
    });

    it("should pass target directory to ProjectConfigContext", () => {
      vi.spyOn(globals, "isUserMode").mockReturnValue(false);

      const targetDir = join(tempDir, "custom-project");
      const context = createConfigContext({ target: targetDir });

      expect(context).toBeInstanceOf(ProjectConfigContext);
      expect(context.getTargetDir()).toBe(targetDir);
    });

    it("should respect forceType option", () => {
      // Even if isUserMode returns false, forceType should override
      vi.spyOn(globals, "isUserMode").mockReturnValue(false);

      const userContext = createConfigContext({ forceType: "user" });
      expect(userContext).toBeInstanceOf(UserConfigContext);

      // Even if isUserMode returns true, forceType should override
      vi.spyOn(globals, "isUserMode").mockReturnValue(true);

      const projectContext = createConfigContext({ forceType: "project" });
      expect(projectContext).toBeInstanceOf(ProjectConfigContext);
    });
  });
});
