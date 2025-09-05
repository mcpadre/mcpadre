// pattern: Testing Infrastructure

import { describe, expect, it } from "vitest";
import { Scalar } from "yaml";

import { forceQuoteVersionStrings } from "./yaml-helpers.js";

describe("forceQuoteVersionStrings", () => {
  it("should quote version fields", () => {
    const input = {
      name: "test-server",
      version: "1.2.3",
    };

    const result = forceQuoteVersionStrings(input) as Record<string, unknown>;

    expect(result["name"]).toBe("test-server");
    expect(result["version"]).toBeInstanceOf(Scalar);
    expect((result["version"] as Scalar).value).toBe("1.2.3");
    expect((result["version"] as Scalar).type).toBe(Scalar.QUOTE_DOUBLE);
  });

  it("should quote pythonVersion fields", () => {
    const input = {
      python: {
        package: "some-package",
        pythonVersion: "3.13.6",
      },
    };

    const result = forceQuoteVersionStrings(input) as Record<string, unknown>;
    const python = result["python"] as Record<string, unknown>;

    expect(python["package"]).toBe("some-package");
    expect(python["pythonVersion"]).toBeInstanceOf(Scalar);
    expect((python["pythonVersion"] as Scalar).value).toBe("3.13.6");
    expect((python["pythonVersion"] as Scalar).type).toBe(Scalar.QUOTE_DOUBLE);
  });

  it("should quote nodeVersion fields", () => {
    const input = {
      node: {
        package: "some-package",
        nodeVersion: "18.20.0",
      },
    };

    const result = forceQuoteVersionStrings(input) as Record<string, unknown>;
    const node = result["node"] as Record<string, unknown>;

    expect(node["package"]).toBe("some-package");
    expect(node["nodeVersion"]).toBeInstanceOf(Scalar);
    expect((node["nodeVersion"] as Scalar).value).toBe("18.20.0");
    expect((node["nodeVersion"] as Scalar).type).toBe(Scalar.QUOTE_DOUBLE);
  });

  it("should NOT quote non-semver Docker tag fields", () => {
    const input = {
      container: {
        image: "some-image",
        tag: "latest",
      },
    };

    const result = forceQuoteVersionStrings(input) as Record<string, unknown>;
    const container = result["container"] as Record<string, unknown>;

    expect(container["image"]).toBe("some-image");
    expect(container["tag"]).toBe("latest"); // Should remain as string, not Scalar
  });

  it("should NOT quote other non-semver Docker tags", () => {
    const input = {
      containers: [
        { tag: "stable" },
        { tag: "main" },
        { tag: "dev" },
        { tag: "alpine" },
      ],
    };

    const result = forceQuoteVersionStrings(input) as Record<string, unknown>;
    const containers = result["containers"] as Record<string, unknown>[];

    expect(containers[0]?.["tag"]).toBe("stable");
    expect(containers[1]?.["tag"]).toBe("main");
    expect(containers[2]?.["tag"]).toBe("dev");
    expect(containers[3]?.["tag"]).toBe("alpine");
  });

  it("should quote semver-like Docker tags", () => {
    const input = {
      container: {
        image: "some-image",
        tag: "1.2.3",
      },
    };

    const result = forceQuoteVersionStrings(input) as Record<string, unknown>;
    const container = result["container"] as Record<string, unknown>;

    expect(container["tag"]).toBeInstanceOf(Scalar);
    expect((container["tag"] as Scalar).value).toBe("1.2.3");
    expect((container["tag"] as Scalar).type).toBe(Scalar.QUOTE_DOUBLE);
  });

  it("should handle nested objects recursively", () => {
    const input = {
      mcpServers: {
        "test-server": {
          python: {
            version: "1.0.0",
            pythonVersion: "3.11.0",
          },
          container: {
            tag: "2.1.0",
          },
        },
      },
    };

    const result = forceQuoteVersionStrings(input) as Record<string, unknown>;
    const mcpServers = result["mcpServers"] as Record<
      string,
      Record<string, unknown>
    >;
    const server = mcpServers["test-server"];
    expect(server).toBeDefined();
    const python = server!["python"] as Record<string, unknown>;
    const container = server!["container"] as Record<string, unknown>;

    expect(python["version"]).toBeInstanceOf(Scalar);
    expect((python["version"] as Scalar).value).toBe("1.0.0");

    expect(python["pythonVersion"]).toBeInstanceOf(Scalar);
    expect((python["pythonVersion"] as Scalar).value).toBe("3.11.0");

    expect(container["tag"]).toBeInstanceOf(Scalar);
    expect((container["tag"] as Scalar).value).toBe("2.1.0");
  });

  it("should handle arrays", () => {
    const input = {
      servers: [{ version: "1.0.0" }, { pythonVersion: "3.12.0" }],
    };

    const result = forceQuoteVersionStrings(input) as Record<string, unknown>;
    const servers = result["servers"] as Record<string, unknown>[];

    expect(servers[0]?.["version"]).toBeInstanceOf(Scalar);
    expect((servers[0]?.["version"] as Scalar).value).toBe("1.0.0");

    expect(servers[1]?.["pythonVersion"]).toBeInstanceOf(Scalar);
    expect((servers[1]?.["pythonVersion"] as Scalar).value).toBe("3.12.0");
  });

  it("should not quote non-version fields", () => {
    const input = {
      name: "test-server",
      description: "A test server",
      port: 8080,
    };

    const result = forceQuoteVersionStrings(input) as Record<string, unknown>;

    expect(result["name"]).toBe("test-server");
    expect(result["description"]).toBe("A test server");
    expect(result["port"]).toBe(8080);
  });

  it("should not quote integer version fields (like config version)", () => {
    const input = {
      version: 1,
      mcpServers: {
        test: {
          version: "1.0.0",
        },
      },
    };

    const result = forceQuoteVersionStrings(input) as Record<string, unknown>;

    // Config version should remain as integer
    expect(result["version"]).toBe(1);

    // Package version should be quoted
    const mcpServers = result["mcpServers"] as Record<
      string,
      Record<string, unknown>
    >;
    const server = mcpServers["test"];
    expect(server?.["version"]).toBeInstanceOf(Scalar);
    expect((server?.["version"] as Scalar).value).toBe("1.0.0");
  });
});
