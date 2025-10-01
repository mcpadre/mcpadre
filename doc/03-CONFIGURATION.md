# Configuration Reference

mcpadre uses configuration files to define MCP servers, hosts, environment variables, and options.

## Configuration Files

### Project Configuration

Located at the root of your project as `mcpadre.yaml` (or `mcpadre.json`, or `mcpadre.toml`). This configuration is typically committed to version control and shared with your team.

### User Configuration

Located in `$HOME/.mcpadre/mcpadre.yaml` (or `.json`, or `.toml`). This configuration is personal to you and applies globally across all projects.

> **Note:** Configuration files can be written in YAML, JSON, or TOML format. Examples below use YAML.

---

## Top-Level Keys

### `version`

**Required.** Must be set to `1`. The use of any other version will cause demons to fly out your nose, or at least cause validation errors.

```yaml
version: 1
```

---

### `hosts`

A record of host names to boolean values indicating which MCP clients should receive mcpadre-generated configurations during `mcpadre install`.

```yaml
hosts:
  claude-code: true
  cursor: true
  zed: false
```

While the `hosts` key itself is optional in any individual configuration file, **at least one `hosts` entry must be defined somewhere** (either in your project config, user config, or both) for `mcpadre install` to generate host configurations.

**Configuration Cascading:** When both project and user configs define hosts, they are merged together. This allows you to:

- Set personal host preferences in your user config (e.g., `cursor: true`)
- Override or add additional hosts in specific projects (e.g., `zed: true` for a particular project)

For a complete list of available hosts and their capabilities, see [Supported Hosts](20-SUPPORTED_HOSTS.md).

---

### `options`

**Optional.** Configuration options that control mcpadre's behavior.

#### `logMcpTraffic`

**Type:** `boolean`
**Default:** `false`
**Available in:** Project and User

Enable logging of MCP JSON-RPC traffic for debugging.

```yaml
options:
  logMcpTraffic: true
```

#### `installImplicitlyUpgradesChangedPackages`

**Type:** `boolean`
**Default:** `false`
**Available in:** Project and User

Automatically upgrade packages when their versions change during `mcpadre install`.

```yaml
options:
  installImplicitlyUpgradesChangedPackages: true
```

#### `pythonVersionManager`

**Type:** `"auto" | "none" | "asdf" | "mise"`
**Default:** `"auto"`
**Available in:** Project and User

Controls Python version manager integration for Python MCP servers.

**Behavior:**

- `auto` (default) - Detects asdf or mise automatically and integrates with them
- `none` - Disables version manager integration
- `asdf` - Explicitly use asdf integration
- `mise` - Explicitly use mise integration

When version manager integration is enabled, mcpadre:

- Respects `.tool-versions` files in your project for Python versions
- Adds asdf/mise directories to sandbox read permissions
- Ensures Python executables from version managers are accessible
- Writes `.python-version` and `.tool-versions` files to individual server directories when `pythonVersion` is specified in a server config

```yaml
options:
  pythonVersionManager: auto
```

#### `nodeVersionManager`

**Type:** `"auto" | "none" | "asdf" | "mise"`
**Default:** `"auto"`
**Available in:** Project and User

Controls Node.js version manager integration for Node.js MCP servers.

**Behavior:**

- `auto` (default) - Detects asdf or mise automatically and integrates with them
- `none` - Disables version manager integration
- `asdf` - Explicitly use asdf integration
- `mise` - Explicitly use mise integration

When version manager integration is enabled, mcpadre:

- Respects `.tool-versions` files in your project for Node.js versions
- Adds asdf/mise directories to sandbox read permissions
- Ensures Node.js executables from version managers are accessible
- Writes `.node-version` and `.tool-versions` files to individual server directories when `nodeVersion` is specified in a server config

```yaml
options:
  nodeVersionManager: auto
```

#### `extraAllowRead`

**Type:** `string[]`
**Available in:** Project and User

Additional paths that all servers can read and execute. These paths are merged with each server's individual `allowRead` list. Supports path templates.

```yaml
options:
  extraAllowRead:
    - /usr/local/bin
    - ${HOME}/.config
```

#### `extraAllowWrite`

**Type:** `string[]`
**Available in:** Project and User

Additional paths that all servers can read, write, and execute. These paths are merged with each server's individual `allowReadWrite` list. Supports path templates.

```yaml
options:
  extraAllowWrite:
    - ${HOME}/.cache
```

