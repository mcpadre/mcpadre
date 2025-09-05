// pattern: Functional Core

import { Scalar } from "yaml";

/**
 * Deep clones an object and forces version-related strings to be quoted in YAML output
 * This ensures that version strings like "0.1.1", pythonVersion like "3.13.6",
 * nodeVersion like "18.20.0", and semver-like Docker tags like "1.2.3" are properly quoted
 * instead of being treated as numeric tokens by syntax highlighters
 *
 * @param obj Object to process
 * @returns Processed object with version-related strings as quoted YAML scalars
 */
export function forceQuoteVersionStrings(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null) return obj;

  if (Array.isArray(obj)) {
    return obj.map(forceQuoteVersionStrings);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (
      (key === "version" || key === "pythonVersion" || key === "nodeVersion") &&
      typeof value === "string" &&
      /^\d+\.\d+/.test(value)
    ) {
      // Create a YAML scalar node that forces double quotes for version fields
      const scalar = new Scalar(value);
      scalar.type = Scalar.QUOTE_DOUBLE;
      result[key] = scalar;
    } else if (
      key === "tag" &&
      typeof value === "string" &&
      /^\d+\.\d+/.test(value)
    ) {
      // Create a YAML scalar node that forces double quotes for semver-like Docker tags
      const scalar = new Scalar(value);
      scalar.type = Scalar.QUOTE_DOUBLE;
      result[key] = scalar;
    } else if (typeof value === "object") {
      result[key] = forceQuoteVersionStrings(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
