// pattern: Functional Core

import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  useKeypress,
  usePagination,
  usePrefix,
  useState,
} from "@inquirer/core";

import {
  getProjectCapableHosts,
  getUserCapableHosts,
  isHostEnabled,
} from "../cli/host/host-logic.js";
import { type SupportedHostV1 } from "../config/types/v1/hosts.js";

import { isInteractiveEnvironment } from "./interactive-prompts.js";

import type { SettingsProject, SettingsUser } from "../config/types/index.js";

/**
 * Host display names for user-friendly interface
 */
const HOST_DISPLAY_NAMES: Record<SupportedHostV1, string> = {
  "claude-code": "Claude Code",
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  opencode: "opencode",
  zed: "Zed",
  vscode: "Visual Studio Code",
};

/**
 * Configuration for multi-host toggle component
 */
export interface MultiHostToggleConfig {
  /** Message to display above the checkbox list */
  message: string;
  /** Help text to display below the message */
  helpText?: string;
  /** Whether at least one host must be selected */
  requireAtLeastOne?: boolean;
  /** Custom validation function */
  validate?: (selected: SupportedHostV1[]) => boolean | string;
  /** Whether this is for user mode (filters available hosts) */
  isUserMode?: boolean;
}

/**
 * Result of multi-host toggle interaction
 */
export interface MultiHostToggleResult {
  /** User cancelled the interaction */
  cancelled: boolean;
  /** Selected hosts (empty if cancelled) */
  selectedHosts: SupportedHostV1[];
  /** Hosts that were enabled/disabled (empty if cancelled) */
  changes: {
    enabled: SupportedHostV1[];
    disabled: SupportedHostV1[];
  };
}

/**
 * Error thrown when user cancels the prompt with escape key
 */
export class EscapeCancelError extends Error {
  constructor() {
    super("User cancelled with escape key");
    this.name = "EscapeCancelError";
  }
}

/**
 * Escape-aware checkbox prompt using @inquirer/core
 * This is a simple implementation that supports escape key cancellation
 */
async function escapeAwareCheckbox(
  message: string,
  choices: { value: SupportedHostV1; name: string; checked: boolean }[],
  validate?: (selected: SupportedHostV1[]) => boolean | string
): Promise<SupportedHostV1[]> {
  return new Promise((resolve, reject) => {
    const prompt = createPrompt<
      SupportedHostV1[],
      {
        message: string;
        choices: {
          value: SupportedHostV1;
          name: string;
          checked: boolean;
        }[];
      }
    >((config, done) => {
      const [active, setActive] = useState(0);
      const [selected, setSelected] = useState<Record<string, boolean>>(() =>
        config.choices.reduce(
          (acc, choice) => {
            acc[choice.value] = choice.checked;
            return acc;
          },
          {} as Record<string, boolean>
        )
      );

      const prefix = usePrefix({ status: "idle" });

      useKeypress(key => {
        if (key.name === "escape") {
          reject(new EscapeCancelError());
          return;
        }

        if (isEnterKey(key)) {
          const selectedHosts = config.choices
            .filter(choice => selected[choice.value])
            .map(choice => choice.value);

          if (validate) {
            const result = validate(selectedHosts);
            if (result !== true) {
              return; // Don't close if validation fails
            }
          }

          done(selectedHosts);
          return;
        }

        if (isSpaceKey(key)) {
          const activeChoice = config.choices[active];
          if (activeChoice) {
            setSelected({
              ...selected,
              [activeChoice.value]: !selected[activeChoice.value],
            });
          }
          return;
        }

        if (isUpKey(key)) {
          setActive(
            (active - 1 + config.choices.length) % config.choices.length
          );
          return;
        }

        if (isDownKey(key)) {
          setActive((active + 1) % config.choices.length);
          return;
        }
      });

      const page = usePagination({
        items: config.choices,
        active,
        renderItem: ({ item, isActive }) => {
          const choice = item as {
            value: SupportedHostV1;
            name: string;
            checked: boolean;
          };
          const checkbox = selected[choice.value] ? "◉" : "◯";
          const cursor = isActive ? "❯" : " ";
          const style = isActive ? "\x1b[36m" : ""; // Cyan for active
          const reset = isActive ? "\x1b[0m" : "";
          return `${style}${cursor} ${checkbox} ${choice.name}${reset}`;
        },
        pageSize: 7,
        loop: true,
      });

      return `${prefix} ${config.message}\n  Press space to select, enter to confirm, escape to cancel\n${page}`;
    });

    prompt({ message, choices }).then(resolve).catch(reject);
  });
}

