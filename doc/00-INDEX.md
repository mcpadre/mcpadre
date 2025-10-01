# mcpadre Documentation

Welcome to the mcpadre documentation. This guide will help you understand and use mcpadre to manage your MCP servers with version pinning, sandboxing, and flexible configuration.

## Getting Started

Start here if you're new to mcpadre:

- **[Quick Start Guide](01-QUICK_START.md)** - Get up and running with mcpadre in minutes using Claude Code

## Core Documentation

Essential reading for understanding how mcpadre works:

- **[Core Concepts](02-CONCEPTS.md)** - Understanding hosts, servers, configuration scopes, sandboxing, and version management
- **[Configuration Reference](03-CONFIGURATION.md)** - Complete reference for `mcpadre.yaml` including all configuration options, server types, templating, and merging behavior

## Reference Documentation

Detailed information about specific aspects of mcpadre:

- **[Supported Hosts](20-SUPPORTED_HOSTS.md)** - List of supported MCP host applications and their capabilities
- **[The .mcpadre Directory](21-THE_MCPADRE_DIRECTORY.md)** - Understanding the `.mcpadre/` directory structure, logs, traffic recordings, and server installations

## Quick Links

### By Task

**Setting up mcpadre:**

1. [Quick Start Guide](01-QUICK_START.md) - Initial setup
2. [Configuration Reference](03-CONFIGURATION.md) - Customizing your setup

**Understanding mcpadre:**

1. [Core Concepts](02-CONCEPTS.md) - How mcpadre works
2. [The .mcpadre Directory](21-THE_MCPADRE_DIRECTORY.md) - Where things are stored

**Working with specific features:**

- [Configuration Merging](03-CONFIGURATION.md#configuration-merging) - How user and project configs combine
- [String Templating](03-CONFIGURATION.md#string-templating) - Using variables in configs
- [MCP Server Types](03-CONFIGURATION.md#mcp-server-types) - Python, Node.js, Container, and HTTP servers
- [Sandbox Configuration](03-CONFIGURATION.md#sandbox-configuration) - Restricting filesystem and network access
- [Version Manager Integration](03-CONFIGURATION.md#pythonversionmanager) - Working with asdf/mise

### By Server Type

- [Python Servers](03-CONFIGURATION.md#python-servers) - PyPI packages with uv
- [Node.js Servers](03-CONFIGURATION.md#nodejs-servers) - NPM packages with pnpm
- [Container Servers](03-CONFIGURATION.md#container-servers) - Docker-based servers
- [HTTP Servers](03-CONFIGURATION.md#http-servers) - Remote HTTPS endpoints

### By Host Application

- [Supported Hosts Overview](20-SUPPORTED_HOSTS.md)
- Claude Code, Claude Desktop, Cursor, OpenCode, VS Code, Zed

## Contributing

Found an issue with the documentation? Please report it at the [mcpadre GitHub repository](https://github.com/anthropics/mcpadre).
