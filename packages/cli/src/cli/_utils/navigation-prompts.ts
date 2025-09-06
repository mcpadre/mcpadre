// pattern: Functional Core

import {
  createPrompt,
  isEnterKey,
  useKeypress,
  useState,
} from "@inquirer/core";
import { confirm } from "@inquirer/prompts";

/**
 * Custom error class for navigation actions (escape key, back button)
 * This allows proper instanceof checking instead of string matching
 */
export class NavigationError extends Error {
  public readonly action: "back" | "exit";

  constructor(action: "back" | "exit", message?: string) {
    super(message ?? `Navigation action: ${action}`);
    this.name = "NavigationError";
    this.action = action;

    // Maintain proper stack trace for where our error was thrown
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NavigationError);
    }
  }
}

/**
 * Navigation result that indicates what action the user took
 */
export interface NavigationResult<T> {
  action: "back" | "continue" | "exit";
  value?: T;
}

/**
 * Enhanced server selection prompt that supports escape key navigation
 * @param serverNames Available server names to choose from
 * @returns Navigation result with selected servers or navigation action
 */
export async function promptForServerSelectionWithNavigation(
  serverNames: string[]
): Promise<NavigationResult<string[]>> {
  try {
    // Create a custom checkbox-like prompt using @inquirer/core
    const checkboxWithEscape = createPrompt<
      string[],
      {
        message: string;
        choices: { value: string; name: string }[];
        validate?: (selections: string[]) => boolean | string;
      }
    >((config, done) => {
      const [status, setStatus] = useState<"idle" | "done" | "escaped">("idle");
      const [selectedValues, setSelectedValues] = useState<Set<string>>(
        new Set()
      );
      const [activeIndex, setActiveIndex] = useState(0);

      useKeypress(key => {
        if (isEnterKey(key)) {
          const selection = Array.from(selectedValues);

          // Validate selection if validator provided
          if (config.validate) {
            const validationResult = config.validate(selection);
            if (validationResult !== true) {
              // For now, just ignore invalid selections and stay in the prompt
              return;
            }
          }

          setStatus("done");
          done(selection);
        } else if (key.name === "escape") {
          setStatus("escaped");
          // Don't call done(), let the main logic handle it
        } else if (key.name === "space") {
          const currentChoice = config.choices[activeIndex];
          if (currentChoice) {
            const newSelectedValues = new Set(selectedValues);
            if (newSelectedValues.has(currentChoice.value)) {
              newSelectedValues.delete(currentChoice.value);
            } else {
              newSelectedValues.add(currentChoice.value);
            }
            setSelectedValues(newSelectedValues);
          }
        } else if (key.name === "up") {
          const newIndex =
            activeIndex > 0 ? activeIndex - 1 : config.choices.length - 1;
          setActiveIndex(newIndex);
        } else if (key.name === "down") {
          const newIndex =
            activeIndex < config.choices.length - 1 ? activeIndex + 1 : 0;
          setActiveIndex(newIndex);
        }
      });

      // Handle escape state outside of keypress callback
      if (status === "escaped") {
        throw new NavigationError("exit");
      }

      const prefix = status === "done" ? "✔" : "?";
      let message = `${prefix} ${config.message}`;

      if (status === "idle") {
        message += `\n  (Use arrow keys, <space> to select, <enter> to confirm, <esc> to exit)`;

        // Show choices
        config.choices.forEach((choice, index) => {
          const isActive = index === activeIndex;
          const isSelected = selectedValues.has(choice.value);

          const checkbox = isSelected ? "◉" : "◯";
          const activeIndicator = isActive ? "❯ " : "  ";

          message += `\n${activeIndicator}${checkbox} ${choice.name}`;
        });
      } else {
        // status === "done"
        const selectedNames = config.choices
          .filter(choice => selectedValues.has(choice.value))
          .map(choice => choice.name);
        message += ` ${selectedNames.join(", ")}`;
      }

      return message;
    });

    const selectedServers = await checkboxWithEscape({
      message: "Which servers would you like to add?",
      choices: serverNames.map(name => ({
        value: name,
        name,
      })),
      validate: (selections: string[]) => {
        if (selections.length === 0) {
          return "Please select at least one server";
        }
        return true;
      },
    });

    return {
      action: "continue",
      value: selectedServers,
    };
  } catch (error) {
    // Handle our custom navigation errors
    if (error instanceof NavigationError) {
      return { action: error.action };
    }

    // Handle Inquirer cancellation (Ctrl+C)
    if (
      error instanceof Error &&
      (error.message.includes("User force closed the prompt") ||
        error.message.includes("force closed"))
    ) {
      return { action: "exit" };
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Enhanced confirmation prompt that supports escape key navigation
 * @param message The confirmation message to display
 * @param canGoBack Whether the escape key should go back or exit
 * @returns Navigation result with confirmation or navigation action
 */
export async function promptForConfirmationWithNavigation(
  message: string,
  canGoBack = false
): Promise<NavigationResult<boolean>> {
  const escapeHint = canGoBack
    ? "(Press <esc> to go back, <ctrl+c> to cancel)"
    : "(Press <esc> to cancel, <ctrl+c> to cancel)";

  try {
    const confirmed = await confirm({
      message: `${message} ${escapeHint}`,
      default: false,
    });

    return {
      action: "continue",
      value: confirmed,
    };
  } catch (error) {
    // Handle user cancellation (Ctrl+C or Escape)
    if (
      error instanceof Error &&
      (error.message.includes("User force closed the prompt") ||
        error.message.includes("force closed"))
    ) {
      return { action: canGoBack ? "back" : "exit" };
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Custom confirmation prompt with explicit escape key handling
 * This creates a custom prompt that can distinguish between Ctrl+C and Escape
 */
export const confirmWithEscapeHandling = createPrompt<
  boolean,
  { message: string; default?: boolean; canGoBack?: boolean }
>((config, done) => {
  const [status, setStatus] = useState<"idle" | "done">("idle");
  const [value, setValue] = useState(config.default ?? false);

  const canGoBack = config.canGoBack ?? false;
  const escapeHint = canGoBack
    ? "(y/n, <esc> to go back, <ctrl+c> to cancel)"
    : "(y/n, <esc> to cancel, <ctrl+c> to cancel)";

  useKeypress(key => {
    if (isEnterKey(key)) {
      setStatus("done");
      done(value);
    } else if (key.name === "escape") {
      setStatus("done");
      // Throw a NavigationError that we can catch with instanceof
      const action = canGoBack ? "back" : "exit";
      throw new NavigationError(action);
    } else if (key.name === "y") {
      setValue(true);
    } else if (key.name === "n") {
      setValue(false);
    }
  });

  const prefix = status === "done" ? "✔" : "?";
  const answer = status === "done" ? (value ? "yes" : "no") : "";
  const defaultValue =
    config.default !== undefined
      ? config.default
        ? " (Y/n)"
        : " (y/N)"
      : " (y/n)";

  let message = `${prefix} ${config.message}${status === "idle" ? defaultValue : ""} ${answer}`;

  if (status === "idle") {
    message += `\n  ${escapeHint}`;
  }

  return message;
});

/**
 * Enhanced confirmation prompt using custom escape handling
 */
export async function promptForConfirmationWithEscapeHandling(
  message: string,
  canGoBack = false,
  defaultValue?: boolean
): Promise<NavigationResult<boolean>> {
  try {
    const config: Parameters<typeof confirmWithEscapeHandling>[0] = {
      message,
      canGoBack,
    };

    if (defaultValue !== undefined) {
      config.default = defaultValue;
    }

    const confirmed = await confirmWithEscapeHandling(config);

    return {
      action: "continue",
      value: confirmed,
    };
  } catch (error) {
    // Handle our custom navigation errors
    if (error instanceof NavigationError) {
      return { action: error.action };
    }

    // Handle Inquirer cancellation (Ctrl+C)
    if (
      error instanceof Error &&
      (error.message.includes("User force closed the prompt") ||
        error.message.includes("force closed"))
    ) {
      return { action: "exit" };
    }

    // Re-throw other errors
    throw error;
  }
}
