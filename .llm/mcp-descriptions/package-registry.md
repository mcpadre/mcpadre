# Package Registry MCP Server Instructions

## Overview

The package-registry-mcp server provides access to package information from NPM, Cargo (Rust), NuGet (.NET), PyPI (Python), and Go module registries.

## Available Tools

### NPM Registry

#### `search-npm-packages`

Search NPM registry for packages.

- **Parameters:**
  - `query` (string, required): Search term
  - `limit` (number, optional): Max results 1-100, default 10

#### `get-npm-package-details`

Get detailed NPM package information.

- **Parameters:**
  - `name` (string, required): Exact package name

#### `list-npm-package-versions`

List NPM package versions.

- **Parameters:**
  - `name` (string, required): Exact package name
  - `limit` (number, optional): Max versions 1-1000, default 100

### Cargo Registry (Rust)

#### `search-cargo-packages`

Search crates.io for Rust packages.

- **Parameters:**
  - `query` (string, required): Search term
  - `limit` (number, optional): Max results 1-100, default 10

#### `get-cargo-package-details`

Get detailed crate information.

- **Parameters:**
  - `name` (string, required): Exact crate name

#### `list-cargo-package-versions`

List crate versions.

- **Parameters:**
  - `name` (string, required): Exact crate name
  - `limit` (number, optional): Max versions 1-1000, default 100

### NuGet Registry (.NET)

#### `search-nuget-packages`

Search NuGet registry for .NET packages.

- **Parameters:**
  - `query` (string, required): Search term
  - `limit` (number, optional): Max results 1-100, default 10

#### `get-nuget-package-details`

Get detailed NuGet package information.

- **Parameters:**
  - `name` (string, required): Exact package name

#### `list-nuget-package-versions`

List NuGet package versions.

- **Parameters:**
  - `name` (string, required): Exact package name
  - `limit` (number, optional): Max versions 1-1000, default 100

### PyPI Registry (Python)

**Note:** PyPI search not available via API. Use website: https://pypi.org/search/

#### `get-pypi-package-details`

Get detailed PyPI package information.

- **Parameters:**
  - `name` (string, required): Exact package name

#### `list-pypi-package-versions`

List PyPI package versions.

- **Parameters:**
  - `name` (string, required): Exact package name
  - `limit` (number, optional): Max versions 1-1000, default 100

### Go Modules

**Note:** Go module search not available via API. Use website: https://pkg.go.dev/search/

#### `get-golang-package-details`

Get detailed Go module information.

- **Parameters:**
  - `module` (string, required): Module path (e.g., "github.com/gin-gonic/gin")

#### `list-golang-package-versions`

List Go module versions.

- **Parameters:**
  - `module` (string, required): Module path
  - `limit` (number, optional): Max versions 1-1000, default 100

## Usage Examples

### Search for packages

```
Use search-npm-packages with query "react" and limit 5
```

### Get package details

```
Use get-npm-package-details with name "express"
Use get-cargo-package-details with name "serde"
Use get-pypi-package-details with name "requests"
```

### List versions

```
Use list-npm-package-versions with name "typescript" and limit 20
Use list-golang-package-versions with module "github.com/gorilla/mux"
```

## Response Information

### Package Details Include:

- Metadata (name, description, version, license)
- Dependencies (runtime, dev, peer where applicable)
- Maintainer/author information
- Repository and documentation links
- Download statistics
- Latest versions list

### Version Lists Include:

- Package/module name
- Total version count
- Versions sorted by release date (newest first)
- Latest stable version information

## Important Notes

1. **Exact Names Required:** For detail and version queries, use exact package names
2. **Case Sensitivity:** Package names are case-sensitive for some registries
3. **Module Paths:** Go modules require full module paths (e.g., "github.com/owner/repo")
4. **Search Limitations:** PyPI and Go modules don't support search via this server - use their websites
5. **Real-time Data:** All data is fetched directly from official registries in real-time
