// pattern: Functional Core

/**
 * Available states for interactive commands
 */
export enum CommandState {
  SERVER_SELECTION = "server_selection",
  REGISTRY_TYPE_SELECTION = "registry_type_selection",
  PACKAGE_INPUT = "package_input",
  VERSION_SELECTION = "version_selection",
  CONFIRMATION = "confirmation",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

/**
 * Available triggers for state transitions
 */
export type StateTrigger = "escape" | "continue" | "cancel" | "complete";

/**
 * Result of a state transition
 */
export interface StateResult {
  newState: CommandState;
  data?: unknown;
  shouldExit?: boolean;
  exitCode?: number;
}

/**
 * State transition definition
 */
export interface StateTransition {
  from: CommandState;
  to: CommandState;
  trigger: StateTrigger;
}

/**
 * Configuration for state machine behavior
 */
export interface StateConfig {
  initialState: CommandState;
  transitions: StateTransition[];
  context?: Record<string, unknown>;
}

/**
 * Interactive command state machine for handling navigation
 */
export class InteractiveCommandStateMachine {
  private currentState: CommandState;
  private previousState: CommandState | null = null;
  private transitions: Map<string, CommandState>;
  private context: Record<string, unknown>;
  private stateHistory: CommandState[] = [];

  constructor(config: StateConfig) {
    this.currentState = config.initialState;
    this.context = config.context ?? {};
    this.transitions = new Map();

    // Build transition map for O(1) lookups
    for (const transition of config.transitions) {
      const key = `${transition.from}:${transition.trigger}`;
      this.transitions.set(key, transition.to);
    }

    this.stateHistory.push(this.currentState);
  }

  /**
   * Attempt a state transition
   */
  async transition(
    trigger: StateTrigger,
    data?: unknown
  ): Promise<StateResult> {
    const key = `${this.currentState}:${trigger}`;
    const newState = this.transitions.get(key);

    if (!newState) {
      throw new Error(`Invalid transition: ${this.currentState} -> ${trigger}`);
    }

    // Update state
    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateHistory.push(this.currentState);

    // Store data in context if provided
    if (data !== undefined) {
      this.context[this.previousState] = data;
    }

    // Determine if we should exit and with what code
    const shouldExit =
      newState === CommandState.COMPLETED ||
      newState === CommandState.CANCELLED;
    const exitCode = newState === CommandState.COMPLETED ? 0 : 1;

    return {
      newState,
      data,
      shouldExit,
      exitCode,
    };
  }

  /**
   * Get current state
   */
  getCurrentState(): CommandState {
    return this.currentState;
  }

  /**
   * Get previous state
   */
  getPreviousState(): CommandState | null {
    return this.previousState;
  }

  /**
   * Check if we can go back to a previous state
   */
  canGoBack(): boolean {
    return (
      this.previousState !== null &&
      this.currentState !== CommandState.COMPLETED &&
      this.currentState !== CommandState.CANCELLED
    );
  }

  /**
   * Get data stored for a specific state
   */
  getStateData<T = unknown>(state: CommandState): T | undefined {
    return this.context[state] as T;
  }

  /**
   * Set data for the current state
   */
  setCurrentStateData(data: unknown): void {
    this.context[this.currentState] = data;
  }

  /**
   * Get all context data
   */
  getContext(): Record<string, unknown> {
    return { ...this.context };
  }

  /**
   * Get the full state history
   */
  getStateHistory(): CommandState[] {
    return [...this.stateHistory];
  }

