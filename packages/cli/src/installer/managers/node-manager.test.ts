//
// IMPORTANT: Human permission has been granted to use vi.mock for this file.
//
// This test suite needs to verify logic that is tightly coupled to external commands
// (`pnpm`, `npm`, `asdf`, `mise`, `which`) and the file system (`os.homedir`).
// The code under test does not use dependency injection for these dependencies.
// Therefore, mocking is the only viable way to isolate the logic and test its
// decision-making process without creating fragile, environment-dependent tests.
//

import pino from "pino";
import { PartialDeep } from "type-fest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import which from "which";

import { createCommand } from "../../utils/command/index.js";

import { NodeManager } from "./node-manager.js";
import * as logic from "./node-manager-logic.js";

import type {
  NodeVersionManager,
  WorkspaceContext,
} from "../../config/types/index.js";
import type { CommandBuilder } from "../../utils/command/index.js";

// Mock the dependencies
vi.mock("../../utils/command/index.js");
vi.mock("which");

// Helper to create a mock context
const createMockContext = (
  nodeVersionManager: NodeVersionManager
): PartialDeep<WorkspaceContext> => ({
  mergedConfig: {
    options: {
      nodeVersionManager,
    },
  },
});

describe("NodeManager", () => {
  let nodeManager: NodeManager;
  let mockLogger: pino.Logger;

  beforeEach(() => {
    nodeManager = new NodeManager();
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
          output: vi.fn().mockResolvedValue("v8.0.0"),
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
    const setupPnpmNotInstalled = () => {
      // Track installation state to simulate real-world behavior:
      // pnpm fails initially, then becomes available after npm install
      let pnpmInstalled = false;

      // Mock createCommand to simulate the complete installation workflow
      vi.mocked(createCommand).mockImplementation((cmd: string) => {
        if (cmd === "pnpm") {
          return {
            output: vi.fn().mockImplementation(
              () =>
                pnpmInstalled
                  ? Promise.resolve("v8.0.0") // Success after install
                  : Promise.reject(new Error("pnpm not found")) // Fail before install
            ),
            addArgs: vi.fn().mockReturnThis(),
            currentDir: vi.fn().mockReturnThis(),
          } as unknown as CommandBuilder;
        }

        if (cmd === "npm") {
          return {
            output: vi.fn().mockImplementation(() => {
              // When npm install -g pnpm is called, mark pnpm as installed
              pnpmInstalled = true;
              return Promise.resolve("pnpm installed successfully");
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
      setupPnpmNotInstalled();
      vi.mocked(which).mockResolvedValue("/path/to/asdf/node");
      const determineSpy = vi
        .spyOn(logic, "determineReshimAction")
        .mockReturnValue("asdf");

      const context = createMockContext("auto") as WorkspaceContext;

      await nodeManager["checkSystemPrerequisites"](
        "/test",
        context,
        mockLogger
      );

      // Verify the shell called the logic function correctly
      expect(determineSpy).toHaveBeenCalledWith("auto", "/path/to/asdf/node");

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
        "nodejs",
      ]);
      expect(createCommand).not.toHaveBeenCalledWith(
        "mise",
        expect.any(Object)
      );
    });

    it("should do nothing if determineReshimAction returns 'none'", async () => {
      setupPnpmNotInstalled();
      vi.mocked(which).mockResolvedValue("/usr/bin/node");
      const determineSpy = vi
        .spyOn(logic, "determineReshimAction")
        .mockReturnValue("none");

      const context = createMockContext("auto") as WorkspaceContext;

      await nodeManager["checkSystemPrerequisites"](
        "/test",
        context,
        mockLogger
      );

      expect(determineSpy).toHaveBeenCalledWith("auto", "/usr/bin/node");

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

    it("should not attempt reshim if npm install fails", async () => {
      // Simulate pnpm check failing AND npm install failing
      vi.mocked(createCommand).mockImplementation((cmd: string) => {
        if (cmd === "pnpm") {
          return {
            output: vi.fn().mockRejectedValue(new Error("pnpm not found")),
            addArgs: vi.fn().mockReturnThis(),
            currentDir: vi.fn().mockReturnThis(),
          } as unknown as CommandBuilder;
        }
        if (cmd === "npm") {
          return {
            output: vi.fn().mockRejectedValue(new Error("npm failed")),
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
        nodeManager["checkSystemPrerequisites"]("/test", context, mockLogger)
      ).rejects.toThrow();

      // Verify we never even got to the reshim logic
      expect(determineSpy).not.toHaveBeenCalled();
    });

    it("should throw early when node --version fails", async () => {
      // Mock node --version to fail completely
      vi.mocked(createCommand).mockImplementation((cmd: string) => {
        if (cmd === "node") {
          return {
            output: vi
              .fn()
              .mockRejectedValue(new Error("node: command not found")),
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
        nodeManager["checkSystemPrerequisites"]("/test", context, mockLogger)
      ).rejects.toThrow("Node.js is not available or not working");

      // Should never reach pnpm check or reshim logic
      expect(createCommand).toHaveBeenCalledWith("node", mockLogger);
      expect(createCommand).not.toHaveBeenCalledWith(
        "pnpm",
        expect.any(Object)
      );
    });

    it("should throw when which(node) returns null in auto mode", async () => {
      setupPnpmNotInstalled();
      vi.mocked(which).mockRejectedValue(new Error("node not found")); // which("node") throws, caught as null
      const determineSpy = vi
        .spyOn(logic, "determineReshimAction")
        .mockImplementation(() => {
          throw new Error(
            "Cannot determine version manager in 'auto' mode because the base executable (e.g., node) was not found in the PATH."
          );
        });

      const context = createMockContext("auto") as WorkspaceContext;

      await expect(
        nodeManager["checkSystemPrerequisites"]("/test", context, mockLogger)
      ).rejects.toThrow("Cannot determine version manager in 'auto' mode");

      // Should have tried to call determineReshimAction with null path
      expect(determineSpy).toHaveBeenCalledWith("auto", null);
    });
  });
});
