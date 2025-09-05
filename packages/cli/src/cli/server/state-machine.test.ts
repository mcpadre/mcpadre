// pattern: Testing Infrastructure

import { describe, expect, it } from "vitest";

import {
  CommandState,
  createServerAddStateMachine,
  createServerRemoveStateMachine,
  InteractiveCommandStateMachine,
  type StateConfig,
} from "../../cli-helpers/state-machine.js";

describe("InteractiveCommandStateMachine", () => {
  describe("Basic State Management", () => {
    it("should initialize with the correct initial state", () => {
      const config: StateConfig = {
        initialState: CommandState.SERVER_SELECTION,
        transitions: [],
      };

      const sm = new InteractiveCommandStateMachine(config);
      expect(sm.getCurrentState()).toBe(CommandState.SERVER_SELECTION);
      expect(sm.getPreviousState()).toBeNull();
    });

    it("should track state history", () => {
      const config: StateConfig = {
        initialState: CommandState.SERVER_SELECTION,
        transitions: [
          {
            from: CommandState.SERVER_SELECTION,
            to: CommandState.CONFIRMATION,
            trigger: "continue",
          },
        ],
      };

      const sm = new InteractiveCommandStateMachine(config);
      expect(sm.getStateHistory()).toEqual([CommandState.SERVER_SELECTION]);
    });
  });

  describe("State Transitions", () => {
    it("should transition between valid states", async () => {
      const config: StateConfig = {
        initialState: CommandState.SERVER_SELECTION,
        transitions: [
          {
            from: CommandState.SERVER_SELECTION,
            to: CommandState.CONFIRMATION,
            trigger: "continue",
          },
        ],
      };

      const sm = new InteractiveCommandStateMachine(config);
      const result = await sm.transition("continue", ["server1", "server2"]);

      expect(result.newState).toBe(CommandState.CONFIRMATION);
      expect(sm.getCurrentState()).toBe(CommandState.CONFIRMATION);
      expect(sm.getPreviousState()).toBe(CommandState.SERVER_SELECTION);
    });

    it("should throw error for invalid transitions", async () => {
      const config: StateConfig = {
        initialState: CommandState.SERVER_SELECTION,
        transitions: [],
      };

      const sm = new InteractiveCommandStateMachine(config);

      await expect(sm.transition("continue")).rejects.toThrow(
        "Invalid transition: server_selection -> continue"
      );
    });

    it("should store data in context during transitions", async () => {
      const config: StateConfig = {
        initialState: CommandState.SERVER_SELECTION,
        transitions: [
          {
            from: CommandState.SERVER_SELECTION,
            to: CommandState.CONFIRMATION,
            trigger: "continue",
          },
        ],
      };

      const sm = new InteractiveCommandStateMachine(config);
      const testData = ["server1", "server2"];

      await sm.transition("continue", testData);

      expect(sm.getStateData(CommandState.SERVER_SELECTION)).toEqual(testData);
    });
  });

  describe("Navigation Support", () => {
    it("should indicate when going back is possible", async () => {
      const config: StateConfig = {
        initialState: CommandState.SERVER_SELECTION,
        transitions: [
          {
            from: CommandState.SERVER_SELECTION,
            to: CommandState.CONFIRMATION,
            trigger: "continue",
          },
          {
            from: CommandState.CONFIRMATION,
            to: CommandState.SERVER_SELECTION,
            trigger: "escape",
          },
        ],
      };

      const sm = new InteractiveCommandStateMachine(config);

      expect(sm.canGoBack()).toBe(false); // No previous state initially

      await sm.transition("continue");
      expect(sm.canGoBack()).toBe(true); // Now has previous state
    });

    it("should not allow going back from terminal states", async () => {
      const config: StateConfig = {
        initialState: CommandState.SERVER_SELECTION,
        transitions: [
          {
            from: CommandState.SERVER_SELECTION,
            to: CommandState.COMPLETED,
            trigger: "continue",
          },
        ],
      };

      const sm = new InteractiveCommandStateMachine(config);
      await sm.transition("continue");

      expect(sm.canGoBack()).toBe(false); // Completed state
    });
  });

  describe("Exit Conditions", () => {
    it("should indicate exit for completed state", async () => {
      const config: StateConfig = {
        initialState: CommandState.SERVER_SELECTION,
        transitions: [
          {
            from: CommandState.SERVER_SELECTION,
            to: CommandState.COMPLETED,
            trigger: "continue",
          },
        ],
      };

      const sm = new InteractiveCommandStateMachine(config);
      const result = await sm.transition("continue");

      expect(result.shouldExit).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it("should indicate exit for cancelled state", async () => {
      const config: StateConfig = {
        initialState: CommandState.SERVER_SELECTION,
        transitions: [
          {
            from: CommandState.SERVER_SELECTION,
            to: CommandState.CANCELLED,
            trigger: "escape",
          },
        ],
      };

      const sm = new InteractiveCommandStateMachine(config);
      const result = await sm.transition("escape");

      expect(result.shouldExit).toBe(true);
      expect(result.exitCode).toBe(1);
    });
  });

  describe("Context Management", () => {
    it("should manage context data correctly", () => {
      const config: StateConfig = {
        initialState: CommandState.SERVER_SELECTION,
        transitions: [],
        context: { initial: "data" },
      };

      const sm = new InteractiveCommandStateMachine(config);

      expect(sm.getContext()).toEqual({ initial: "data" });

      sm.setCurrentStateData("new data");
      expect(sm.getStateData(CommandState.SERVER_SELECTION)).toBe("new data");
    });

    it("should reset to initial state", async () => {
      const config: StateConfig = {
        initialState: CommandState.SERVER_SELECTION,
        transitions: [
          {
            from: CommandState.SERVER_SELECTION,
            to: CommandState.CONFIRMATION,
            trigger: "continue",
          },
        ],
      };

      const sm = new InteractiveCommandStateMachine(config);
      await sm.transition("continue", "test data");

      sm.reset();

      expect(sm.getCurrentState()).toBe(CommandState.SERVER_SELECTION);
      expect(sm.getPreviousState()).toBeNull();
      expect(sm.getContext()).toEqual({});
      expect(sm.getStateHistory()).toEqual([CommandState.SERVER_SELECTION]);
    });
  });
});

describe("Factory Functions", () => {
  describe("createServerAddStateMachine", () => {
    it("should create correctly configured state machine", () => {
      const sm = createServerAddStateMachine();

      expect(sm.getCurrentState()).toBe(CommandState.SERVER_SELECTION);
      expect(sm.getPreviousState()).toBeNull();
      expect(sm.canGoBack()).toBe(false);
    });

    it("should support full server add workflow", async () => {
      const sm = createServerAddStateMachine();

      // Server selection -> confirmation
      let result = await sm.transition("continue", ["server1"]);
      expect(result.newState).toBe(CommandState.CONFIRMATION);
      expect(sm.canGoBack()).toBe(true);

      // Go back to server selection
      result = await sm.transition("escape");
      expect(result.newState).toBe(CommandState.SERVER_SELECTION);

      // Forward again to confirmation
      result = await sm.transition("continue", ["server2"]);
      expect(result.newState).toBe(CommandState.CONFIRMATION);

      // Complete the process
      result = await sm.transition("continue");
      expect(result.newState).toBe(CommandState.COMPLETED);
      expect(result.shouldExit).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it("should handle cancellation from first step", async () => {
      const sm = createServerAddStateMachine();

      const result = await sm.transition("escape");
      expect(result.newState).toBe(CommandState.CANCELLED);
      expect(result.shouldExit).toBe(true);
      expect(result.exitCode).toBe(1);
    });
  });

  describe("createServerRemoveStateMachine", () => {
    it("should create correctly configured state machine", () => {
      const sm = createServerRemoveStateMachine();

      expect(sm.getCurrentState()).toBe(CommandState.CONFIRMATION);
      expect(sm.getPreviousState()).toBeNull();
      expect(sm.canGoBack()).toBe(false);
    });

    it("should support server remove workflow", async () => {
      const sm = createServerRemoveStateMachine();

      // Complete the removal
      const result = await sm.transition("continue");
      expect(result.newState).toBe(CommandState.COMPLETED);
      expect(result.shouldExit).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it("should handle cancellation", async () => {
      const sm = createServerRemoveStateMachine();

      const result = await sm.transition("escape");
      expect(result.newState).toBe(CommandState.CANCELLED);
      expect(result.shouldExit).toBe(true);
      expect(result.exitCode).toBe(1);
    });
  });
});
