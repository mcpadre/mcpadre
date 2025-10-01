# Quick Start

This guide walks you through setting up mcpadre with Claude Code. We'll add an MCP server from PyPI and see it working in your editor.

> **Note:** This guide assumes you're using Claude Code. We'll add guides for other hosts (Cursor, Zed, VS Code) soon.

---

## Step 0: Install `mcpadre`

I recommend installing `mcpadre` at global scope. Right now, installing it at project scope _works_ but is less tested; please file bugs if you run into problems.

```bash
npm install -g mcpadre
```

---

## Step 1: Initialize Your Project

Run `mcpadre init` to create a configuration file:

```
$ mcpadre init
> Starting interactive host selection for project configuration...
? Select which MCP hosts to enable for this project:
Use spacebar to toggle, arrow keys to navigate, Enter to confirm. Only project-capable hosts are shown.
  Press space to select, enter to confirm, escape to cancel
o [x] Claude Code
  [ ] Cursor
  [ ] opencode
  [ ] Zed
  [ ] Visual Studio Code
```

Select Claude Code (it's already checked by default) and press Enter.

```
> Created mcpadre project configuration: mcpadre.yaml
> Enabled hosts: claude-code
>
> Next steps:
> 1. Add your MCP servers to the 'mcpServers' section of the configuration
> 2. Install the configuration for your enabled hosts:
>    mcpadre install
```

This creates a `mcpadre.yaml` file in your project:

```yaml
version: 1
env: {}
mcpServers: {}
hosts:
  claude-code: true
```

---

## Step 2: Add an MCP Server

Add a server from a package registry:

```
$ mcpadre server add
> Starting interactive registry server addition...
? Select the type of MCP server to add:
  (Use arrow keys, <enter> to confirm, <esc> to go back, <ctrl+c> to cancel)
  Node.js (NPM)
o Python (PyPI)
  Container (Docker)
```

Select Python (PyPI) and press Enter. When prompted for a package name, enter `mcp-sleep`:

```
? Enter PyPI Registry package name: mcp-sleep
```

Then select a version:

```
> Fetching package information for mcp-sleep...
? Select version for mcp-sleep:
  (Use arrow keys, <enter> to confirm, <esc> to go back, <ctrl+c> to cancel)
o 0.1.1 - 3/26/2025
  0.1.0 - 3/22/2025
```

Review the configuration and confirm:

```
> Server configuration to be added:
mcp-sleep:
  python:
    package: mcp-sleep
    version: "0.1.1"
? Add server 'mcp-sleep' to configuration? (y/n)
  (y/n, <esc> to go back, <ctrl+c> to cancel) yes
> Successfully added server from registry:
> mcp-sleep
```

Your `mcpadre.yaml` now includes the server:

```yaml
version: 1
env: {}
mcpServers:
  mcp-sleep:
    python:
      package: mcp-sleep
      version: "0.1.1"
hosts:
  claude-code: true
```

---

## Step 3: Install Configuration

Run `mcpadre install` to generate the Claude Code configuration:

```
$ mcpadre install
> Installing configuration for enabled hosts in project mode...
> Created uv.lock file
> Installed for 1 host(s): claude-code
> Created 0 file(s) and updated 1 file(s)
> Configured 1 server(s) across all hosts
```

This creates a `.mcp.json` file that tells Claude Code to use `mcpadre run mcp-sleep` instead of running the server directly.

---

## Step 4: Use Your MCP Server

Launch Claude Code in your project directory:

```
$ claude
```

Claude Code detects the new MCP server and prompts you to approve it:

```
+-----------------------------------------------------------------------------+
|                                                                             |
| New MCP server found in .mcp.json: mcp-sleep                               |
|                                                                             |
| MCP servers may execute code or access system resources. All tool calls    |
| require approval. Learn more in the MCP documentation.                     |
|                                                                             |
| o 1. Use this and all future MCP servers in this project                   |
|   2. Use this MCP server                                                   |
|   3. Continue without using this MCP server                                |
|                                                                             |
+-----------------------------------------------------------------------------+
```

Select option 1 to approve the server. You can verify it's connected by running `/mcp`:

```
+-----------------------------------------------------------------------------+
|Manage MCP servers                                                           |
|                                                                             |
|   1. mcp1                  ✅ connected - Enter to view details             |
| > 2. mcp-sleep             ✅ connected - Enter to view details             |
|   3. mcp2                  ✅ connected - Enter to view details             |
|   4. mcp3                  ✅ connected - Enter to view details             |
+-----------------------------------------------------------------------------+
```

Now try using it:

```
> use mcp-sleep to sleep for 6 seconds
```

Claude Code will request permission to call the tool, then execute it:

```
[x] mcp-sleep - sleep (MCP)(seconds: 6)
  [x]  You can continue to do your task after you've been waiting 6 seconds

[x] Done.
```

---

## Next Steps

You're all set! Your MCP server is running through mcpadre, which means that your dependencies are pinned with lock files (either ours, for Docker containers, or platform-specific ones for Node or Python servers). Servers by default run in a sandboxed environment that constrains what they can read and write, and the `mcpadre.yaml` file will allow the rest of your team to reproduce your exact setup.

This is a trivial setup, though, and `mcpadre` wouldn't really have a great reason to exist if this was all it could do. Here's a few things you can do witth `mcpadre`:

- You can quickly add an MCP by pointing at its GitHub or GitLab URL (assuming they have a very attractively-named `ADD-THIS-MCP.yaml` file).
- You can configure an MCP's environment settings in a bunch of different ways. It supports literals, passing environment variables from the parent environment (by default they get stripped out), or use a command to yield the value of it (so you can store your tokens in 1Password instead of having to leave them in plaintext).
- You can turn on logging and see exactly why your MCP didn't start.
- You can turn on traffic recording and get a full log of all requests and responses between your host and the server. (We're working on expanding this into an interceptor-driven flow for auditing purposes!)

When you want to have MCP servers that you _don't_ share with the rest of your team, you can do `mcpadre init --user` and follow a similar workflow. (Whether your host of choice supports user-level configuration, and how it layers with project-specific configuration, is up to them.)

To learn more about mcpadre's high-level concepts, check out the [Concepts Guide](02-CONCEPTS.md).
