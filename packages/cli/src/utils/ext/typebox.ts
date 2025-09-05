import {
  Assert,
  SchemaOptions,
  Static,
  TSchema,
  Type,
} from "@sinclair/typebox";

export type TUnionOneOf<T extends TSchema[]> = T extends [infer L, ...infer R]
  ? Static<Assert<L, TSchema>> | TUnionOneOf<Assert<R, TSchema[]>>
  : never;

export const UnionOneOf = <T extends TSchema[]>(
  oneOf: [...T],
  options: SchemaOptions = {}
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
) => Type.Unsafe<TUnionOneOf<T>>({ ...options, oneOf });
