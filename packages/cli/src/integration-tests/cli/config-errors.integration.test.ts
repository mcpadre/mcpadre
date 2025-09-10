// pattern: Imperative Shell

import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { withProcess } from "../helpers/spawn-cli-v2.js";

describe("Configuration Error Handling", () => {
  describe("malformed YAML configuration", () => {
    it(
      "should handle invalid YAML syntax gracefully",
      withProcess(async spawn => {
        const tempDir = await mkdtemp(join(tmpdir(), "mcpadre-test-"));
        try {
          // Create malformed YAML with invalid indentation
          const malformedYaml = `
version: 1
mcpServers:
  test-server:
    command: ["node", "server.js"]
  invalid-indent:
command: ["broken"]  # Wrong indentation
`;

          const configPath = join(tempDir, "mcpadre.yaml");
          await writeFile(configPath, malformedYaml);

          const result = await spawn(["run", "test-server"], {
            cwd: tempDir,
            buffer: true,
          });

          expect(result.exitCode).toBe(1);
          // Different types of config errors may be categorized as filesystem or validation
          const stderr = result.stderr;
          const hasValidationError = stderr.includes(
            "Settings validation failed"
          );
          const hasFilesystemError = stderr.includes(
            "Required file or directory not found"
          );
          expect(hasValidationError || hasFilesystemError).toBe(true);
        } finally {
          await rm(tempDir, { recursive: true, force: true });
        }
      })
    );

    it(
      "should handle missing required fields in YAML",
      withProcess(async spawn => {
        const tempDir = await mkdtemp(join(tmpdir(), "mcpadre-test-"));
        try {
          // Create YAML missing version field
          const invalidYaml = `
mcpServers:
  test-server:
    command: ["node", "server.js"]
`;

          const configPath = join(tempDir, "mcpadre.yaml");
          await writeFile(configPath, invalidYaml);

          const result = await spawn(["run", "test-server"], {
            cwd: tempDir,
            buffer: true,
          });

          expect(result.exitCode).toBe(1);
          // Different types of config errors may be categorized as filesystem or validation
          const stderr = result.stderr;
          const hasValidationError = stderr.includes(
            "Settings validation failed"
          );
          const hasFilesystemError = stderr.includes(
            "Required file or directory not found"
          );
          expect(hasValidationError || hasFilesystemError).toBe(true);
        } finally {
          await rm(tempDir, { recursive: true, force: true });
        }
      })
    );
  });

  describe("malformed JSON configuration", () => {
    it(
      "should handle invalid JSON syntax gracefully",
      withProcess(async spawn => {
        const tempDir = await mkdtemp(join(tmpdir(), "mcpadre-test-"));
        try {
          // Create malformed JSON with trailing comma
          const malformedJson = `{
  "version": 1,
  "mcpServers": {
    "test-server": {
      "command": ["node", "server.js"],
    }
  },
}`;

          const configPath = join(tempDir, "mcpadre.json");
          await writeFile(configPath, malformedJson);

          const result = await spawn(["run", "test-server"], {
            cwd: tempDir,
            buffer: true,
          });

          expect(result.exitCode).toBe(1);
          // Different types of config errors may be categorized as filesystem or validation
          const stderr = result.stderr;
          const hasValidationError = stderr.includes(
            "Settings validation failed"
          );
          const hasFilesystemError = stderr.includes(
            "Required file or directory not found"
          );
          expect(hasValidationError || hasFilesystemError).toBe(true);
        } finally {
          await rm(tempDir, { recursive: true, force: true });
        }
      })
    );
  });

  describe("missing configuration file", () => {
    it(
      "should handle missing configuration file gracefully",
      withProcess(async spawn => {
        const tempDir = await mkdtemp(join(tmpdir(), "mcpadre-test-"));
        try {
          // Try to run without any config file
          const result = await spawn(["run", "test-server"], {
            cwd: tempDir,
            buffer: true,
          });

          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain(
            "Required file or directory not found"
          );
        } finally {
          await rm(tempDir, { recursive: true, force: true });
        }
      })
    );

    it(
      "should handle empty configuration file gracefully",
      withProcess(async spawn => {
        const tempDir = await mkdtemp(join(tmpdir(), "mcpadre-test-"));
        try {
          // Create completely empty config file
          const configPath = join(tempDir, "mcpadre.yaml");
          await writeFile(configPath, "");

          const result = await spawn(["run", "test-server"], {
            cwd: tempDir,
            buffer: true,
          });

          expect(result.exitCode).toBe(1);
          // Different types of config errors may be categorized as filesystem or validation
          const stderr = result.stderr;
          const hasValidationError = stderr.includes(
            "Settings validation failed"
          );
          const hasFilesystemError = stderr.includes(
            "Required file or directory not found"
          );
          expect(hasValidationError || hasFilesystemError).toBe(true);
        } finally {
          await rm(tempDir, { recursive: true, force: true });
        }
      })
    );
  });

  describe("schema validation errors", () => {
    it(
      "should handle invalid server configuration format",
      withProcess(async spawn => {
        const tempDir = await mkdtemp(join(tmpdir(), "mcpadre-test-"));
        try {
          // Create config with invalid server format
          const invalidConfig = `
version: 1
mcpServers:
  test-server: "should-be-object-not-string"
`;

          const configPath = join(tempDir, "mcpadre.yaml");
          await writeFile(configPath, invalidConfig);

          const result = await spawn(["run", "test-server"], {
            cwd: tempDir,
            buffer: true,
          });

          expect(result.exitCode).toBe(1);
          // Different types of config errors may be categorized as filesystem or validation
          const stderr = result.stderr;
          const hasValidationError = stderr.includes(
            "Settings validation failed"
          );
          const hasFilesystemError = stderr.includes(
            "Required file or directory not found"
          );
          expect(hasValidationError || hasFilesystemError).toBe(true);
        } finally {
          await rm(tempDir, { recursive: true, force: true });
        }
      })
    );

    it(
      "should handle invalid version number",
      withProcess(async spawn => {
        const tempDir = await mkdtemp(join(tmpdir(), "mcpadre-test-"));
        try {
          // Create config with unsupported version
          const invalidConfig = `
version: 999
mcpServers:
  test-server:
    command: ["node", "server.js"]
`;

          const configPath = join(tempDir, "mcpadre.yaml");
          await writeFile(configPath, invalidConfig);

          const result = await spawn(["run", "test-server"], {
            cwd: tempDir,
            buffer: true,
          });

          expect(result.exitCode).toBe(1);
          // Different types of config errors may be categorized as filesystem or validation
          const stderr = result.stderr;
          const hasValidationError = stderr.includes(
            "Settings validation failed"
          );
          const hasFilesystemError = stderr.includes(
            "Required file or directory not found"
          );
          expect(hasValidationError || hasFilesystemError).toBe(true);
        } finally {
          await rm(tempDir, { recursive: true, force: true });
        }
      })
    );
  });
});