#### `skipGitignoreOnInstall`

**Type:** `boolean`
**Default:** `false`
**Available in:** Project only

Skip adding host configuration files to `.gitignore` during `mcpadre install`.

```yaml
options:
  skipGitignoreOnInstall: true
```

#### `disableAllSandboxes`

**Type:** `boolean`
**Default:** `false`
**Available in:** Project only

Disable sandboxing for all servers, regardless of individual server `sandbox.enabled` settings. Use with caution.

```yaml
options:
  disableAllSandboxes: true
```

---

## Configuration Merging

When running mcpadre from within a project, user and project configurations are merged together. Understanding how this merging works is important for setting up shared project defaults while maintaining personal preferences.

### MCP Servers - Separate Contexts

User and project servers are **completely independent**:

- **Project servers** are defined in `mcpadre.yaml` and run when you execute commands in that project
- **User servers** are defined in `~/.mcpadre/mcpadre.yaml` and run with the `--user` flag
- Server definitions never merge - they remain in separate contexts

**Note:** Whether user servers or project servers take precedence when both are available depends on the host application's configuration layering, not mcpadre.

### Environment Variables - User as Base, Project Overrides

Environment variables merge with **project values overriding user values**:

```
Final env = { ...userEnv, ...projectEnv }
```

This creates a "defaults" pattern where you can:

- Set common environment variables in your user config (e.g., API keys, tool paths)
- Override them in specific projects when needed

**Example:**

User config (`~/.mcpadre/mcpadre.yaml`):

```yaml
env:
  API_KEY: "{{parentEnv.DEFAULT_API_KEY}}"
  LOG_LEVEL: info
```

Project config (`mcpadre.yaml`):

```yaml
env:
  LOG_LEVEL: debug # Overrides user setting
  PROJECT_ID: "my-project"
```

Result when running in project:

```yaml
env:
  API_KEY: "{{parentEnv.DEFAULT_API_KEY}}" # From user
  LOG_LEVEL: debug # From project (overridden)
  PROJECT_ID: "my-project" # From project
```

### Server-Level Environment Variables - Highest Priority

Each server can define its own environment variables that override the merged workspace environment:

```
Final server env = { ...mergedWorkspaceEnv, ...serverSpecificEnv }
```

**Precedence order (lowest to highest):**

1. User `env`
2. Project `env`
3. Server-specific `env`

**Example:**

```yaml
# User config
env:
  API_KEY: "user-default"

# Project config
env:
  API_KEY: "project-override"
  DATABASE_URL: "postgres://localhost"

mcpServers:
  my-server:
    python:
      package: example
      version: "1.0.0"
    env:
      API_KEY: "server-specific-key"  # This wins
```

The server receives:

- `API_KEY="server-specific-key"` (from server config)
- `DATABASE_URL="postgres://localhost"` (from project config)

### Hosts - User Overrides Project

Host settings merge with **user values overriding project values**:

```
Final hosts = { ...projectHosts, ...userHosts }
```

This allows you to:

- Define default hosts in the project config (for team consistency)
- Override specific hosts in your user config (for personal preferences)

**Example:**

User config:

```yaml
hosts:
  cursor: true
  claude-code: false # Personal preference
```

Project config:

```yaml
hosts:
  claude-code: true
  zed: true
```

Result:

```yaml
hosts:
  cursor: true # From user
  claude-code: false # From user (overridden)
  zed: true # From project
```

### Options - Project Overrides User

Options merge with **project values overriding user values**:

```
Final options = { ...userOptions, ...projectOptions }
```

This ensures:

- Project-level settings (like `disableAllSandboxes`) take precedence
- User preferences (like `pythonVersionManager`) serve as defaults

**Example:**

User config:

```yaml
options:
  pythonVersionManager: mise
  logMcpTraffic: false
```

Project config:

```yaml
options:
  logMcpTraffic: true
  disableAllSandboxes: true
```

Result:

```yaml
options:
  pythonVersionManager: mise # From user (inherited)
  logMcpTraffic: true # From project (overridden)
  disableAllSandboxes: true # From project
```

### Merging Summary

| Configuration  | Precedence              | Use Case                                              |
| -------------- | ----------------------- | ----------------------------------------------------- |
| **mcpServers** | Separate contexts       | User servers with `--user`, project servers otherwise |
| **env**        | User < Project < Server | Defaults in user, overrides in project/server         |
| **hosts**      | Project < User          | Project defaults, user personal preferences           |
| **options**    | User < Project          | User preferences, project requirements                |

