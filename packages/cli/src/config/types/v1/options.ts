import { type Static, Type } from "@sinclair/typebox";

import { PathStringTemplate } from "../utils.js";

export const WorkspaceAndServerSharedOptionsV1 = Type.Object({
  logMcpTraffic: Type.Optional(Type.Boolean()),
});
export type WorkspaceAndServerSharedOptionsV1 = Static<
  typeof WorkspaceAndServerSharedOptionsV1
>;

export const WorkspaceAndStdioServerSharedOptionsV1 = Type.Object({
  installImplicitlyUpgradesChangedPackages: Type.Optional(Type.Boolean()),
});
export type WorkspaceAndStdioServerSharedOptionsV1 = Static<
  typeof WorkspaceAndStdioServerSharedOptionsV1
>;

export const WorkspaceAndVersionedServerSharedOptionsV1 = Type.Composite([
  WorkspaceAndServerSharedOptionsV1,
  WorkspaceAndStdioServerSharedOptionsV1,
]);
export type WorkspaceAndVersionedServerSharedOptionsV1 = Static<
  typeof WorkspaceAndVersionedServerSharedOptionsV1
>;


// Define the union type for Python version managers
export const PythonVersionManagerV1 = Type.Union(
  [
    Type.Literal("auto"),
    Type.Literal("none"),
    Type.Literal("asdf"),
    Type.Literal("mise"),
  ],
  {
    description:
      "The Python version manager to use. 'auto' (default) detects asdf/mise, 'none' disables, or specify one.",
    default: "auto",
  },
);
export type PythonVersionManagerV1 = Static<typeof PythonVersionManagerV1>;

// Define the union type for Node version managers
// Although it's the same as Python for now, we keep it separate
// to allow for future additions like 'nvm'.
export const NodeVersionManagerV1 = Type.Union(
  [
    Type.Literal("auto"),
    Type.Literal("none"),
    Type.Literal("asdf"),
    Type.Literal("mise"),
  ],
  {
    description:
      "The Node.js version manager to use. 'auto' (default) detects asdf/mise, 'none' disables, or specify one.",
    default: "auto",
  },
);
export type NodeVersionManagerV1 = Static<typeof NodeVersionManagerV1>;

export const BaseOptionsV1 = Type.Composite([
  WorkspaceAndServerSharedOptionsV1,
  WorkspaceAndStdioServerSharedOptionsV1,
  Type.Object({
    pythonVersionManager: Type.Optional(PythonVersionManagerV1),
    nodeVersionManager: Type.Optional(NodeVersionManagerV1),
  }),
]);
export type BaseOptionsV1 = Static<typeof BaseOptionsV1>;

export const ProjectOptionsV1 = Type.Composite([
  BaseOptionsV1,
  Type.Object({
    skipGitignoreOnInstall: Type.Optional(Type.Boolean()),
    disableAllSandboxes: Type.Optional(
      Type.Boolean({
        description:
          "If true, disables sandboxing for all servers regardless of individual sandbox.enabled settings",
      })
    ),
    extraAllowRead: Type.Optional(
      Type.Array(PathStringTemplate, {
        description:
          "Additional paths that all servers can read+execute, merged with each server's allowRead list",
      })
    ),
    extraAllowWrite: Type.Optional(
      Type.Array(PathStringTemplate, {
        description:
          "Additional paths that all servers can read+write+execute, merged with each server's allowReadWrite list",
      })
    ),
  }),
]);
export type ProjectOptionsV1 = Static<typeof ProjectOptionsV1>;

export const UserOptionsV1 = Type.Composite([
  BaseOptionsV1,
  Type.Object({
    extraAllowRead: Type.Optional(
      Type.Array(PathStringTemplate, {
        description:
          "Additional paths that all servers can read+execute, merged with each server's allowRead list",
      })
    ),
    extraAllowWrite: Type.Optional(
      Type.Array(PathStringTemplate, {
        description:
          "Additional paths that all servers can read+write+execute, merged with each server's allowReadWrite list",
      })
    ),
  }),
]);
export type UserOptionsV1 = Static<typeof UserOptionsV1>;
