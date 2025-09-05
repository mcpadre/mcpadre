// Test setup utilities for outdated detection tests

import pino from "pino";

// Create a test logger that doesn't output anything
export const testLogger = pino({
  level: "silent",
});