---

### `env`

**Optional.** Environment variables that are passed down to all MCP servers. Values can be strings, templates, or commands.

```yaml
env:
  API_KEY: "my-secret-key"
  HOME_DIR: ${HOME}
```

Environment variables defined here are available to all servers in the `mcpServers` section.

---

### `mcpServers`

**Optional.** A record of server names to server configurations. Each server can be a Node.js, Python, Container, or HTTP-based MCP server.

```yaml
mcpServers:
  mcp-sleep:
    python:
      package: mcp-sleep
      version: "0.1.1"
```

Each server type has its own configuration structure. See the sections below for detailed configuration options for each server type.

---

## String Templating

mcpadre supports **Mustache templating** (using the `{{variable}}` syntax) in various configuration values. There are two primary contexts where templating is used:

### Path Templates

Path templates are used in sandbox configuration (`allowRead`, `allowReadWrite`) and workspace options (`extraAllowRead`, `extraAllowWrite`).

**Available variables:**

- `dirs.home` - User's home directory
- `dirs.config` - Configuration directory (platform-specific)
- `dirs.cache` - Cache directory (platform-specific)
- `dirs.data` - Data directory (platform-specific)
- `dirs.log` - Log directory (platform-specific)
- `dirs.temp` - Temporary directory (platform-specific)
- `dirs.workspace` - Current workspace/project directory
- `parentEnv.VARIABLE_NAME` - Access environment variables from the parent process

**Example:**

```yaml
options:
  extraAllowRead:
    - "{{dirs.home}}/.config/app"
    - "{{dirs.workspace}}/data"
    - "{{parentEnv.CUSTOM_PATH}}/bin"
```

### Special Directories

The `dirs.*` template variables resolve to platform-specific standard directories:

#### `dirs.home`

User's home directory:

- **macOS/Linux**: `~` (e.g., `/Users/username` or `/home/username`)
- **Windows**: `%USERPROFILE%` (e.g., `C:\Users\USERNAME`)

#### `dirs.config`

Configuration directory:

- **macOS**: `~/Library/Preferences`
- **Linux**: `~/.config` (or `$XDG_CONFIG_HOME` if set)
- **Windows**: `C:\Users\USERNAME\AppData\Roaming`\*

#### `dirs.cache`

Cache directory:

- **macOS**: `~/Library/Caches`
- **Linux**: `~/.cache` (or `$XDG_CACHE_HOME` if set)
- **Windows**: `C:\Users\USERNAME\AppData\Local`\*

#### `dirs.data`

Application data directory:

- **macOS**: `~/Library/Application Support`
- **Linux**: `~/.local/share` (or `$XDG_DATA_HOME` if set)
- **Windows**: `C:\Users\USERNAME\AppData\Local`\*

#### `dirs.log`

Log files directory:

- **macOS**: `~/Library/Logs`
- **Linux**: `~/.local/state` (or `$XDG_STATE_HOME` if set)
- **Windows**: `C:\Users\USERNAME\AppData\Local`\*

#### `dirs.temp`

Temporary directory:

- **macOS**: System temp directory (e.g., `/var/folders/.../T`)
- **Linux**: `/tmp/username`
- **Windows**: `C:\Users\USERNAME\AppData\Local\Temp`\*

#### `dirs.workspace`

Current project/workspace directory (where `mcpadre.yaml` is located or the directory specified with `--dir`).

**Note for Windows:** The paths shown use English directory names. On non-English versions of Windows, these directories may have localized names (e.g., `AppData` might be localized depending on the OS language).

### Command and Environment Templates

Command templates are used in the `env` section when defining environment variables with the `command` type. String templates are used for literal string values in the `env` section.

**Available variables (same as path templates):**

- `dirs.home`, `dirs.config`, `dirs.cache`, `dirs.data`, `dirs.log`, `dirs.temp`, `dirs.workspace`
- `parentEnv.VARIABLE_NAME` - Access environment variables from the **parent process** (not the `env` being passed to the server)

