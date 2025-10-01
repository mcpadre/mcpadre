# `mcpadre`

_the missing parts of MCP management_

**_under considerable construction_**

## What's `mcpadre`?

Obviously, MCPs unlock a lot of value in the LLM ecosystem, but equally as obviously, their release has been pretty half-baked. Nobody has thought very much about version management or security, and I for one don't really want to be downstream of a supply chain attack. The various hosts available right now also all implement MCP configuration in completely different ways. To that end, `mcpadre` exists to answer some of the questions around using MCPs effectively.

- **Easy installation**: easily incorporate MCPs released on NPM, PyPI, or Docker (with golang support in the works).
- **Quick distribution**: MCP developers write an `ADD-THIS-MCP.yaml` file in their repository and `mcpadre` can handle the rest.
- **Simpler, safer secrets**: provides a single, unified way to provide environment variables and command arguments: as literals, from the parent environment, or by calling something like `op` to source them from a vault.
- **Host-independent configuration**: help your teammates pick their tool of choice and still use your standard MCPs.
- **Version pinning across deployment types**: forget `npx -y foo-mcp@latest`; `mcpadre` locks a given MCP to a particular version until you decide to upgrade it.
- **OS-level sandboxing**: control what a given local MCP is allowed to do and see on your computer.
- **Control the whole pipeline**: introspect the request/response traffic between your host and your MCP server and (soon) insert interceptors like [LlamaFirewall](https://meta-llama.github.io/PurpleLlama/LlamaFirewall/) to keep an eye out for bad behavior or prompt injection.

## Getting Started

**[Our documentation](./doc/00-INDEX.md) is a work in progress.** You can start with the [quick start](./doc/01-QUICK_START.md).

You'll need NodeJS (we test against 22.x and follow NodeJS's support calendar; bugs against 20.x are welcome until it reaches EOL) and whatever runtimes for the MCPs you want to use. `mcpadre` is developed using `asdf`, but should generally also be `mise` compatible--untested, but bugs against `mise` will be prioritized. You'll need Docker for containerized MCPs, too. Generally speaking, _`mcpadre` will let you know if it can't source a dependency for you_ (and if it doesn't, that's a bug, let me know!).

## Frequently Asked Questions

### Windows support?

`mcpadre` may work out-of-the-box on Windows; it does have Powershell command paths. However, I don't use Windows for development purposes unless I'm using WSL2 and I just haven't mustered the urge to go set up a Windows machine as necessary to test this. Windows support is a great place for contributions, particularly around testing.

### How does sandboxing work?

**macOS:** We use `sandbox-exec`. Tried using Seatbelt directly, but it's a bit of a bear in NodeJS, and Gemini CLI also uses `sandbox-exec` so I feel like I'm in alright company.

**Linux:** We use `bubblewrap`. seccomp is too scary for me. You will need to install it in order to run sandboxed local-system MCPs.

**Windows:** I'm not aware of any platform-level ways for us to implement the same sandboxing on Windows. Suggestions welcome.

### How's it pronounced?

Model Control Padre. M-C-Padre if you're terse. McPadre is legal only within the city limits of Boston during the evening hours of the 17th of March. Sorry, I don't make the rules, except when I do.
