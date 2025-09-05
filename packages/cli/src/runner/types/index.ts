// pattern: Functional Core
import { brandedString } from "@coderspirit/nominal-typebox";
import { type Static } from "@sinclair/typebox";

// Branded output types for processed template strings
export const EnvString = brandedString<"EnvString">({
  description: "A resolved environment variable string from a template.",
});
export type EnvString = Static<typeof EnvString>;

export const PathString = brandedString<"PathString">({
  description: "A resolved path string from a template.",
});
export type PathString = Static<typeof PathString>;

export const CommandString = brandedString<"CommandString">({
  description: "A resolved command string from a template.",
});
export type CommandString = Static<typeof CommandString>;

export const ResolvedPath = brandedString<"ResolvedPath">({
  description: "A resolved directory path from the system.",
});
export type ResolvedPath = Static<typeof ResolvedPath>;

export const ResolvedEnvVar = brandedString<"ResolvedEnvVar">({
  description: "A resolved environment variable value ready for use.",
});
export type ResolvedEnvVar = Static<typeof ResolvedEnvVar>;

export const ResolvedCommand = brandedString<"ResolvedCommand">({
  description: "A resolved command string ready for execution.",
});
export type ResolvedCommand = Static<typeof ResolvedCommand>;

/**
 * A resolved command with separated command and arguments
 */
export interface ResolvedCommandParts {
  command: string;
  args: string[];
}
