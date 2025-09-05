import { describe, expect, it } from "vitest";

import { mergeUserProjectConfig } from "./user-project-merger.js";

import type { SettingsProject, SettingsUser } from "../types/index.js";

describe("user-project merger host priority", () => {
  it("should override project host settings when user explicitly sets true", () => {
    const userConfig: SettingsUser = {
      version: 1,
      mcpServers: {},
      hosts: {
        "claude-code": true, // User says enable
        cursor: true, // User says enable
      },
    };

    const projectConfig: SettingsProject = {
      version: 1,
      mcpServers: {},
      hosts: {
        "claude-code": false, // Project says disable - should be overridden
        cursor: false, // Project says disable - should be overridden
        zed: true, // Project only, should remain
      },
    };

    const merged = mergeUserProjectConfig(userConfig, projectConfig);

    expect(merged.hosts).toEqual({
      "claude-code": true, // User override
      cursor: true, // User override
      zed: true, // Project setting kept
    });
  });

  it("should override project host settings when user explicitly sets false", () => {
    const userConfig: SettingsUser = {
      version: 1,
      mcpServers: {},
      hosts: {
        "claude-code": false, // User says disable
        cursor: false, // User says disable
      },
    };

    const projectConfig: SettingsProject = {
      version: 1,
      mcpServers: {},
      hosts: {
        "claude-code": true, // Project says enable - should be overridden
        cursor: true, // Project says enable - should be overridden
        zed: true, // Project only, should remain
      },
    };

    const merged = mergeUserProjectConfig(userConfig, projectConfig);

    expect(merged.hosts).toEqual({
      "claude-code": false, // User override
      cursor: false, // User override
      zed: true, // Project setting kept
    });
  });

  it("should use project settings when user host is undefined", () => {
    const userConfig: SettingsUser = {
      version: 1,
      mcpServers: {},
      hosts: {
        "claude-code": undefined, // User says undefined - use project
        // cursor not mentioned - use project
      },
    };

    const projectConfig: SettingsProject = {
      version: 1,
      mcpServers: {},
      hosts: {
        "claude-code": true, // Project setting should be used
        cursor: false, // Project setting should be used
        zed: true, // Project only, should remain
      },
    };

    const merged = mergeUserProjectConfig(userConfig, projectConfig);

    expect(merged.hosts).toEqual({
      "claude-code": true, // Project setting used (user was undefined)
      cursor: false, // Project setting used (user not mentioned)
      zed: true, // Project setting kept
    });
  });

  it("should add user-only hosts to merged config", () => {
    const userConfig: SettingsUser = {
      version: 1,
      mcpServers: {},
      hosts: {
        "claude-code": true, // User enables this
        "claude-desktop": true, // User-only host
      },
    };

    const projectConfig: SettingsProject = {
      version: 1,
      mcpServers: {},
      hosts: {
        "claude-code": false, // Should be overridden by user
        zed: true, // Project only
      },
    };

    const merged = mergeUserProjectConfig(userConfig, projectConfig);

    expect(merged.hosts).toEqual({
      "claude-code": true, // User override
      "claude-desktop": true, // User-only host added
      zed: true, // Project setting kept
    });
  });

  it("should handle empty host configurations", () => {
    const userConfig: SettingsUser = {
      version: 1,
      mcpServers: {},
      // No hosts defined
    };

    const projectConfig: SettingsProject = {
      version: 1,
      mcpServers: {},
      hosts: {
        zed: true,
        cursor: false,
      },
    };

    const merged = mergeUserProjectConfig(userConfig, projectConfig);

    expect(merged.hosts).toEqual({
      zed: true, // Project settings preserved
      cursor: false,
    });
  });

  it("should return undefined hosts when neither config has hosts", () => {
    const userConfig: SettingsUser = {
      version: 1,
      mcpServers: {},
    };

    const projectConfig: SettingsProject = {
      version: 1,
      mcpServers: {},
    };

    const merged = mergeUserProjectConfig(userConfig, projectConfig);

    expect(merged.hosts).toBeUndefined();
  });

  it("should handle complex mixed scenarios", () => {
    const userConfig: SettingsUser = {
      version: 1,
      mcpServers: {},
      hosts: {
        "claude-code": true, // User enables (override)
        cursor: false, // User disables (override)
        opencode: undefined, // User undefined (use project)
        "claude-desktop": true, // User-only host
      },
    };

    const projectConfig: SettingsProject = {
      version: 1,
      mcpServers: {},
      hosts: {
        "claude-code": false, // Should be overridden to true
        cursor: true, // Should be overridden to false
        opencode: true, // Should remain true (user undefined)
        zed: false, // Project-only, should remain false
        vscode: true, // Project-only, should remain true
      },
    };

    const merged = mergeUserProjectConfig(userConfig, projectConfig);

    expect(merged.hosts).toEqual({
      "claude-code": true, // User override (true beats false)
      cursor: false, // User override (false beats true)
      opencode: true, // Project setting (user undefined)
      "claude-desktop": true, // User-only host
      zed: false, // Project-only setting
      vscode: true, // Project-only setting
    });
  });
});
