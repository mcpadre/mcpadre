// pattern: Functional Core

import { describe, expect, it } from "vitest";

import { updateVSCodeConfig } from "./vscode.js";

import type { EnvStringTemplateV1 } from "../../config/types/v1/env.js";
import type {
  CommandStringTemplate,
  McpServerV1,
} from "../../config/types/v1/server/index.js";

describe("updateVSCodeConfig", () => {
  const mockServers: Record<string, McpServerV1> = {
    "test-server": {
      shell: {
        command: "node" as CommandStringTemplate,
      },
      env: {
        TEST_VAR: "value" as EnvStringTemplateV1,
      },
    },
    "another-server": {
      shell: {
        command: "python" as CommandStringTemplate,
      },
    },
  };

  it("creates new config when existing content is empty", () => {
    const result = updateVSCodeConfig("", mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.servers).toEqual({
      "test-server": {
        type: "stdio",
        command: "mcpadre",
        args: ["run", "test-server"],
      },
      "another-server": {
        type: "stdio",
        command: "mcpadre",
        args: ["run", "another-server"],
      },
    });
  });

  it("preserves existing non-mcpadre servers when updating", () => {
    const existingConfig = JSON.stringify(
      {
        servers: {
          "existing-server": {
            type: "stdio",
            command: "other-tool",
            args: ["--config", "path"],
          },
        },
      },
      null,
      2
    );

    const result = updateVSCodeConfig(existingConfig, mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.servers).toEqual({
      "existing-server": {
        type: "stdio",
        command: "other-tool",
        args: ["--config", "path"],
      },
      "test-server": {
        type: "stdio",
        command: "mcpadre",
        args: ["run", "test-server"],
      },
      "another-server": {
        type: "stdio",
        command: "mcpadre",
        args: ["run", "another-server"],
      },
    });
  });

  it("overwrites existing mcpadre servers with same names", () => {
    const existingConfig = JSON.stringify(
      {
        servers: {
          "test-server": {
            type: "stdio",
            command: "mcpadre",
            args: ["run", "test-server", "--old-config"],
          },
          "other-server": {
            type: "stdio",
            command: "mcpadre",
            args: ["run", "other-server"],
          },
        },
      },
      null,
      2
    );

    const result = updateVSCodeConfig(existingConfig, mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.servers).toEqual({
      "other-server": {
        type: "stdio",
        command: "mcpadre",
        args: ["run", "other-server"],
      },
      "test-server": {
        type: "stdio",
        command: "mcpadre",
        args: ["run", "test-server"],
      },
      "another-server": {
        type: "stdio",
        command: "mcpadre",
        args: ["run", "another-server"],
      },
    });
  });

  it("preserves other config properties outside servers", () => {
    const existingConfig = JSON.stringify(
      {
        version: "1.0",
        servers: {},
        settings: {
          theme: "dark",
        },
      },
      null,
      2
    );

    const result = updateVSCodeConfig(existingConfig, mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.version).toBe("1.0");
    expect(parsed.settings).toEqual({ theme: "dark" });
    expect(Object.keys(parsed.servers)).toHaveLength(2);
  });

  it("handles malformed JSON by creating new config", () => {
    const malformedJson = "{ invalid json";

    const result = updateVSCodeConfig(malformedJson, mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.servers).toEqual({
      "test-server": {
        type: "stdio",
        command: "mcpadre",
        args: ["run", "test-server"],
      },
      "another-server": {
        type: "stdio",
        command: "mcpadre",
        args: ["run", "another-server"],
      },
    });
  });

  it("maintains JSON formatting with proper indentation", () => {
    const result = updateVSCodeConfig("", mockServers);

    // Check that the result is properly formatted
    expect(result).toContain("  ");
    expect(result.split("\n").length).toBeGreaterThan(5);
  });

  it("handles empty servers object", () => {
    const result = updateVSCodeConfig("", {});

    const parsed = JSON.parse(result);
    expect(parsed.servers).toEqual({});
  });

  it("preserves non-stdio server types", () => {
    const existingConfig = JSON.stringify(
      {
        servers: {
          "websocket-server": {
            type: "websocket",
            url: "ws://localhost:8080",
            auth: "bearer-token",
          },
          "existing-stdio": {
            type: "stdio",
            command: "existing-tool",
            args: ["--flag"],
          },
        },
      },
      null,
      2
    );

    const result = updateVSCodeConfig(existingConfig, mockServers);

    const parsed = JSON.parse(result);
    expect(parsed.servers["websocket-server"]).toEqual({
      type: "websocket",
      url: "ws://localhost:8080",
      auth: "bearer-token",
    });
    expect(parsed.servers["existing-stdio"]).toEqual({
      type: "stdio",
      command: "existing-tool",
      args: ["--flag"],
    });
    expect(parsed.servers["test-server"]).toEqual({
      type: "stdio",
      command: "mcpadre",
      args: ["run", "test-server"],
    });
  });
});
