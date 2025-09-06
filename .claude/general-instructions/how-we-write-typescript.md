@.claude/general-instructions/how-to-write-tests.md

- When writing TypeScript, make sure all imports are collected at the top of the file.
- ALWAYS name a caught error `err`, e.g. `catch (err)`, unless it's nested.
- Pino expands `err` variables with an `Error` serializer, so always pass errors to our Pino loggers with the `err` key.
- When we use Typebox, it is idiomatic to have the TSchema object and the Static<typeof ThatObject> share an identifier.
- Prefer functions over classes, EXCEPT in the case of objects registered in a dependency injector (where the class becomes a holder for the dependencies).
  - The important behaviors of an object registered to the dependency injector should still be factored into functions for easier unit testing.
- Prefer composition over inheritance.
- Prefer `type` over `interface`, EXCEPT when a third-party library requires you to `extends` an `interface`.
- All types intended to go between bounded contexts should be defined using Typebox.
- All files should be named with `spine-case.ts`.
