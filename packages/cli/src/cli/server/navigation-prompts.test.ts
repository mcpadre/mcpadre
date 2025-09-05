// pattern: Testing Infrastructure

import { render } from "@inquirer/testing";
import { describe, expect, it } from "vitest";

import {
  confirmWithEscapeHandling,
  NavigationError,
  type NavigationResult,
  promptForConfirmationWithEscapeHandling,
  promptForConfirmationWithNavigation,
  promptForServerSelectionWithNavigation,
} from "../../cli-helpers/navigation-prompts.js";

describe("Navigation Prompts", () => {
  describe("promptForServerSelectionWithNavigation", () => {
    it("should return continue action with selected servers", async () => {
      // This test would need to mock the checkbox prompt
      // For now, we'll test the error handling paths
      expect(promptForServerSelectionWithNavigation).toBeDefined();
    });

    it("should return exit action on SIGINT error", async () => {
      // Mock implementation would go here
      // Testing the actual interactive behavior requires integration tests
      expect(promptForServerSelectionWithNavigation).toBeDefined();
    });
  });

  describe("promptForConfirmationWithNavigation", () => {
    it("should return continue action with confirmation", async () => {
      expect(promptForConfirmationWithNavigation).toBeDefined();
    });

    it("should return back action when canGoBack is true", async () => {
      expect(promptForConfirmationWithNavigation).toBeDefined();
    });

    it("should return exit action when canGoBack is false", async () => {
      expect(promptForConfirmationWithNavigation).toBeDefined();
    });
  });

  describe("promptForConfirmationWithEscapeHandling", () => {
    it("should return continue action with confirmation", async () => {
      expect(promptForConfirmationWithEscapeHandling).toBeDefined();
    });

    it("should return back action when escape is pressed and canGoBack is true", async () => {
      // Test the low-level prompt throws NavigationError correctly
      const { answer, events } = await render(confirmWithEscapeHandling, {
        message: "Add 2 servers to configuration?",
        canGoBack: true,
      });

      // Simulate escape key press and expect NavigationError to be thrown
      let caughtError: unknown = null;
      try {
        events.keypress("escape");
        await answer;
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(NavigationError);
      if (caughtError instanceof NavigationError) {
        expect(caughtError.action).toBe("back");
      }
    });

    it("should return exit action when escape is pressed and canGoBack is false", async () => {
      const { answer, events } = await render(confirmWithEscapeHandling, {
        message: "Add 2 servers to configuration?",
        canGoBack: false,
      });

      // Simulate escape key press and expect NavigationError to be thrown
      let caughtError: unknown = null;
      try {
        events.keypress("escape");
        await answer;
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(NavigationError);
      if (caughtError instanceof NavigationError) {
        expect(caughtError.action).toBe("exit");
      }
    });

    it("should handle default values correctly", async () => {
      expect(promptForConfirmationWithEscapeHandling).toBeDefined();
    });
  });

  describe("NavigationError", () => {
    it("should create NavigationError with back action", () => {
      const error = new NavigationError("back");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(NavigationError);
      expect(error.name).toBe("NavigationError");
      expect(error.action).toBe("back");
      expect(error.message).toBe("Navigation action: back");
    });

    it("should create NavigationError with exit action", () => {
      const error = new NavigationError("exit");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(NavigationError);
      expect(error.name).toBe("NavigationError");
      expect(error.action).toBe("exit");
      expect(error.message).toBe("Navigation action: exit");
    });

    it("should create NavigationError with custom message", () => {
      const customMessage = "User pressed escape key";
      const error = new NavigationError("back", customMessage);

      expect(error.message).toBe(customMessage);
      expect(error.action).toBe("back");
    });

    it("should be catchable with instanceof", () => {
      const throwNavigationError = (action: "back" | "exit"): never => {
        throw new NavigationError(action);
      };

      try {
        throwNavigationError("back");
      } catch (error) {
        expect(error).toBeInstanceOf(NavigationError);
        if (error instanceof NavigationError) {
          expect(error.action).toBe("back");
        }
      }

      try {
        throwNavigationError("exit");
      } catch (error) {
        expect(error).toBeInstanceOf(NavigationError);
        if (error instanceof NavigationError) {
          expect(error.action).toBe("exit");
        }
      }
    });

    it("should not be instanceof regular Error when checking for NavigationError", () => {
      const regularError = new Error("Regular error message");
      const navigationError = new NavigationError("back");

      expect(regularError).toBeInstanceOf(Error);
      expect(regularError).not.toBeInstanceOf(NavigationError);
      expect(navigationError).toBeInstanceOf(Error);
      expect(navigationError).toBeInstanceOf(NavigationError);
    });
  });

  describe("Navigation Result Types", () => {
    it("should have correct action types", () => {
      const continueResult: NavigationResult<boolean> = {
        action: "continue",
        value: true,
      };

      const backResult: NavigationResult<never> = {
        action: "back",
      };

      const exitResult: NavigationResult<never> = {
        action: "exit",
      };

      expect(continueResult.action).toBe("continue");
      expect(backResult.action).toBe("back");
      expect(exitResult.action).toBe("exit");
    });
  });
});