  /**
   * Reset the state machine to initial state
   */
  reset(): void {
    const initialState = this.stateHistory[0];
    if (!initialState) {
      throw new Error("State machine has no initial state in history");
    }
    this.currentState = initialState;
    this.previousState = null;
    this.context = {};
    this.stateHistory = [this.currentState];
  }
}

/**
 * Factory function to create state machine for server add command
 */
export function createServerAddStateMachine(): InteractiveCommandStateMachine {
  const config: StateConfig = {
    initialState: CommandState.SERVER_SELECTION,
    transitions: [
      // From server selection
      {
        from: CommandState.SERVER_SELECTION,
        to: CommandState.CONFIRMATION,
        trigger: "continue",
      },
      {
        from: CommandState.SERVER_SELECTION,
        to: CommandState.CANCELLED,
        trigger: "escape",
      },
      {
        from: CommandState.SERVER_SELECTION,
        to: CommandState.CANCELLED,
        trigger: "cancel",
      },

      // From confirmation
      {
        from: CommandState.CONFIRMATION,
        to: CommandState.SERVER_SELECTION,
        trigger: "escape",
      },
      {
        from: CommandState.CONFIRMATION,
        to: CommandState.COMPLETED,
        trigger: "continue",
      },
      {
        from: CommandState.CONFIRMATION,
        to: CommandState.CANCELLED,
        trigger: "cancel",
      },
    ],
  };

  return new InteractiveCommandStateMachine(config);
}

/**
 * Factory function to create state machine for server remove command
 */
export function createServerRemoveStateMachine(): InteractiveCommandStateMachine {
  const config: StateConfig = {
    initialState: CommandState.CONFIRMATION,
    transitions: [
      // From confirmation (single step, so escape exits)
      {
        from: CommandState.CONFIRMATION,
        to: CommandState.COMPLETED,
        trigger: "continue",
      },
      {
        from: CommandState.CONFIRMATION,
        to: CommandState.CANCELLED,
        trigger: "escape",
      },
      {
        from: CommandState.CONFIRMATION,
        to: CommandState.CANCELLED,
        trigger: "cancel",
      },
    ],
  };

  return new InteractiveCommandStateMachine(config);
}

/**
 * Factory function to create state machine for registry server add command
 */
export function createRegistryServerAddStateMachine(): InteractiveCommandStateMachine {
  const config: StateConfig = {
    initialState: CommandState.REGISTRY_TYPE_SELECTION,
    transitions: [
      // From registry type selection
      {
        from: CommandState.REGISTRY_TYPE_SELECTION,
        to: CommandState.PACKAGE_INPUT,
        trigger: "continue",
      },
      {
        from: CommandState.REGISTRY_TYPE_SELECTION,
        to: CommandState.CANCELLED,
        trigger: "escape",
      },
      {
        from: CommandState.REGISTRY_TYPE_SELECTION,
        to: CommandState.CANCELLED,
        trigger: "cancel",
      },

      // From package input
      {
        from: CommandState.PACKAGE_INPUT,
        to: CommandState.VERSION_SELECTION,
        trigger: "continue",
      },
      {
        from: CommandState.PACKAGE_INPUT,
        to: CommandState.REGISTRY_TYPE_SELECTION,
        trigger: "escape",
      },
      {
        from: CommandState.PACKAGE_INPUT,
        to: CommandState.CANCELLED,
        trigger: "cancel",
      },

      // From version selection
      {
        from: CommandState.VERSION_SELECTION,
        to: CommandState.CONFIRMATION,
        trigger: "continue",
      },
      {
        from: CommandState.VERSION_SELECTION,
        to: CommandState.PACKAGE_INPUT,
        trigger: "escape",
      },
      {
        from: CommandState.VERSION_SELECTION,
        to: CommandState.CANCELLED,
        trigger: "cancel",
      },

      // From confirmation
      {
        from: CommandState.CONFIRMATION,
        to: CommandState.VERSION_SELECTION,
        trigger: "escape",
      },
      {
        from: CommandState.CONFIRMATION,
        to: CommandState.COMPLETED,
        trigger: "continue",
      },
      {
        from: CommandState.CONFIRMATION,
        to: CommandState.CANCELLED,
        trigger: "cancel",
      },
    ],
  };

  return new InteractiveCommandStateMachine(config);
}
