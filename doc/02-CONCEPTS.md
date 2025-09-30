# mcpadre Concepts & Glossary

This document defines the core concepts and terminology used throughout the mcpadre ecosystem. Understanding these terms is essential for effectively using the CLI and managing your MCP (Model Context Protocol) environment.

## Core Components

### Host Application (Host)

A **Host** is the end-user application that communicates with MCP servers. These are typically code editors or IDEs. `mcpadre` works by generating configuration files specifically for these hosts in `mcpadre install`.

- **Examples**: Visual Studio Code, Cursor, Zed, Claude Desktop.
- **Managed with**: `mcpadre host add`, `mcpadre host manage`

### MCP Server (Server)

A **Server** is a backend process that implements the Model Context Protocol and provides capabilities to a Host. `mcpadre` is responsible for running, configuring, and managing the lifecycle of these servers. We currently support the following options for servers:

- NodeJS-based servers acquired through `npm`
- Python-based servers acquired through `uv`
- Containerized servers managed via `docker`
- Generic shell processes set up and managed by the user

The `mcpadre server` subcommands allow you to work with these servers.

## Configuration Scopes

### Project Configuration

A `mcpadre.yaml` file located in your project's root directory. It defines the servers, hosts, and settings that are specific to that single project. This is the primary and most common way to use `mcpadre`.

`mcpadre init` will create a base project file.

### User Configuration

A global `mcpadre.yaml` file located in a central user directory (e.g., `~/.mcpadre/`). It defines a set of personal, globally-available servers that can be used across all projects on your machine.

`mcpadre init --user` will create a user file. Most commands support `--user` for directly manipulating the user-level configuration.

**Important:** some hosts only support user-level configuration, but others support both user-level and project-level configuration. For example, Claude Code will run user-level MCPs (defined in ~/.claude.json or similar) at all times, but will also run project-level MCPs out of `.mcp.json` if it's found in a directory. Project-specific MCPs generally should take precedence over user-level ones, but that's up to the host.

### Configuration Merging

When you run `mcpadre` from within a project that has its own `mcpadre.yaml`, the tool intelligently merges the **Project Configuration** and the **User Configuration**. This gives you access to both project-specific servers and your global servers simultaneously.

## Key Mechanisms

### MCP shims

When you do `mcpadre install` (or `mcpadre install --user`) the hosts config file is updated to invoke the `mcpadre run` command instead of connecting directly to a server. This allows `mcpadre` to inject its management capabilities (sandboxing, configuration, environment management, logging) before the actual server process starts.

This redirection is established by the `mcpadre install` command, which modifies the Host's settings to use `mcpadre run` as the entry point for all servers.

### Server Lifecycle & Cleanup

When you run `mcpadre install`, the tool analyzes your host configurations and performs cleanup:

- **Orphaned servers**: MCP servers configured to use `mcpadre run` but no longer defined in your `mcpadre.yaml` are automatically removed from host configs
- **Orphaned directories**: Installation directories in `.mcpadre/servers/` for servers that have been removed from configuration may need manual cleanup
- **External servers**: Servers in your host config that don't use `mcpadre run` are left untouched - these can coexist with mcpadre-managed servers

This ensures your host configurations stay synchronized with your `mcpadre` configuration as you add and remove servers.

### Sandboxing

A critical security feature where `mcpadre` uses operating system-level tools (Linux's `bwrap` and macOS's `sandbox-exec`) to create an isolated environment for each MCP server. This restricts what the server can do, such as limiting its access to the file system or network.

Some hosts have this capability as well, but one of the main reasons `mcpadre` exists is that not all of them do.

### Version Pinning & Per-Server Lock Files

Version pinning is the practice of recording the exact versions of all software components to ensure a reproducible environment. `mcpadre` achieves this through **per-server lock files**.

Instead of a single, monolithic lock file for the whole project, `mcpadre` leverages the native dependency management tools of each server's ecosystem. For example, a Python server will have a `uv.lock` and a Node.js server will have a `pnpm-lock.yaml`.

This approach is crucial because it locks not just the server package itself, but its **entire tree of transitive dependencies**. This guarantees that every developer on a team and every CI run uses the exact same underlying code, ensuring maximum reproducibility.
