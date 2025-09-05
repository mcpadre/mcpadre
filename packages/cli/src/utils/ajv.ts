// pattern: Functional Core
import Ajv from "ajv";
import addErrors from "ajv-errors";
import addFormats from "ajv-formats";

// Create singleton AJV instance configured for TypeBox schemas
const ajv = new Ajv({
  // Ignore TypeBox's custom attributes (Symbol keys)
  strict: false,
  // Enable schema compilation caching
  code: { optimize: true },
  // Allow custom keywords
  allowUnionTypes: true,
  // Required for ajv-errors
  allErrors: true,
});

// Add format validation support
addFormats(ajv, [
  "date-time",
  "time",
  "date",
  "email",
  "hostname",
  "ipv4",
  "ipv6",
  "uri",
  "uri-reference",
  "uuid",
  "uri-template",
  "json-pointer",
  "relative-json-pointer",
  "regex",
]);

// Add enhanced error messages
addErrors(ajv);

export { ajv };
