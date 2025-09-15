//
// IMPORTANT: Human permission has been granted to use vi.mock for this file.
//
// This test suite needs to verify logic that is tightly coupled to external commands
// (`pnpm`, `npm`, `asdf`, `mise`, `which`) and the file system (`os.homedir`).
// The code under test does not use dependency injection for these dependencies.
// Therefore, mocking is the only viable way to isolate the logic and test its
// decision-making process without creating fragile, environment-dependent tests.
//

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import which from "which";

import { createCommand } from "../../utils/command/index.js";
import { NodeManager } from "./node-manager.js";
import * as logic from "./node-manager-logic.js";

import type { WorkspaceContext } from "../../config/types/index.js";
import type { DeepPartial } from "vitest";

// Mock the dependencies
vi.mock("../../utils/command/index.js");
vi.mock("which");

// Helper to create a mock context
const createMockContext = (
  nodeVersionManager: logic.NodeVersionManager,
): DeepPartial<WorkspaceContext> => ({
  mergedConfig: {
    options: {
      nodeVersionManager,
    },
  },
});

describe("NodeManager", () => {
  let nodeManager: NodeManager;
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    nodeManager = new NodeManager();
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    };

    // Default mock for successful verification
    vi.mocked(createCommand).mockImplementation(() => ({
      output: vi.fn().mockResolvedValue("v8.0.0"),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("checkSystemPrerequisites", () => {
    const setupPnpmNotInstalled = () => {
      // Simulate pnpm --version failing, which triggers the install logic
      vi.mocked(createCommand).mockImplementation((cmd: string) => {
        if (cmd === "pnpm") {
          return {
            output: vi.fn().mockRejectedValue(new Error("pnpm not found")),
          };
        }
        // All other commands succeed by default in this setup
        return {
          output: vi.fn().mockResolvedValue("success"),
        };
      });
    };

    it("should call determineReshimAction and run the returned command", async () => {
      setupPnpmNotInstalled();
      vi.mocked(which).mockResolvedValue("/path/to/asdf/node");
      const determineSpy = vi
        .spyOn(logic, "determineReshimAction")
        .mockReturnValue("asdf");

      const context = createMockContext("auto") as WorkspaceContext;

      await nodeManager["checkSystemPrerequisites"]("/test", context, mockLogger);

      // Verify the shell called the logic function correctly
      expect(determineSpy).toHaveBeenCalledWith("auto", "/path/to/asdf/node");

      // Verify the shell executed the command returned by the logic function
      expect(createCommand).toHaveBeenCalledWith("asdf", ["reshim", "nodejs"]);
      expect(createCommand).not.toHaveBeenCalledWith("mise", expect.any(Array));
    });

    it("should do nothing if determineReshimAction returns 'none'", async () => {
      setupPnpmNotInstalled();
      vi.mocked(which).mockResolvedValue("/usr/bin/node");
      const determineSpy = vi
        .spyOn(logic, "determineReshimAction")
        .mockReturnValue("none");

      const context = createMockContext("auto") as WorkspaceContext;

      await nodeManager["checkSystemPrerequisites"]("/test", context, mockLogger);

      expect(determineSpy).toHaveBeenCalledWith("auto", "/usr/bin/node");

      // Verify no reshim command was run
      expect(createCommand).not.toHaveBeenCalledWith("asdf", expect.any(Array));
      expect(createCommand).not.toHaveBeenCalledWith("mise", expect.any(Array));
    });

    it("should not attempt reshim if npm install fails", async () => {
      // Simulate pnpm check failing AND npm install failing
      vi.mocked(createCommand).mockImplementation((cmd: string) => {
        if (cmd === "pnpm") {
          return {
            output: vi.fn().mockRejectedValue(new Error("pnpm not found")),
          };
        }
        if (cmd === "npm") {
          return {
            output: vi.fn().mockRejectedValue(new Error("npm failed")),
          };
        }
        return { output: vi.fn().mockResolvedValue("success") };
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
  });
});
