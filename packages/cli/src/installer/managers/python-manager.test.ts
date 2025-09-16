//
// IMPORTANT: This file uses vi.mock with explicit developer approval.
//
// This test suite needs to verify logic that is tightly coupled to external commands
// (`uv`, `pip`, `asdf`, `mise`, `which`) and the file system (`os.homedir`).
// The code under test does not use dependency injection for these dependencies.
// Therefore, mocking is the only viable way to isolate the logic and test its
// decision-making process without creating fragile, environment-dependent tests.
//

import pino from "pino";
import { PartialDeep } from "type-fest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import which from "which";

import { createCommand } from "../../utils/command/index.js";

import { PythonManager } from "./python-manager.js";
import * as logic from "./python-manager-logic.js";

import type { WorkspaceContext } from "../../config/types/index.js";
import type { PythonVersionManager } from "../../config/types/index.js";
import type { CommandBuilder } from "../../utils/command/index.js";

// Mock the dependencies
vi.mock("../../utils/command/index.js");
vi.mock("which");

// Helper to create a mock context
const createMockContext = (
  pythonVersionManager: PythonVersionManager
): PartialDeep<WorkspaceContext> => ({
  mergedConfig: {
    options: {
      pythonVersionManager,
    },
  },
});

describe("PythonManager", () => {
  let pythonManager: PythonManager;
  let mockLogger: pino.Logger;

  beforeEach(() => {
    pythonManager = new PythonManager();
    mockLogger = pino({
      level: "debug",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: false,
          translateTime: false,
          ignore: "pid,hostname",
        },
      },
    });

    // Default mock for successful verification
    vi.mocked(createCommand).mockImplementation(
      () =>
        ({
          output: vi.fn().mockResolvedValue("v0.1.0"),
          addArgs: vi.fn().mockReturnThis(),
          currentDir: vi.fn().mockReturnThis(),
        }) as unknown as CommandBuilder
    ); // Cast to CommandBuilder
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("checkSystemPrerequisites", () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const setupUvNotInstalled = () => {
      // Track installation state to simulate real-world behavior:
      // uv fails initially, then becomes available after pip install
      let uvInstalled = false;

      // Mock createCommand to simulate the complete installation workflow
      vi.mocked(createCommand).mockImplementation((cmd: string) => {
        if (cmd === "uv") {
          return {
            output: vi.fn().mockImplementation(
              () =>
                uvInstalled
                  ? Promise.resolve("v0.1.0") // Success after install
                  : Promise.reject(new Error("uv not found")) // Fail before install
            ),
            addArgs: vi.fn().mockReturnThis(),
            currentDir: vi.fn().mockReturnThis(),
          } as unknown as CommandBuilder;
        }

        if (cmd === "python") {
          return {
            output: vi.fn().mockImplementation((args?: string[]) => {
              // Check if this is a pip install command
              if (
                args &&
                args.includes("pip") &&
                args.includes("install") &&
                args.includes("uv")
              ) {
                // When python -m pip install uv is called, mark uv as installed
                uvInstalled = true;
                return Promise.resolve("uv installed successfully");
              }
              // For other python commands (like --version or -m uv --version)
              return uvInstalled
                ? Promise.resolve("Python 3.11.0 and uv available")
                : Promise.resolve("Python 3.11.0");
            }),
            addArgs: vi.fn().mockReturnThis(),
            currentDir: vi.fn().mockReturnThis(),
          } as unknown as CommandBuilder;
        }

        // All other commands (like asdf, mise) succeed by default
        return {
          output: vi.fn().mockResolvedValue("success"),
          addArgs: vi.fn().mockReturnThis(),
          currentDir: vi.fn().mockReturnThis(),
        } as unknown as CommandBuilder;
      });
    };

    it("should call determineReshimAction and run the returned command", async () => {
      setupUvNotInstalled();
      vi.mocked(which).mockResolvedValue("/path/to/asdf/python");
      const determineSpy = vi
        .spyOn(logic, "determineReshimAction")
        .mockReturnValue("asdf");

      const context = createMockContext("auto") as WorkspaceContext;

      await pythonManager["checkSystemPrerequisites"](
        "/test",
        context,
        mockLogger
      );

      // Verify the shell called the logic function correctly
      expect(determineSpy).toHaveBeenCalledWith("auto", "/path/to/asdf/python");

      // Verify the shell executed the command returned by the logic function
      expect(createCommand).toHaveBeenCalledWith("asdf", mockLogger);

      // Find the specific asdf command call in the mock results
      const asdfCallIndex = vi
        .mocked(createCommand)
        .mock.calls.findIndex(call => call[0] === "asdf");
      expect(asdfCallIndex).toBeGreaterThanOrEqual(0);

      const asdfMockResult =
        vi.mocked(createCommand).mock.results[asdfCallIndex];
      expect(asdfMockResult).toBeTruthy();
      expect(asdfMockResult!.value.addArgs).toHaveBeenCalledWith([
        "reshim",
        "python",
      ]);
      expect(createCommand).not.toHaveBeenCalledWith(
        "mise",
        expect.any(Object)
      );
    });

    it("should do nothing if determineReshimAction returns 'none'", async () => {
      setupUvNotInstalled();
      vi.mocked(which).mockResolvedValue("/usr/bin/python");
      const determineSpy = vi
        .spyOn(logic, "determineReshimAction")
        .mockReturnValue("none");

      const context = createMockContext("auto") as WorkspaceContext;

      await pythonManager["checkSystemPrerequisites"](
        "/test",
        context,
        mockLogger
      );

      expect(determineSpy).toHaveBeenCalledWith("auto", "/usr/bin/python");

      // Verify no reshim command was run
      expect(createCommand).not.toHaveBeenCalledWith(
        "asdf",
        expect.any(Object)
      );
      expect(createCommand).not.toHaveBeenCalledWith(
        "mise",
        expect.any(Object)
      );
    });

    it("should not attempt reshim if pip install fails", async () => {
      // Simulate uv check failing AND pip install failing
      vi.mocked(createCommand).mockImplementation((cmd: string) => {
        if (cmd === "uv") {
          return {
            output: vi.fn().mockRejectedValue(new Error("uv not found")),
            addArgs: vi.fn().mockReturnThis(),
            currentDir: vi.fn().mockReturnThis(),
          } as unknown as CommandBuilder;
        }
        if (cmd === "python") {
          return {
            output: vi.fn().mockRejectedValue(new Error("pip failed")),
            addArgs: vi.fn().mockReturnThis(),
            currentDir: vi.fn().mockReturnThis(),
          } as unknown as CommandBuilder;
        }
        return {
          output: vi.fn().mockResolvedValue("success"),
          addArgs: vi.fn().mockReturnThis(),
          currentDir: vi.fn().mockReturnThis(),
        } as unknown as CommandBuilder;
      });

      const determineSpy = vi.spyOn(logic, "determineReshimAction");
      const context = createMockContext("auto") as WorkspaceContext;

      // Expect the whole thing to throw
      await expect(
        pythonManager["checkSystemPrerequisites"]("/test", context, mockLogger)
      ).rejects.toThrow();

      // Verify we never even got to the reshim logic
      expect(determineSpy).not.toHaveBeenCalled();
    });

    it("should throw early when python --version fails", async () => {
      // Mock python --version to fail completely
      vi.mocked(createCommand).mockImplementation((cmd: string) => {
        if (cmd === "python") {
          return {
            output: vi
              .fn()
              .mockRejectedValue(new Error("python: command not found")),
            addArgs: vi.fn().mockReturnThis(),
            currentDir: vi.fn().mockReturnThis(),
          } as unknown as CommandBuilder;
        }
        // Other commands shouldn't be reached
        return {
          output: vi.fn().mockResolvedValue("success"),
          addArgs: vi.fn().mockReturnThis(),
          currentDir: vi.fn().mockReturnThis(),
        } as unknown as CommandBuilder;
      });

      const context = createMockContext("auto") as WorkspaceContext;

      await expect(
        pythonManager["checkSystemPrerequisites"]("/test", context, mockLogger)
      ).rejects.toThrow("Python is not available or not working");

      // Should never reach uv check or reshim logic
      expect(createCommand).toHaveBeenCalledWith("python", mockLogger);
      expect(createCommand).not.toHaveBeenCalledWith("uv", expect.any(Object));
    });

    it("should throw when which(python) returns null in auto mode", async () => {
      setupUvNotInstalled();
      vi.mocked(which).mockRejectedValue(new Error("python not found")); // which("python") throws, caught as null
      const determineSpy = vi
        .spyOn(logic, "determineReshimAction")
        .mockImplementation(() => {
          throw new Error(
            "Cannot determine version manager in 'auto' mode because the base executable (e.g., python) was not found in the PATH."
          );
        });

      const context = createMockContext("auto") as WorkspaceContext;

      await expect(
        pythonManager["checkSystemPrerequisites"]("/test", context, mockLogger)
      ).rejects.toThrow("Cannot determine version manager in 'auto' mode");

      // Should have tried to call determineReshimAction with null path
      expect(determineSpy).toHaveBeenCalledWith("auto", null);
    });
  });
});
