// pattern: Functional Core
import { brandedString } from "@coderspirit/nominal-typebox";
import { type Static } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";

import { applyTemplate } from "./index.js";

// Test-specific branded types
const TestTemplateString = brandedString<"TestTemplateString">();
type TestTemplateString = Static<typeof TestTemplateString>;

const TestOutputString = brandedString<"TestOutputString">();
type TestOutputString = Static<typeof TestOutputString>;

describe("applyTemplate", () => {
  it("should apply basic variable substitution", () => {
    const template = "Hello {{name}}!" as TestTemplateString;
    const variables = { name: "World" };

    const result = applyTemplate<TestTemplateString, TestOutputString>(
      template,
      variables
    );

    expect(result as string).toBe("Hello World!");
  });

  it("should handle nested object properties", () => {
    const template =
      "User: {{user.name}}, Age: {{user.age}}" as TestTemplateString;
    const variables = {
      user: {
        name: "Alice",
        age: 30,
      },
    };

    const result = applyTemplate<TestTemplateString, TestOutputString>(
      template,
      variables
    );

    expect(result as string).toBe("User: Alice, Age: 30");
  });

  it("should handle templates with no variables", () => {
    const template = "Static text" as TestTemplateString;
    const variables = {};

    const result = applyTemplate<TestTemplateString, TestOutputString>(
      template,
      variables
    );

    expect(result as string).toBe("Static text");
  });

  it("should preserve branding through the templating process", () => {
    const template = "Test {{value}}" as TestTemplateString;
    const variables = { value: "branded" };

    const result = applyTemplate<TestTemplateString, TestOutputString>(
      template,
      variables
    );

    // The result should be branded as TestOutputString
    expect(typeof result).toBe("string");
    expect(result as string).toBe("Test branded");
  });
});
