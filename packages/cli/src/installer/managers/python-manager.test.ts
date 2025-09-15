//
// IMPORTANT: Human permission has been granted to use vi.mock for this file.
//
// This test suite needs to verify logic that is tightly coupled to external commands
// (`uv`, `pip`, `asdf`, `mise`, `which`) and the file system (`os.homedir`).
// The code under test does not use dependency injection for these dependencies.
// Therefore, mocking is the only viable way to isolate the logic and test its
// decision-making process without creating fragile, environment-dependent tests.
//

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import which from "which";

import { createCommand } from "../../utils/command/index.js";
import { PythonManager } from "./python-manager.js";
import * as logic from "./python-manager-logic.js";

import type { WorkspaceContext } from "../../config/types/index.js";
import type { DeepPartial } from "vitest";

// Mock the dependencies
vi.mock("../../utils/command/index.js");
vi.mock("which");

// Helper to create a mock context
const createMockContext = (
  pythonVersionManager: logic.PythonVersionManager,
): DeepPartial<WorkspaceContext> => ({
  mergedConfig: {
    options: {
      pythonVersionManager,
    },
  },
});

describe("PythonManager", () => {
  let pythonManager: PythonManager;
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    pythonManager = new PythonManager();
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    };

    // Default mock for successful verification
    vi.mocked(createCommand).mockImplementation(() => ({
      output: vi.fn().mockResolvedValue("v0.1.0"),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("checkSystemPrerequisites", () => {
    const setupUvNotInstalled = () => {
      // Simulate uv --version failing, which triggers the install logic
      vi.mocked(createCommand).mockImplementation((cmd: string) => {
        if (cmd === "uv") {
          return {
            output: vi.fn().mockRejectedValue(new Error("uv not found")),
          };
        }
        // All other commands succeed by default in this setup
        return {
          output: vi.fn().mockResolvedValue("success"),
        };
      });
    };

    it("should call determineReshimAction and run the returned command", async () => {
      setupUvNotInstalled();
      vi.mocked(which).mockResolvedValue("/path/to/asdf/python");
      const determineSpy = vi
        .spyOn(logic, "determineReshimAction")
        .mockReturnValue("asdf");

      const context = createMockContext("auto") as WorkspaceContext;

      await pythonManager["checkSystemPrerequisites"]("/test", context, mockLogger);

      // Verify the shell called the logic function correctly
      expect(determineSpy).toHaveBeenCalledWith("auto", "/path/to/asdf/python");

      // Verify the shell executed the command returned by the logic function
      expect(createCommand).toHaveBeenCalledWith("asdf", ["reshim", "python"]);
      expect(createCommand).not.toHaveBeenCalledWith("mise", expect.any(Array));
    });

    it("should do nothing if determineReshimAction returns 'none'", async () => {
      setupUvNotInstalled();
      vi.mocked(which).mockResolvedValue("/usr/bin/python");
      const determineSpy = vi
        .spyOn(logic, "determineReshimAction")
        .mockReturnValue("none");

      const context = createMockContext("auto") as WorkspaceContext;

      await pythonManager["checkSystemPrerequisites"]("/test", context, mockLogger);

      expect(determineSpy).toHaveBeenCalledWith("auto", "/usr/bin/python");

      // Verify no reshim command was run
      expect(createCommand).not.toHaveBeenCalledWith("asdf", expect.any(Array));
      expect(createCommand).not.toHaveBeenCalledWith("mise", expect.any(Array));
    });

    it("should not attempt reshim if pip install fails", async () => {
      // Simulate uv check failing AND pip install failing
      vi.mocked(createCommand).mockImplementation((cmd: string) => {
        if (cmd === "uv") {
          return {
            output: vi.fn().mockRejectedValue(new Error("uv not found")),
          };
        }
        if (cmd === "python") {
          return {
            output: vi.fn().mockRejectedValue(new Error("pip failed")),
          };
        }
        return { output: vi.fn().mockResolvedValue("success") };
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
  });
});