**Important:** The `parentEnv` object accesses the environment variables from the parent mcpadre process (typically your shell's `process.env`), **not** the `env` configuration being passed to MCP servers. This allows you to reference existing environment variables when building new ones.

**Example:**

```yaml
env:
  # String template
  CONFIG_PATH: "{{dirs.config}}/myapp"

  # Command template - execute a command to get the value
  API_TOKEN:
    command: "op read op://vault/api-token/credential"

  # Command with templating
  WORKSPACE_NAME:
    command: "basename {{dirs.workspace}}"

  # Reference parent environment
  USER_HOME: "{{parentEnv.HOME}}"
```

### Environment Variable Types

The `env` section supports multiple ways to define environment variable values:

#### Plain String (with templating)

```yaml
env:
  MY_VAR: "literal value"
  MY_PATH: "{{dirs.workspace}}/config"
```

#### String Object (explicit form)

```yaml
env:
  MY_VAR:
    string: "{{dirs.home}}/data"
```

#### Special Directory

```yaml
env:
  HOME_DIR:
    special: home # one of: home, config, cache, data, log, temp, workspace
```

#### Pass Through (from parent environment)

```yaml
env:
  USER:
    pass: USER # Passes $USER from parent environment to server
```

#### Command Execution

```yaml
env:
  API_KEY:
    command: "op read op://vault/api-key/credential"

  GIT_BRANCH:
    command: "git branch --show-current"
```

Commands are executed in the parent environment and their stdout becomes the environment variable value.

---

## MCP Server Types

Each MCP server is configured with a specific type (Python, Node.js, Container, or HTTP) and type-specific options.

### Python Servers

Python-based MCP servers are installed via `uv` and run in isolated Python environments.

**Configuration:**

```yaml
mcpServers:
  my-python-server:
    python:
      package: package-name # Required: PyPI package name
      version: "1.0.0" # Required: Package version (quoted)
      pythonVersion: "3.11" # Optional: Python version requirement
      command: "custom-entrypoint" # Optional: Custom command (default: package name)

    # Optional: Server-specific environment variables
    env:
      API_KEY: "{{parentEnv.MY_API_KEY}}"

    # Optional: Sandbox configuration (see Sandbox section)
    sandbox:
      enabled: true

    # Optional: Log MCP JSON-RPC traffic for this server
    logMcpTraffic: false

    # Optional: Auto-upgrade on version changes
    installImplicitlyUpgradesChangedPackages: false
```

**Required fields:**

- `python.package` - PyPI package name
- `python.version` - Package version (must be quoted to ensure YAML treats it as string)

**Optional fields:**

- `python.pythonVersion` - Constrain Python runtime version. When specified, mcpadre writes `.python-version` and `.tool-versions` files to the server directory (`.mcpadre/servers/<server-name>/`) to pin this specific server to the specified Python version
- `python.command` - Override the default entrypoint command
- `env` - Server-specific environment variables (merged with top-level `env`)
- `sandbox` - Sandbox configuration (see Sandbox Configuration section)
- `logMcpTraffic` - Enable JSON-RPC traffic logging for this server
- `installImplicitlyUpgradesChangedPackages` - Auto-upgrade when package version changes

---

### Node.js Servers

Node.js-based MCP servers are installed via `pnpm` and run in isolated Node environments.

**Configuration:**

```yaml
mcpServers:
  my-node-server:
    node:
      package: "@org/package-name" # Required: NPM package name
      version: "2.1.0" # Required: Package version (quoted)
      nodeVersion: "20" # Optional: Node.js version requirement
      bin: "custom-bin" # Optional: Binary name from package.json
      args: "--verbose --port 8080" # Optional: Additional command-line arguments

    # Optional: Server-specific environment variables
    env:
      PORT: "8080"

    # Optional: Sandbox configuration
    sandbox:
      enabled: true

    # Optional: Log MCP JSON-RPC traffic
    logMcpTraffic: false

    # Optional: Auto-upgrade on version changes
    installImplicitlyUpgradesChangedPackages: false
```

**Required fields:**

- `node.package` - NPM package name (can include scope like `@org/package`)
- `node.version` - Package version (must be quoted)

**Optional fields:**

- `node.nodeVersion` - Constrain Node.js runtime version. When specified, mcpadre writes `.node-version` and `.tool-versions` files to the server directory (`.mcpadre/servers/<server-name>/`) to pin this specific server to the specified Node.js version
- `node.bin` - Override binary name (defaults to package name)
- `node.args` - Additional command-line arguments (supports templating)
- `env` - Server-specific environment variables
- `sandbox` - Sandbox configuration
- `logMcpTraffic` - Enable JSON-RPC traffic logging
- `installImplicitlyUpgradesChangedPackages` - Auto-upgrade when package version changes

---

### Container Servers

Container-based MCP servers run inside Docker containers with optional volume mounts.

**Configuration:**

```yaml
mcpServers:
  my-container-server:
    container:
      image: org/image-name # Required: Docker image name
      tag: v1.2.3 # Required: Image tag
      pullWhenDigestChanges: true # Optional: Auto-pull on digest changes
      command: "custom-entrypoint" # Optional: Override container command

      # Optional: Volume mounts
      volumes:
        data:
          containerMountPath: /data # Required: Path inside container
          hostMountPath: "{{dirs.workspace}}/data" # Optional: Host path (supports templates)
          readOnly: false # Optional: Mount as read-only
          skipGitignore: false # Optional: Don't add to .gitignore

        config:
          containerMountPath: /config
          readOnly: true

    # Optional: Server-specific environment variables
    env:
      DATABASE_URL: "sqlite:///data/db.sqlite"

    # Optional: Sandbox configuration
    sandbox:
      enabled: true

    # Optional: Log MCP JSON-RPC traffic
    logMcpTraffic: false

    # Optional: Auto-upgrade on version changes
    installImplicitlyUpgradesChangedPackages: false
```

**Required fields:**

- `container.image` - Docker image name
- `container.tag` - Image tag

**Optional fields:**

- `container.pullWhenDigestChanges` - Automatically pull image when digest changes (default: false)
- `container.command` - Override default container command (supports templating)
- `container.volumes` - Volume mount configurations (each volume requires):
  - `containerMountPath` (required) - Mount path inside container
  - `hostMountPath` (optional) - Host path to mount (defaults to `.mcpadre/servers/<server-name>/<volume-name>`)
  - `readOnly` (optional) - Mount as read-only (default: false)
  - `skipGitignore` (optional) - Don't add to .gitignore (default: false)
- `env` - Server-specific environment variables
- `sandbox` - Sandbox configuration
- `logMcpTraffic` - Enable JSON-RPC traffic logging
- `installImplicitlyUpgradesChangedPackages` - Auto-upgrade when package version changes

---

### HTTP Servers

HTTP-based MCP servers connect to remote HTTP MCP endpoints over HTTPS.

**Configuration:**

```yaml
mcpServers:
  my-http-server:
    http:
      url: https://api.example.com/mcp # Required: HTTPS URL

      # Optional: Custom HTTP headers
      headers:
        Authorization: "Bearer {{parentEnv.API_TOKEN}}"
        X-Custom-Header: "value"

    # Optional: Log MCP JSON-RPC traffic
    logMcpTraffic: false
```

**Required fields:**

- `http.url` - HTTPS URL of the MCP endpoint (must use HTTPS)

**Optional fields:**

- `http.headers` - HTTP headers to send with requests (values support environment templating)
- `logMcpTraffic` - Enable JSON-RPC traffic logging

**Note:** HTTP servers do **not** support:

- `env` configuration (use `http.headers` for passing credentials)
- `sandbox` configuration (no local process to sandbox)
- `installImplicitlyUpgradesChangedPackages` (no packages to upgrade)

---

## Sandbox Configuration

Python, Node.js, and Container servers support sandboxing to restrict filesystem and network access.

**Configuration:**

```yaml
mcpServers:
  my-server:
    python:
      package: example
      version: "1.0.0"

    sandbox:
      enabled: true # Enable/disable sandbox (default: true)
      networking: true # Allow network access (default: true)
      omitSystemPaths: false # Exclude default system paths (default: false)
      omitWorkspacePath: false # Exclude workspace from read-write (default: false)

      # Additional read+execute paths
      allowRead:
        - "{{dirs.home}}/.config/app"
        - "{{dirs.cache}}/models"

      # Additional read+write+execute paths
      allowReadWrite:
        - "{{dirs.workspace}}/output"
        - "{{dirs.temp}}/scratch"
```

**Sandbox options:**

- `enabled` - Enable sandboxing (default: `true`)
- `networking` - Allow network access (default: `true`)
- `omitSystemPaths` - If `false`, include default system paths like `/bin`, `/usr/lib` as read-only (default: `false`)
- `omitWorkspacePath` - If `false`, include workspace path as read-write (default: `false`)
- `allowRead` - Additional paths with read+execute access (supports templating)
- `allowReadWrite` - Additional paths with read+write+execute access (supports templating)

Sandbox paths support templating and are merged with workspace-level `extraAllowRead` and `extraAllowWrite` options.
