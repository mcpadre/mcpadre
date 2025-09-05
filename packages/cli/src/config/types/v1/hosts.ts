import { type Static, Type } from "@sinclair/typebox";

export const SUPPORTED_HOSTS_V1 = [
  "claude-code",
  "claude-desktop",
  "cursor",
  "opencode",
  "zed",
  "vscode",
] as const;

export const SupportedHostV1 = Type.Union(
  SUPPORTED_HOSTS_V1.map(value => Type.Literal(value))
);
export type SupportedHostV1 = Static<typeof SupportedHostV1>;

export const HostsV1 = Type.Record(SupportedHostV1, Type.Boolean());
export type HostsV1 = Static<typeof HostsV1>;

export const HOST_CAPABILITIES = ["PROJECT", "USER"] as const;
export type HostCapability = (typeof HOST_CAPABILITIES)[number];

export const HOST_CAPABILITY_MAP: Record<SupportedHostV1, HostCapability[]> = {
  "claude-code": ["PROJECT", "USER"],
  "claude-desktop": ["USER"],
  cursor: ["PROJECT", "USER"],
  opencode: ["PROJECT", "USER"],
  zed: ["PROJECT"],
  vscode: ["PROJECT"],
} as const;

export function isUserCapableHost(host: SupportedHostV1): boolean {
  return HOST_CAPABILITY_MAP[host].includes("USER");
}

export function isProjectCapableHost(host: SupportedHostV1): boolean {
  return HOST_CAPABILITY_MAP[host].includes("PROJECT");
}
