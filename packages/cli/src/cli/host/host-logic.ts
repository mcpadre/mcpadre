// pattern: Functional Core

import {
  isProjectCapableHost,
  isUserCapableHost,
  SUPPORTED_HOSTS_V1,
  type SupportedHostV1,
} from "../../config/types/v1/hosts.js";

import type {
  SettingsProject,
  SettingsUser,
} from "../../config/types/index.js";

/**
 * Validates that a host name is supported
 * @param hostName The host name to validate
 * @returns True if the host is supported
 */
export function isValidHost(hostName: string): hostName is SupportedHostV1 {
  return (SUPPORTED_HOSTS_V1 as readonly string[]).includes(hostName);
}

/**
 * Gets suggestions for similar host names when an invalid host is provided
 * @param hostName Invalid host name
 * @returns Array of similar host names
 */
export function getSimilarHosts(hostName: string): string[] {
  const lowerInput = hostName.toLowerCase();
  return SUPPORTED_HOSTS_V1.filter(
    (host: string) =>
      host.includes(lowerInput) ||
      lowerInput.includes(host) ||
      levenshteinDistance(host, lowerInput) <= 2
  );
}

/**
 * Simple distance implementation for fuzzy matching
 */
function levenshteinDistance(str1: string, str2: string): number {
  // Simple character-by-character comparison for fuzzy matching
  // This is less precise than true Levenshtein distance but sufficient for our use case
  if (str1 === str2) return 0;
  if (str1.length === 0) return str2.length;
  if (str2.length === 0) return str1.length;

  const lengthDiff = Math.abs(str1.length - str2.length);
  let commonChars = 0;

  // Count common characters in similar positions
  const minLength = Math.min(str1.length, str2.length);
  for (let i = 0; i < minLength; i++) {
    if (str1[i] === str2[i]) {
      commonChars++;
    }
  }

  // Return a rough distance based on length difference and common characters
  return lengthDiff + (minLength - commonChars);
}

/**
 * Adds a host to the project or user configuration
 * @param config Existing configuration
 * @param hostName Host to add
 * @returns Updated configuration
 */
export function addHostToConfig(
  config: SettingsProject,
  hostName: SupportedHostV1
): SettingsProject;
export function addHostToConfig(
  config: SettingsUser,
  hostName: SupportedHostV1
): SettingsUser;
export function addHostToConfig(
  config: SettingsProject | SettingsUser,
  hostName: SupportedHostV1
): SettingsProject | SettingsUser {
  const hosts = config.hosts ?? {};
  return {
    ...config,
    hosts: {
      ...hosts,
      [hostName]: true,
    },
  };
}

/**
 * Removes a host from the project or user configuration
 * @param config Existing configuration
 * @param hostName Host to remove
 * @returns Updated configuration
 */
export function removeHostFromConfig(
  config: SettingsProject,
  hostName: SupportedHostV1
): SettingsProject;
export function removeHostFromConfig(
  config: SettingsUser,
  hostName: SupportedHostV1
): SettingsUser;
export function removeHostFromConfig(
  config: SettingsProject | SettingsUser,
  hostName: SupportedHostV1
): SettingsProject | SettingsUser {
  if (!config.hosts || !(hostName in config.hosts)) {
    // Host not present, return unchanged
    return config;
  }

  const { [hostName]: _, ...remainingHosts } = config.hosts as Record<
    string,
    boolean | undefined
  >;

  // If no hosts remain, remove the hosts field entirely
  if (Object.keys(remainingHosts).length === 0) {
    const { hosts: _hosts, ...configWithoutHosts } = config;
    return configWithoutHosts;
  }

  return {
    ...config,
    hosts: remainingHosts,
  };
}

/**
 * Checks if a host is currently enabled in the project or user configuration
 * @param config Configuration to check
 * @param hostName Host to check
 * @returns True if the host is enabled
 */
export function isHostEnabled(
  config: SettingsProject | SettingsUser,
  hostName: SupportedHostV1
): boolean {
  return (
    (config.hosts as Record<string, boolean | undefined> | undefined)?.[
      hostName
    ] === true
  );
}

/**
 * Gets all hosts that are capable of user configurations
 * @returns Array of user-capable hosts
 */
export function getUserCapableHosts(): SupportedHostV1[] {
  return SUPPORTED_HOSTS_V1.filter(isUserCapableHost);
}

/**
 * Gets all hosts that are capable of project configurations
 * @returns Array of project-capable hosts
 */
export function getProjectCapableHosts(): SupportedHostV1[] {
  return SUPPORTED_HOSTS_V1.filter(isProjectCapableHost);
}
