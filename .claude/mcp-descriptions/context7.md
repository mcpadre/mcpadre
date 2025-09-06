Context7 maintains a database of library documentation for popular open-source and third-party libraries. It is the `context7` MCP server.

Use Context7 when the user requests code examples, setup or configuration steps, or library/API documentation.

Context7 MCP provides the following tools that LLMs can use:

- `resolve-library-id`: Resolves a general library name into a Context7-compatible library ID.
  - `libraryName` (required): The name of the library to search for

- `get-library-docs`: Fetches documentation for a library using a Context7-compatible library ID.
  - `context7CompatibleLibraryID` (required): Exact Context7-compatible library ID (e.g., `/mongodb/docs`, `/vercel/next.js`)
  - `topic` (optional): Focus the docs on a specific topic (e.g., "routing", "hooks")
  - `tokens` (optional, default 10000): Max number of tokens to return. Values less than the default value of 10000 are automatically increased to 10000.
