import { brandedString } from "@coderspirit/nominal-typebox";
import { type Static, Type } from "@sinclair/typebox";

import { UnionOneOf } from "../../../../utils/ext/typebox.js";
import { PathStringTemplate } from "../../utils.js";
import { EnvValueV1 } from "../env.js";
import {
  WorkspaceAndServerSharedOptionsV1,
  WorkspaceAndVersionedServerSharedOptionsV1,
} from "../options.js";

import { SandboxOptionsV1 } from "./sandbox.js";

export * from "./sandbox.js";

export const StdioMcpServerV1 = Type.Composite([
  WorkspaceAndVersionedServerSharedOptionsV1,
  Type.Object({
    env: Type.Optional(Type.Record(Type.String(), EnvValueV1)),
    sandbox: Type.Optional(SandboxOptionsV1),
  }),
]);
export type StdioMcpServerV1 = Static<typeof StdioMcpServerV1>;

export const CommandStringTemplate = brandedString<"CommandStringTemplate">();
export type CommandStringTemplate = Static<typeof CommandStringTemplate>;

export const ShellOptionsV1 = Type.Object({
  cwd: Type.Optional(PathStringTemplate),
  command: CommandStringTemplate,
});
export type ShellOptionsV1 = Static<typeof ShellOptionsV1>;

export const ShellMcpServerV1 = Type.Composite([
  StdioMcpServerV1,
  Type.Object({
    shell: ShellOptionsV1,
  }),
]);
export type ShellMcpServerV1 = Static<typeof ShellMcpServerV1>;

export const ContainerVolumeV1 = Type.Object({
  // this is INTENTIONALLY a string
  containerMountPath: Type.String(),
  // if not set, it will be a directory named after the volume key in the server directory
  hostMountPath: Type.Optional(PathStringTemplate),
  readOnly: Type.Optional(Type.Boolean()),
  skipGitignore: Type.Optional(Type.Boolean()),
});
export type ContainerVolumeV1 = Static<typeof ContainerVolumeV1>;

export const ContainerOptionsV1 = Type.Object({
  image: Type.String(),
  tag: Type.String(),
  pullWhenDigestChanges: Type.Optional(Type.Boolean()),
  command: Type.Optional(CommandStringTemplate),
  volumes: Type.Optional(Type.Record(Type.String(), ContainerVolumeV1)),
});
export type ContainerOptionsV1 = Static<typeof ContainerOptionsV1>;

export const ContainerMcpServerV1 = Type.Composite([
  StdioMcpServerV1,
  Type.Object({
    container: ContainerOptionsV1,
  }),
]);
export type ContainerMcpServerV1 = Static<typeof ContainerMcpServerV1>;

export const HttpOptionsV1 = Type.Object({
  url: Type.String(),
  headers: Type.Optional(Type.Record(Type.String(), EnvValueV1)),
});
export type HttpOptionsV1 = Static<typeof HttpOptionsV1>;

export const HttpMcpServerV1 = Type.Composite([
  WorkspaceAndServerSharedOptionsV1,
  Type.Object({
    http: HttpOptionsV1,
  }),
]);
export type HttpMcpServerV1 = Static<typeof HttpMcpServerV1>;

export const PythonOptionsV1 = Type.Object({
  package: Type.String(),
  version: Type.String(),
  pythonVersion: Type.Optional(Type.String()),
  command: Type.Optional(CommandStringTemplate),
});
export type PythonOptionsV1 = Static<typeof PythonOptionsV1>;

export const PythonMcpServerV1 = Type.Composite([
  StdioMcpServerV1,
  Type.Object({
    python: PythonOptionsV1,
  }),
]);
export type PythonMcpServerV1 = Static<typeof PythonMcpServerV1>;

export const NodeOptionsV1 = Type.Object({
  package: Type.String(),
  version: Type.String(),
  nodeVersion: Type.Optional(Type.String()),
  bin: Type.Optional(Type.String()),
  args: Type.Optional(CommandStringTemplate),
});
export type NodeOptionsV1 = Static<typeof NodeOptionsV1>;

export const NodeMcpServerV1 = Type.Composite([
  StdioMcpServerV1,
  Type.Object({
    node: NodeOptionsV1,
  }),
]);
export type NodeMcpServerV1 = Static<typeof NodeMcpServerV1>;

export const McpServerV1 = UnionOneOf([
  ShellMcpServerV1,
  ContainerMcpServerV1,
  HttpMcpServerV1,
  PythonMcpServerV1,
  NodeMcpServerV1,
]);
export type McpServerV1 = Static<typeof McpServerV1>;

// Type guards for server type detection
export function isShellServer(server: McpServerV1): server is ShellMcpServerV1 {
  return "shell" in server;
}

export function isContainerServer(
  server: McpServerV1
): server is ContainerMcpServerV1 {
  return "container" in server;
}

export function isHttpServer(server: McpServerV1): server is HttpMcpServerV1 {
  return "http" in server;
}

export function isPythonServer(
  server: McpServerV1
): server is PythonMcpServerV1 {
  return "python" in server;
}

export function isNodeServer(server: McpServerV1): server is NodeMcpServerV1 {
  return "node" in server;
}
