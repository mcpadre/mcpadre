The coding agent should use this file to write tests aligned with our expectations. The `code-reviewer-v1` agent and any other code reviewing agents should use this file to evaluate tests written by the coding agent.

- We use Vitest. If you don't remember how Vitest tests look, go search the web.

- Place Vitest unit tests next to the file in question. foo.ts would have foo.test.ts.

- If in the course of writing tests you encounter surprises that don't match your knowledge, proactively suggest changes to this file. CRITICAL: do not auto-edit this file.

- Don't test trivial things, like CLI handlers. Instead of testing that we parse command line arguments correctly, you will have better results by focusing testing on the stuff that the CLI handlers themselves call.

- Never write tests that invoke mocking over existing functions or data. unless explicitly granted permission to. We will use a dependency injector where we need the ability to change an implementation from underneath your test code.

- Remember to honor @.editorconfig when writing code. Make sure to end files with a newline.
