import { type Static, Type } from "@sinclair/typebox";

import { McpServerV1 } from "./server/index.js";
import { EnvValueV1 } from "./env.js";
import { SupportedHostV1 } from "./hosts.js";
import { ProjectOptionsV1, UserOptionsV1 } from "./options.js";

export * from "./env.js";
export * from "./hosts.js";
export * from "./options.js";
export * from "./server/index.js";

// version will become required in v2
export const ServerSpecV1 = Type.Object({
  version: Type.Optional(Type.Literal(1)),
  mcpServers: Type.Record(Type.String(), McpServerV1),
});
export type ServerSpecV1 = Static<typeof ServerSpecV1>;

export const SettingsBaseV1 = Type.Composite([
  ServerSpecV1,
  Type.Object({
    version: Type.Literal(1),
    env: Type.Optional(Type.Record(Type.String(), EnvValueV1)),

    hosts: Type.Optional(
      Type.Record(SupportedHostV1, Type.Optional(Type.Boolean()))
    ),
  }),
]);
export type SettingsBaseV1 = Static<typeof SettingsBaseV1>;

export const SettingsUserV1 = Type.Composite([
  SettingsBaseV1,
  Type.Object({
    options: Type.Optional(UserOptionsV1),
  }),
]);
export type SettingsUserV1 = Static<typeof SettingsUserV1>;

export const SettingsProjectV1 = Type.Composite([
  SettingsBaseV1,
  Type.Object({
    options: Type.Optional(ProjectOptionsV1),
  }),
]);
export type SettingsProjectV1 = Static<typeof SettingsProjectV1>;
