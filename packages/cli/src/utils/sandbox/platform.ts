// pattern: Functional Core
// Platform detection utilities for determining which sandbox implementation to use.
// Pure functions that examine the runtime environment without side effects.

import { SandboxPlatform } from "./types.js";

export { SandboxPlatform };

/**
 * Detect the current platform for sandbox selection
 */
export function getPlatform(): SandboxPlatform {
  switch (process.platform) {
    case "linux":
      return SandboxPlatform.Linux;
    case "darwin":
      return SandboxPlatform.MacOS;
    case "win32":
      return SandboxPlatform.Windows;
    default:
      return SandboxPlatform.Unknown;
  }
}

/**
 * Check if sandboxing is supported on the current platform
 */
export function isSandboxSupported(): boolean {
  const platform = getPlatform();
  return (
    platform === SandboxPlatform.Linux || platform === SandboxPlatform.MacOS
  );
}

/**
 * Get the expected sandbox binary name for the current platform
 */
export function getSandboxBinary(): string | null {
  const platform = getPlatform();
  switch (platform) {
    case SandboxPlatform.Linux:
      return "bwrap";
    case SandboxPlatform.MacOS:
      return "sandbox-exec";
    default:
      return null;
  }
}

/**
 * Get default system paths for the current platform
 * These are commonly needed paths for basic command execution
 */
export function getDefaultSystemPaths(): string[] {
  const platform = getPlatform();

  switch (platform) {
    case SandboxPlatform.Linux:
      return [
        "/usr",
        "/bin",
        "/sbin",
        "/lib",
        "/lib32",
        "/lib64",
        "/etc/alternatives",
        "/etc/ld.so.cache",
        "/etc/ld.so.conf",
        "/etc/ld.so.conf.d",
      ];

    case SandboxPlatform.MacOS:
      return [
        "/usr/bin",
        "/usr/sbin",
        "/usr/lib",
        "/usr/libexec",
        "/System",
        "/bin",
        "/sbin",
        "/var/select",
      ];

    default:
      return [];
  }
}

/**
 * Get paths required for network functionality
 */
export function getNetworkPaths(): string[] {
  const platform = getPlatform();

  switch (platform) {
    case SandboxPlatform.Linux:
      return [
        "/etc/resolv.conf",
        "/etc/hosts",
        "/etc/nsswitch.conf",
        "/etc/gai.conf",
      ];

    case SandboxPlatform.MacOS:
      // macOS handles networking differently through sandbox-exec policies
      return [];

    default:
      return [];
  }
}
