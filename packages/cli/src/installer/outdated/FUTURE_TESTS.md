# Future MCP Ecosystem Integration Tests

As the MCP ecosystem matures and more stable server implementations become available, we should add comprehensive integration tests for the `mcpadre outdated` command.

## Planned Integration Tests

### Docker Container Tests

- **Real MCP Servers**: Test with actual MCP server Docker images (e.g., official OpenAI, Anthropic, or community servers)
- **Digest Change Detection**: Pull a specific image version, simulate a newer build with same tag, verify digest change detection
- **Version Tag Testing**: Test with semantic versioned container tags to verify proper upgrade type detection

### NPM Package Tests

- **Real MCP Server Packages**: Test with published NPM MCP server packages when ecosystem develops
- **Dependency Audit**: Test `pnpm audit -P` integration with packages that have known vulnerabilities
- **Scoped Package Testing**: Test with scoped packages (@namespace/package) common in MCP ecosystem

### PyPI Package Tests

- **Real MCP Server Packages**: Test with published PyPI MCP server packages
- **Dependency Audit**: Test `uvx pip-audit` integration with packages that have known vulnerabilities
- **Python Version Constraints**: Test with packages that have specific Python version requirements

### End-to-End Workflow Tests

- **Full Project Tests**: Create test projects with multiple server types and test complete outdated detection workflow
- **Audit Flag Testing**: Test `--skip-audit` vs audit-enabled modes with real dependencies
- **Filter Testing**: Test `--type` and `--server-name` filters with complex multi-server configurations

### Network Resilience Tests

- **Registry Timeouts**: Test behavior when NPM/PyPI registries are slow or unreachable
- **Docker Registry Issues**: Test behavior when Docker Hub or other registries are unavailable
- **Partial Failures**: Test mixed success/failure scenarios (some servers check successfully, others fail)

## Implementation Notes

### Test Environment Setup

- Use stable, well-maintained MCP servers for consistent test results
- Consider creating dedicated test MCP servers with known version histories
- Use test-specific package registries or mirrors when available

### CI/CD Considerations

- Network-dependent tests should be marked as integration tests with longer timeouts
- Consider mocking external registry calls in CI, while allowing real network tests in development
- Use test fixtures with known package versions rather than relying on latest versions

### Test Data Management

- Create fixtures with known-outdated package versions for consistent test results
- Document expected upgrade types (major/minor/patch) for test packages
- Maintain test configurations as the MCP ecosystem evolves

## Timeline

These tests should be implemented as:

1. **Phase 1**: Basic Docker integration tests with simple, stable images
2. **Phase 2**: NPM/PyPI integration tests as MCP server packages become available
3. **Phase 3**: Complex end-to-end workflow tests with multi-server configurations
4. **Phase 4**: Network resilience and error handling tests

Each phase should be implemented as the underlying MCP ecosystem reaches sufficient maturity to support reliable testing.
