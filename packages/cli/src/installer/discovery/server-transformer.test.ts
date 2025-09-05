// pattern: Functional Core

import { describe, expect, it } from "vitest";

import {
  transformServersAsRecord,
  transformServersForHost,
} from "./server-transformer.js";

import type { EnvStringTemplateV1 } from "../../config/types/v1/env.js";
import type {
  CommandStringTemplate,
  McpServerV1,
} from "../../config/types/v1/server/index.js";

describe("transformServersForHost", () => {
  it("transforms servers to mcpadre run commands", () => {
    const servers: Record<string, McpServerV1> = {
      "test-server": {
        shell: {
          command: "node" as CommandStringTemplate,
        },
        env: {
          TEST_VAR: "value" as EnvStringTemplateV1,
        },
      },
      "python-server": {
        shell: {
          command: "python" as CommandStringTemplate,
        },
      },
    };

    const result = transformServersForHost(servers);

    expect(result).toEqual([
      {
        name: "test-server",
        command: "mcpadre",
        args: ["run", "test-server"],
      },
      {
        name: "python-server",
        command: "mcpadre",
        args: ["run", "python-server"],
      },
    ]);
  });

  it("handles empty servers object", () => {
    const result = transformServersForHost({});
    expect(result).toEqual([]);
  });

  it("preserves server name order from Object.keys", () => {
    const servers: Record<string, McpServerV1> = {
      "a-server": { shell: { command: "a" as CommandStringTemplate } },
      "z-server": { shell: { command: "z" as CommandStringTemplate } },
      "b-server": { shell: { command: "b" as CommandStringTemplate } },
    };

    const result = transformServersForHost(servers);

    expect(result.map(s => s.name)).toEqual([
      "a-server",
      "z-server",
      "b-server",
    ]);
  });

  it("ignores original server configuration details", () => {
    const servers: Record<string, McpServerV1> = {
      "complex-server": {
        shell: {
          command: "docker" as CommandStringTemplate,
        },
        env: {
          NODE_ENV: "production" as EnvStringTemplateV1,
          API_KEY: "secret" as EnvStringTemplateV1,
        },
      },
    };

    const result = transformServersForHost(servers);

    expect(result).toEqual([
      {
        name: "complex-server",
        command: "mcpadre",
        args: ["run", "complex-server"],
      },
    ]);
  });
});

describe("transformServersAsRecord", () => {
  it("transforms servers to record format for host updaters", () => {
    const servers: Record<string, McpServerV1> = {
      "test-server": {
        shell: {
          command: "node" as CommandStringTemplate,
        },
        env: {
          TEST_VAR: "value" as EnvStringTemplateV1,
        },
      },
      "python-server": {
        shell: {
          command: "python" as CommandStringTemplate,
        },
      },
    };

    const result = transformServersAsRecord(servers);

    expect(result).toEqual({
      "test-server": {
        command: "mcpadre",
        args: ["run", "test-server"],
      },
      "python-server": {
        command: "mcpadre",
        args: ["run", "python-server"],
      },
    });
  });

  it("handles empty servers object", () => {
    const result = transformServersAsRecord({});
    expect(result).toEqual({});
  });

  it("creates same transformation as array version but as record", () => {
    const servers: Record<string, McpServerV1> = {
      server1: { shell: { command: "cmd1" as CommandStringTemplate } },
      server2: { shell: { command: "cmd2" as CommandStringTemplate } },
    };

    const arrayResult = transformServersForHost(servers);
    const recordResult = transformServersAsRecord(servers);

    // Verify record has same data as array, just different structure
    expect(Object.keys(recordResult)).toHaveLength(arrayResult.length);

    arrayResult.forEach(item => {
      expect(recordResult[item.name]).toEqual({
        command: item.command,
        args: item.args,
      });
    });
  });

  it("excludes name field from record values", () => {
    const servers: Record<string, McpServerV1> = {
      "test-server": {
        shell: {
          command: "test" as CommandStringTemplate,
        },
      },
    };

    const result = transformServersAsRecord(servers);

    expect(result["test-server"]).not.toHaveProperty("name");
    expect(result["test-server"]).toEqual({
      command: "mcpadre",
      args: ["run", "test-server"],
    });
  });

  it("handles servers with special characters in names", () => {
    const servers: Record<string, McpServerV1> = {
      "server-with-dashes": {
        shell: {
          command: "test" as CommandStringTemplate,
        },
      },
      server_with_underscores: {
        shell: {
          command: "test" as CommandStringTemplate,
        },
      },
      "server.with.dots": {
        shell: {
          command: "test" as CommandStringTemplate,
        },
      },
    };

    const result = transformServersAsRecord(servers);

    expect(result["server-with-dashes"]).toEqual({
      command: "mcpadre",
      args: ["run", "server-with-dashes"],
    });
    expect(result["server_with_underscores"]).toEqual({
      command: "mcpadre",
      args: ["run", "server_with_underscores"],
    });
    expect(result["server.with.dots"]).toEqual({
      command: "mcpadre",
      args: ["run", "server.with.dots"],
    });
  });
});