/**
 * Interactive multi-host toggle component
 *
 * Displays checkboxes for all supported hosts with current enabled status.
 * Returns the new selection and what changed.
 */
export async function promptMultiHostToggle(
  currentConfig: SettingsProject | SettingsUser,
  config: MultiHostToggleConfig
): Promise<MultiHostToggleResult> {
  if (!isInteractiveEnvironment()) {
    throw new Error("Cannot prompt for input in non-interactive environment");
  }

  // Filter hosts based on user/project mode
  const availableHosts = config.isUserMode
    ? getUserCapableHosts()
    : getProjectCapableHosts();

  // Build choices with current enabled status
  const choices = availableHosts.map(hostId => ({
    value: hostId,
    name: HOST_DISPLAY_NAMES[hostId],
    checked: isHostEnabled(currentConfig, hostId),
  }));

  const currentlyEnabled = availableHosts.filter(hostId =>
    isHostEnabled(currentConfig, hostId)
  );

  try {
    let message = config.message;
    if (config.helpText) {
      message += `\n${config.helpText}`;
    }

    const selectedHosts = await escapeAwareCheckbox(
      message,
      choices,
      (selectedValues: SupportedHostV1[]) => {
        // Apply custom validation first
        if (config.validate) {
          const result = config.validate(selectedValues);
          if (result !== true) {
            return typeof result === "string" ? result : "Invalid selection";
          }
        }

        // Apply require at least one constraint
        if (config.requireAtLeastOne && selectedValues.length === 0) {
          return "Please select at least one host";
        }

        return true;
      }
    );

    // Calculate what changed
    const newlyEnabled = selectedHosts.filter(
      host => !currentlyEnabled.includes(host)
    );
    const newlyDisabled = currentlyEnabled.filter(
      host => !selectedHosts.includes(host)
    );

    return {
      cancelled: false,
      selectedHosts,
      changes: {
        enabled: newlyEnabled,
        disabled: newlyDisabled,
      },
    };
  } catch (error) {
    // Handle user cancellation (Ctrl+C, Escape, etc.)
    if (
      error instanceof EscapeCancelError ||
      (error instanceof Error &&
        (error.message.includes("User force closed the prompt") ||
          error.message.includes("force closed") ||
          error.name === "ExitPromptError"))
    ) {
      return {
        cancelled: true,
        selectedHosts: [],
        changes: { enabled: [], disabled: [] },
      };
    }

    throw error;
  }
}

/**
 * Apply multi-host toggle result to configuration
 */
export function applyHostChanges(
  config: SettingsProject | SettingsUser,
  changes: MultiHostToggleResult["changes"]
): SettingsProject | SettingsUser {
  let updatedConfig = { ...config };

  // Enable newly selected hosts
  for (const host of changes.enabled) {
    const hosts = updatedConfig.hosts ?? {};
    updatedConfig = {
      ...updatedConfig,
      hosts: {
        ...hosts,
        [host]: true,
      },
    };
  }

  // Disable unselected hosts
  for (const host of changes.disabled) {
    if (!updatedConfig.hosts || !(host in updatedConfig.hosts)) {
      continue; // Host not present, skip
    }

    const { [host]: _, ...remainingHosts } = updatedConfig.hosts as Record<
      string,
      boolean | undefined
    >;

    // If no hosts remain, remove the hosts field entirely
    if (Object.keys(remainingHosts).length === 0) {
      const { hosts: _hosts, ...configWithoutHosts } = updatedConfig;
      updatedConfig = configWithoutHosts;
    } else {
      updatedConfig = {
        ...updatedConfig,
        hosts: remainingHosts,
      };
    }
  }

  return updatedConfig;
}

/**
 * Get enabled hosts from configuration as display-friendly list
 */
export function getEnabledHostsDisplay(
  config: SettingsProject | SettingsUser,
  isUserMode = false
): string[] {
  // Filter hosts based on user/project mode
  const availableHosts = isUserMode
    ? getUserCapableHosts()
    : getProjectCapableHosts();

  return availableHosts
    .filter(hostId => isHostEnabled(config, hostId))
    .map(hostId => HOST_DISPLAY_NAMES[hostId]);
}

/**
 * Get all supported hosts as display-friendly list
 */
export function getAllHostsDisplay(isUserMode = false): string[] {
  const availableHosts = isUserMode
    ? getUserCapableHosts()
    : getProjectCapableHosts();

  return availableHosts.map(hostId => HOST_DISPLAY_NAMES[hostId]);
}
