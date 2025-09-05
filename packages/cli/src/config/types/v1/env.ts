import { brandedString } from "@coderspirit/nominal-typebox";
import { type Static, Type } from "@sinclair/typebox";

import { UnionOneOf } from "../../../utils/ext/typebox.js";

export const EnvStringTemplateV1 = brandedString<"EnvStringTemplate">();
export type EnvStringTemplateV1 = Static<typeof EnvStringTemplateV1>;

export const EnvStringObjectV1 = Type.Object(
  {
    string: EnvStringTemplateV1,
  },
  {
    description:
      "A Mustache template string that is resolved into a literal environment variable at runtime.",
  }
);
export type EnvStringObjectV1 = Static<typeof EnvStringObjectV1>;

export const ENV_SPECIAL_DIRECTORY_NAMES_V1 = [
  "home",
  "config",
  "cache",
  "data",
  "log",
  "temp",
  "workspace",
] as const;
export const EnvSpecialDirectoryNameV1 = Type.Union(
  ENV_SPECIAL_DIRECTORY_NAMES_V1.map(value => Type.Literal(value))
);
export type EnvSpecialDirectoryNameV1 = Static<
  typeof EnvSpecialDirectoryNameV1
>;

export const EnvSpecialDirectoryV1 = Type.Object(
  {
    special: EnvSpecialDirectoryNameV1,
  },
  {
    description:
      "References a specific directory on the system (home, config, cache, data, log, temp, or workspace).",
  }
);
export type EnvSpecialDirectoryV1 = Static<typeof EnvSpecialDirectoryV1>;

export const EnvPassV1 = Type.Object(
  {
    pass: Type.String(),
  },
  {
    description:
      "Passes an environment variable from the parent process to the MCP server.",
  }
);
export type EnvPassV1 = Static<typeof EnvPassV1>;

export const EnvCommandV1 = Type.Object({
  command: Type.String({
    description:
      "A Mustache command that resolves to a command to run at runtime. The stdout from that command will be used as the value of the environment variable.",
  }),
});
export type EnvCommandV1 = Static<typeof EnvCommandV1>;

export const EnvValueV1 = UnionOneOf([
  EnvStringObjectV1,
  EnvStringTemplateV1,
  EnvSpecialDirectoryV1,
  EnvPassV1,
  EnvCommandV1,
]);
export type EnvValueV1 = Static<typeof EnvValueV1>;
