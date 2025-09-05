import { brandedString } from "@coderspirit/nominal-typebox";
import { type Static } from "@sinclair/typebox";

export const PathStringTemplate = brandedString<"PathStringTemplate">({
  description:
    "A Mustache template string that is resolved into a literal path at runtime.",
});
export type PathStringTemplate = Static<typeof PathStringTemplate>;
