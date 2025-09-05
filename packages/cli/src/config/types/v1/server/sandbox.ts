import { type Static, Type } from "@sinclair/typebox";

import { PathStringTemplate } from "../../utils.js";

export const SandboxOptionsV1 = Type.Object({
  enabled: Type.Boolean({
    description:
      "Enables sandboxing for a given MCP, with default policies if none given. Defaults to true.",
    default: true,
  }),
  networking: Type.Boolean({
    description: "If true, allows networking access from this MCP.",
    default: true,
  }),
  omitSystemPaths: Type.Boolean({
    description:
      "If true, omits default read-only access to system paths (/bin, /usr/lib, etc.) from the sandbox.",
    default: true,
  }),
  omitProjectPath: Type.Boolean({
    description:
      "If true, omits read-only access to the project path from the sandbox.",
    default: true,
  }),
  allowRead: Type.Optional(
    Type.Array(PathStringTemplate, {
      description:
        "The set of paths that this MCP server can read+execute. If omitSystemPaths is true, this will have system paths appended.",
    })
  ),
  allowReadWrite: Type.Optional(
    Type.Array(PathStringTemplate, {
      description:
        "The set of paths that this MCP server can read+write+execute. If omitProjectPath is true, this will have the project path appended.",
    })
  ),
});
export type SandboxOptionsV1 = Static<typeof SandboxOptionsV1>;
