// pattern: Functional Core
import { render } from "micromustache";

/**
 * Applies mustache templating to a branded template string and returns a branded output string.
 *
 * @param templateString - A branded template string containing mustache variables
 * @param variables - An object containing variables to substitute in the template
 * @returns A branded output string with template variables resolved
 */
export function applyTemplate<TInput, TOutput>(
  templateString: TInput,
  variables: Record<string, unknown>
): TOutput {
  // Branded types are structurally strings, so we can cast directly
  const rawTemplate = templateString as string;

  // Apply the mustache template
  const resolved = render(rawTemplate, variables);

  // Return the result as a branded output type
  return resolved as TOutput;
}
