// pattern: Imperative Shell
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDirectoryResolver } from "../directory-resolver/index.js";

import { resolveEnvVars } from "./index.js";

import type { EnvStringTemplate, EnvValue } from "../../config/types/index.js";

describe("resolveEnvVars", () => {
  let testDir: string;
  let logger: pino.Logger;

  beforeEach(async () => {
    // Create unique test directory for workspace
    testDir = join(
      tmpdir(),
      `mcpadre-env-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );
    await mkdir(testDir, { recursive: true });

    // Create silent logger for tests
    logger = pino({ level: "silent" });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe("EnvStringTemplate processing", () => {
    it("should resolve plain string templates", async () => {
      const directoryResolver = createDirectoryResolver(testDir);
      const parentEnv = { TEST_VAR: "test-value" };
      const envConfig: Record<string, EnvValue> = {
        SIMPLE: "hello {{parentEnv.TEST_VAR}}" as EnvStringTemplate,
        WITH_DIRS: "workspace is {{dirs.workspace}}" as EnvStringTemplate,
      };

      const result = await resolveEnvVars({
        directoryResolver,
        parentEnv,
        envConfig,
        logger,
      });

      expect(result["SIMPLE"]).toBe("hello test-value");
      expect(result["WITH_DIRS"]).toBe(`workspace is ${testDir}`);
    });
  });

  describe("EnvStringObject processing", () => {
    it("should resolve string object templates", async () => {
      const directoryResolver = createDirectoryResolver(testDir);
      const parentEnv = { CONFIG_PATH: "/app/config" };
      const envConfig: Record<string, EnvValue> = {
        CONFIG_FILE: {
          string: "{{parentEnv.CONFIG_PATH}}/app.yaml" as EnvStringTemplate,
        },
      };

      const result = await resolveEnvVars({
        directoryResolver,
        parentEnv,
        envConfig,
        logger,
      });

      expect(result["CONFIG_FILE"]).toBe("/app/config/app.yaml");
    });
  });

  describe("EnvSpecialDirectory processing", () => {
    it("should resolve workspace special directory", async () => {
      const directoryResolver = createDirectoryResolver(testDir);
      const parentEnv = {};
      const envConfig: Record<string, EnvValue> = {
        WORKSPACE_PATH: {
          special: "workspace",
        },
      };

      const result = await resolveEnvVars({
        directoryResolver,
        parentEnv,
        envConfig,
        logger,
      });

      expect(result["WORKSPACE_PATH"]).toBe(testDir);
    });

    it("should resolve all special directory types", async () => {
      const directoryResolver = createDirectoryResolver(testDir);
      const parentEnv = {};
      const envConfig: Record<string, EnvValue> = {
        HOME_DIR: { special: "home" },
        CONFIG_DIR: { special: "config" },
        CACHE_DIR: { special: "cache" },
        DATA_DIR: { special: "data" },
        LOG_DIR: { special: "log" },
        TEMP_DIR: { special: "temp" },
        WORKSPACE_DIR: { special: "workspace" },
      };

      const result = await resolveEnvVars({
        directoryResolver,
        parentEnv,
        envConfig,
        logger,
      });

      expect(result["HOME_DIR"]).toBe(directoryResolver.home);
      expect(result["CONFIG_DIR"]).toBe(directoryResolver.config);
      expect(result["CACHE_DIR"]).toBe(directoryResolver.cache);
      expect(result["DATA_DIR"]).toBe(directoryResolver.data);
      expect(result["LOG_DIR"]).toBe(directoryResolver.log);
      expect(result["TEMP_DIR"]).toBe(directoryResolver.temp);
      expect(result["WORKSPACE_DIR"]).toBe(directoryResolver.workspace);
    });

    it("should throw error for unknown special directory", async () => {
      const directoryResolver = createDirectoryResolver(testDir);
      const parentEnv = {};
      const envConfig: Record<string, EnvValue> = {
        UNKNOWN_DIR: {
          special: "unknown" as any,
        },
      };

      await expect(
        resolveEnvVars({
          directoryResolver,
          parentEnv,
          envConfig,
          logger,
        })
      ).rejects.toThrow("Unknown special directory: unknown");
    });
  });

  describe("EnvPass processing", () => {
    it("should pass through existing parent environment variables", async () => {
      const directoryResolver = createDirectoryResolver(testDir);
      const parentEnv = {
        HOME: "/home/user",
        PATH: "/usr/bin:/bin",
      };
      const envConfig: Record<string, EnvValue> = {
        USER_HOME: {
          pass: "HOME",
        },
        SYSTEM_PATH: {
          pass: "PATH",
        },
      };

      const result = await resolveEnvVars({
        directoryResolver,
        parentEnv,
        envConfig,
        logger,
      });

      expect(result["USER_HOME"]).toBe("/home/user");
      expect(result["SYSTEM_PATH"]).toBe("/usr/bin:/bin");
    });

    it("should throw error for undefined parent environment variables", async () => {
      const directoryResolver = createDirectoryResolver(testDir);
      const parentEnv = {};
      const envConfig: Record<string, EnvValue> = {
        MISSING_VAR: {
          pass: "NON_EXISTENT",
        },
      };

      await expect(
        resolveEnvVars({
          directoryResolver,
          parentEnv,
          envConfig,
          logger,
        })
      ).rejects.toThrow(
        "Pass-through environment variable 'NON_EXISTENT' is not defined"
      );
    });
  });

  describe("EnvCommand processing", () => {
    it("should execute simple commands and capture stdout", async () => {
      const directoryResolver = createDirectoryResolver(testDir);
      const parentEnv = { USER: "testuser" };
      const envConfig: Record<string, EnvValue> = {
        ECHO_TEST: {
          command: "echo hello world",
        },
        DATE_CMD: {
          command: "echo 2024-01-01",
        },
      };

      const result = await resolveEnvVars({
        directoryResolver,
        parentEnv,
        envConfig,
        logger,
      });

      expect(result["ECHO_TEST"]).toBe("hello world");
      expect(result["DATE_CMD"]).toBe("2024-01-01");
    });

    it("should template commands before execution", async () => {
      const directoryResolver = createDirectoryResolver(testDir);
      const parentEnv = { MESSAGE: "templated" };
      const envConfig: Record<string, EnvValue> = {
        TEMPLATED_CMD: {
          command: "echo {{parentEnv.MESSAGE}} command",
        },
        WORKSPACE_CMD: {
          command: "echo workspace: {{dirs.workspace}}",
        },
      };

      const result = await resolveEnvVars({
        directoryResolver,
        parentEnv,
        envConfig,
        logger,
      });

      expect(result["TEMPLATED_CMD"]).toBe("templated command");
      expect(result["WORKSPACE_CMD"]).toBe(`workspace: ${testDir}`);
    });

    it("should handle command failures gracefully", async () => {
      const directoryResolver = createDirectoryResolver(testDir);
      const parentEnv = {};
      const envConfig: Record<string, EnvValue> = {
        FAILING_CMD: {
          command: "exit 1", // Cross-platform command that always fails
        },
      };

      await expect(
        resolveEnvVars({
          directoryResolver,
          parentEnv,
          envConfig,
          logger,
        })
      ).rejects.toThrow("Failed to resolve environment variable 'FAILING_CMD'");
    });

    it("should run multiple commands in parallel", async () => {
      const directoryResolver = createDirectoryResolver(testDir);
      const parentEnv = {};
      const envConfig: Record<string, EnvValue> = {
        CMD1: { command: "echo first" },
        CMD2: { command: "echo second" },
        CMD3: { command: "echo third" },
      };

      const startTime = Date.now();
      const result = await resolveEnvVars({
        directoryResolver,
        parentEnv,
        envConfig,
        logger,
      });
      const endTime = Date.now();

      // All commands should complete
      expect(result["CMD1"]).toBe("first");
      expect(result["CMD2"]).toBe("second");
      expect(result["CMD3"]).toBe("third");

      // Should be faster than running sequentially (rough check)
      expect(endTime - startTime).toBeLessThan(1000); // Should be much faster than 1 second
    });
  });

  describe("Mixed environment configurations", () => {
    it("should handle all environment value types together", async () => {
      const directoryResolver = createDirectoryResolver(testDir);
      const parentEnv = {
        HOME: "/home/user",
        APP_NAME: "myapp",
      };
      const envConfig: Record<string, EnvValue> = {
        // String template
        APP_CONFIG: "{{parentEnv.APP_NAME}}.yaml" as EnvStringTemplate,

        // String object
        CONFIG_PATH: {
          string: "{{dirs.workspace}}/config" as EnvStringTemplate,
        },

        // Special directory
        CONFIG_DIR: {
          special: "config",
        },

        // Pass-through
        USER_HOME: {
          pass: "HOME",
        },

        // Command
        HOSTNAME: {
          command: "echo test-host",
        },
      };

      const result = await resolveEnvVars({
        directoryResolver,
        parentEnv,
        envConfig,
        logger,
      });

      expect(result["APP_CONFIG"]).toBe("myapp.yaml");
      expect(result["CONFIG_PATH"]).toBe(`${testDir}/config`);
      expect(result["CONFIG_DIR"]).toBe(directoryResolver.config);
      expect(result["USER_HOME"]).toBe("/home/user");
      expect(result["HOSTNAME"]).toBe("test-host");
    });
  });

  describe("Error handling", () => {
    it("should fail fast if any environment resolution fails", async () => {
      const directoryResolver = createDirectoryResolver(testDir);
      const parentEnv = {};
      const envConfig: Record<string, EnvValue> = {
        VALID: "hello" as EnvStringTemplate,
        INVALID: { pass: "MISSING_VAR" },
        ALSO_VALID: "world" as EnvStringTemplate,
      };

      await expect(
        resolveEnvVars({
          directoryResolver,
          parentEnv,
          envConfig,
          logger,
        })
      ).rejects.toThrow("Failed to resolve environment variable 'INVALID'");
    });
  });
});
