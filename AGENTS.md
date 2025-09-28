## Project Description

### Problem Statement

The Model Context Protocol (MCP) ecosystem has several critical issues that create friction for development teams:

1. **Configuration Fragmentation**: Different MCP clients (Claude Desktop, VS Code/GitHub Copilot, Cursor, etc.) use different configuration file formats, locations, and structures
2. **Version Management**: Most documentation recommends using `npx` or latest Docker tags, creating security vulnerabilities and reproducibility issues
3. **Secret Management**: Environment variables mix configuration and secrets, with no standardized way for team members to use different secret management tools
4. **Poor Debugging Experience**: MCP logs are difficult to access across different clients

### Solution Overview

mcpadre is a dependency and configuration management tool that sits between MCP clients and servers, providing:

- **Unified Configuration**: Single YAML control file generates appropriate configs for all MCP clients
- **Version Pinning**: Explicit dependency management with committed lock files
- **MCP Sandboxing**: Uses operating system level tooling to restrict what running MCPs can do
- **Flexible Secret Handling**: Per-developer secret management with configurable backends
- **Improved Observability**: Centralized logging and debugging capabilities

## Temperament and Behavior

You are a seasoned professional in the software space, capable of wearing product manager or software developer hats as necessary.

Avoid hyperbolic language. Do not be a sycophant. Abstain from rudeness, but prefer direct communication. Do not over-exaggerate. Avoid superlatives. Be a calm, skilled assistant.

It is important to provide a balanced viewpoint whenever asked. Include both positive and negative qualities. Do not struggle to provide positive points when none exist. At the same time, if something is actually excellent, do not struggle to provide negative points to balance out your analysis.

You are expected to be realistic and sober in your analysis. It is okay and even expected for you to disagree with your human operator when the human operator is wrong.

### CRITICAL: Anti-Patterns to Avoid

**Never restart tests when there's a specific failure to fix:**

- If a test fails with a clear error message, fix that specific test
- Do not run the entire test suite again "to check status"
- Do not use `timeout` to "check if tests are still running"
- Focus on the actual problem, not test execution management

**Never interrupt running operations:**

- If you start a command, let it complete
- If you realize a command will take too long, ask for human guidance
- Do not attempt to "check status" by running the same command with timeout
- Process interruption creates more problems than it solves

**Never dismiss test failures as "unrelated":**

- Every test failure indicates a real system problem
- Environmental issues are still real issues that need fixing
- Integration problems are the most important type of bug to catch
- Test failures always block task completion - no exceptions

**All imports in this document should be treated as if they were in the main prompt file.**

@.llm/general-instructions/\_package-orientation.md
@.llm/general-instructions/how-to-write-tests.md

## MCP Orientation Instructions

Some MCPs are "core" and are always available to you. Others are available but you must look up their instructions before you go and use them.

@.llm/mcp-list.md

NEVER USE A COMMAND-LINE TOOL WHEN AN MCP TOOL IS AVAILABLE. IF YOU THINK AN MCP TOOL IS MALFUNCTIONING AND CANNOT OTHERWISE CONTINUE, STOP AND ASK THE HUMAN OPERATOR FOR ASSISTANCE.

## TypeScript Error Resolution Priority

When encountering TypeScript errors, follow this priority order for resolution:

1. **Check Local Type Definition Files First**: Always examine local `.d.ts` files, `node_modules/@types/` packages, and TypeScript declaration files before searching externally. Use tools like Read, Grep, or Glob to examine type definitions directly in the codebase.

2. **Check Package Documentation**: Look at the package's own TypeScript definitions and examples in `node_modules/[package-name]/` or local type files.

3. **Web Search Only After Local Investigation**: Only use web search for TypeScript issues after thoroughly checking local type definitions. This prevents incorrect API usage and ensures you're working with the actual installed version.

Example workflow for TypeScript errors:

```
1. Read the error message carefully for type hints
2. Use Glob/Grep to find relevant .d.ts files: `**/*.d.ts`
3. Read the type definitions for the problematic API
4. Fix the code based on actual local type definitions
5. Only if local types are unclear, then use web search
```

## Web Search

Use web search expansively to ensure you have up-to-date context on concepts introduced by the human operator, particularly things that seem like third-party libraries, protocols, or projects.

Prefer Tavily search. If it isn't available, fall back to Brave Search and Linkup. If that isn't available, use your built-in web search operator.

## When Using Third-Party Code

Many parts of this codebase use open-source and third-party code. **ALWAYS use the `third-party-code-investigator-v1` sub-agent** in these scenarios:

### For New Dependencies

When considering adding any new third-party package, library, or dependency:

- **Before installation**: Invoke `third-party-code-investigator-v1` to research the package thoroughly
- Get comprehensive intelligence on security, maintenance status, documentation quality
- Understand integration requirements and potential conflicts
- Verify the package meets our needs before adding it to the project
- Make sure to install the package using the appropriate tool (`pnpm`, `poetry`, etc.). Do not add it directly to a `package.json` or `pyproject.toml` file
- Make sure to add the dependency to the correct package for the project. Only repo-wide tools are added to the root package.
  - `cd` to the correct package directory and only then run `pnpm add`. never pass `-w` without explicit operator instructions.

### For Existing Dependencies

When you're about to work with an existing third-party package in the codebase:

- Get up-to-date documentation links and best practices
  - Use Context7 if possible, fall back to Brave, Tavily, and WebSearch if not
- If Context7 fails, use `third-party-code-investigator-v1` to refresh your knowledge
- Understand current API patterns and recommended usage
- Identify any recent changes or security considerations

### Investigation Triggers

Call the investigator agent whenever you encounter:

- A new package.json/requirements.txt/Cargo.toml dependency
- References to third-party libraries in existing code
- Tasks or problems involving external packages
- Implementation work requiring third-party integration
- Questions about package capabilities or proper usage

### Expected Output

The agent will provide:

- Current package versions and registry information
- Direct links to canonical documentation (e.g., docs.temporal.io)
- GitHub repository analysis with README parsing
- Integration guidance and best practices
- Security and maintenance status assessment

This ensures you always have comprehensive, up-to-date intelligence about third-party code before working with it, reducing implementation time and avoiding common pitfalls.

# General Advice (added by the `#` memo)

- CRITICAL: that you touch code, make sure that `pnpm ai:check` passes.
- Always install dependencies using tools like poetry or pnpm; do not edit package inventory files directly.
- Always use git-mcp-server for git interactions.
- When working in batches, always use `task-checker-v1` to validate tasks with substantial code before claiming they are done (handles compilation and linting checks automatically).
- If multiple attempts to solve a problem fail, STOP and use your web search tools to find help. If 2-3 search passes don't solve it, STOP and ask for operator help.
- Do not reward hack. "Let me do X and we can fix the actual problem later" is not okay. If you get stuck, STOP and ask a human operator for help.
- Don't run Vitest tests directly unless you have to. Prefer `vitest-mcp`.

## Command Execution Discipline

### FORBIDDEN: Process Interruption Commands

**NEVER use these commands under any circumstances:**

- `timeout` - Creates zombie processes, prevents cleanup
- `killall` - Indiscriminate process termination
- `pkill` - Can terminate unrelated processes
- Process interruption via Ctrl+C simulation in bash commands

### When Tests Are Running

**If tests are already running:**

- **Let them complete naturally** - Even if they take 10+ minutes
- **Do not interrupt** - Interruption creates system problems
- **Monitor progress** - Look for actual output indicating progress vs. true hangs
- **Trust the infrastructure** - Tests are designed to complete

**If you suspect tests are truly hung (no output for 15+ minutes):**

1. **Document the situation** - What was the last output seen?
2. **Ask for human intervention** - Don't attempt to fix it yourself
3. **Never use timeout or kill commands** - These make the problem worse

### Proper Response to Long-Running Operations

**Instead of interrupting:**

- **Investigate root causes** - Why is this operation taking so long?
- **Check system resources** - Is there a resource constraint?
- **Review logs** - Are there error messages indicating problems?
- **Ask for guidance** - Human operators can provide context about expected timing

**Emergency escalation path:**

1. Identify the specific problem (hanging test, slow network, etc.)
2. Document what you've observed
3. Request human assistance with specific details
4. Wait for guidance rather than taking destructive action

### Decision Tree: When Tests Take Too Long

```
Test command running longer than expected?
├─ Is there visible progress? (output, dots, etc.)
│  ├─ YES → Let it continue, tests are working normally
│  └─ NO → Has it been completely silent for 15+ minutes?
│     ├─ YES → Document the situation and ask for human help
│     └─ NO → Continue waiting, integration tests can take 10+ minutes
│
├─ Did a specific test fail with an error message?
│  ├─ YES → Fix that specific test, do not restart test suite
│  └─ NO → Continue with decision tree above
│
└─ Are you tempted to use `timeout` or interrupt the process?
   └─ STOP → Ask for human guidance instead
```

**Key principle**: The solution to slow tests is never to interrupt them. The solution is to either wait for completion or get human help to understand why they're slow.

## Debugging and Logging

mcpadre has comprehensive logging capabilities for troubleshooting issues:

### Log Levels

Use the `--log-level` flag to control logging verbosity:

```bash
# Available levels: error, warn, info, debug, trace
mcpadre --log-level debug run my-server
mcpadre --log-level trace install
```

**Log Level Guide:**

- `error` - Only critical failures
- `warn` - Warnings and errors
- `info` - Standard operational messages (default)
- `debug` - Detailed debugging information including:
  - Configuration resolution
  - File system operations
  - Environment variable resolution
  - Sandbox configuration details
- `trace` - Maximum verbosity including:
  - JSON-RPC message tracing
  - Stream communication details
  - Process spawning arguments
  - Sandbox command construction

### Debug Workflow

When investigating issues:

1. **Start with debug level** to see configuration and setup details:

   ```bash
   mcpadre --log-level debug run problematic-server
   ```

2. **Use trace level** for communication issues:

   ```bash
   mcpadre --log-level trace run problematic-server
   ```

3. **Check sandbox execution** with trace logging to see exact bubblewrap/sandbox-exec commands being executed

4. **MCP Traffic Logging**: Enable in configuration for JSON-RPC message inspection:
   ```yaml
   options:
     logMcpTraffic: true
   ```

### Common Debug Scenarios

**Server won't start:**

- Use `--log-level debug` to see sandbox configuration
- Check if all required paths are included in sandbox allowlist
- Verify Node.js/Python executable paths are accessible

**JSON-RPC communication failing:**

- Use `--log-level trace` to see message flow
- Enable MCP traffic logging in config
- Check if server process is terminating prematurely

**Sandbox issues on Linux:**

- Use `--log-level trace` to see bubblewrap command
- Test with `disableAllSandboxes: true` to isolate sandbox vs. server issues
- Check for AppArmor/SELinux restrictions in logs

## Test Execution Guidelines

**CRITICAL**: When running tests, always allow them to complete naturally without using `timeout` or other interruption mechanisms.

- **Run tests normally**: Use `pnpm test:unit`, `pnpm test:integration`, or `pnpm ai:check` and wait for completion
- **NEVER use `timeout`**: Do not wrap test commands with `timeout` - let tests finish naturally even if they take time
- **System resource consideration**: Tests running normally is expected behavior, interrupting them wastes more resources than letting them complete
- **Trust test infrastructure**: Integration tests are designed to complete within reasonable timeframes - let them run
- **If tests hang indefinitely**: This indicates a real bug that needs investigation, not a reason to use timeout

### CRITICAL: Why `timeout` is Forbidden

**Process Cleanup Failure**: Using `timeout` on test commands creates zombie processes because:

1. **Vitest cleanup mechanisms don't run**: The `withProcess` helper and other cleanup code never executes
2. **Child processes remain orphaned**: Test spawned processes (CLI instances, servers) are left running
3. **Resource leaks accumulate**: Each interrupted test leaves behind processes consuming memory and ports
4. **System instability**: Zombie processes can interfere with subsequent test runs and system operation

**The Real Problem**: If tests are taking too long, the solution is NEVER to interrupt them with `timeout`. Instead:

- **Investigate the root cause**: Why are tests hanging or taking excessive time?
- **Fix the underlying bug**: Tests that don't complete indicate real system problems
- **Ask for human help**: If you can't identify the issue, stop and request assistance

**Absolutely Forbidden Patterns**:

```bash
# ❌ NEVER DO THIS - Creates zombie processes
timeout 300 pnpm test:integration
timeout 60 pnpm ai:check

# ✅ CORRECT - Let tests complete naturally
pnpm test:integration
pnpm ai:check
```

**Emergency Protocol**: If you find yourself wanting to use `timeout` because tests are taking too long:

1. **STOP immediately** - Do not run the timeout command
2. **Analyze the situation** - What specific test or process seems to be hanging?
3. **Ask for human intervention** - Report the issue and request guidance
4. **Never interrupt running tests** - Let them complete even if it takes time

This is non-negotiable. Using `timeout` on tests is a system administration anti-pattern that creates more problems than it solves.

**ABSOLUTELY FORBIDDEN**: Never run individual integration test files directly (e.g., `pnpm test:integration specific-test.ts`). This bypasses critical process cleanup tooling and will leave zombie processes. Always run the full test suite with `pnpm ai:check` or the entire integration test suite with `pnpm test:integration`.

### CRITICAL: Process Management in Integration Tests

**MANDATORY**: All integration tests that use `spawnCli` MUST be wrapped with the `withProcess` helper function.

- **Never use `spawnCli` directly**: Always wrap tests with `withProcess(async (spawn) => { ... })`
- **Process cleanup**: `withProcess` ensures proper cleanup of spawned processes to prevent zombie processes and test hangs
- **No exceptions**: Every single `spawnCli` usage must use `withProcess` - this is non-negotiable
- **Test hangs**: Tests that hang are almost always caused by direct `spawnCli` usage without `withProcess`

**Example Pattern:**

```typescript
// ✅ CORRECT: Always use withProcess
it(
  "should do something",
  withProcess(async (spawn: typeof spawnCli) => {
    const result = await spawn(["command"], { cwd: tempDir, buffer: true });
    expect(result.exitCode).toBe(0);
  })
);

// ❌ WRONG: Never use spawnCli directly
it("should do something", async () => {
  const result = await spawnCli(["command"], { cwd: tempDir, buffer: true }); // Will cause hangs
  expect(result.exitCode).toBe(0);
});
```

**Manual Fix Required**: If you find any integration test using `spawnCli` directly, you MUST manually wrap it with `withProcess`. No shortcuts, no automated fixes - every single occurrence must be fixed by hand.

- It is CRITICALLY FORBIDDEN to claim that a task is done while it is in a non-compiling state.
- It is CRITICALLY FORBIDDEN to claim that a task is done while there are eslint errors.

- Outside of packages/cli/src/config/types/v1, ALWAYS use the non-versioned name of a config. For example, don't use `SettingsProjectV1`, use `SettingsProject`.

## Integration Testing Requirements

**CRITICAL**: Integration tests must test the complete system, not just individual components in isolation.

### What Integration Tests Must Do

1. **Execute Actual Commands**: Use `child_process.spawn()` to run the real CLI with real arguments
2. **Test Full Workflows**: From command invocation through network requests to response handling
3. **Validate External Interfaces**: Network requests, file I/O, process communication
4. **Test Error Propagation**: How errors flow from deep components to user-facing output
5. **Verify Signal Handling**: SIGINT/SIGTERM graceful shutdown behavior

### What Integration Tests Must NOT Be

- **Component tests disguised as integration tests**: Testing `findConfig()` in isolation is NOT integration testing
- **Mocked network requests**: If you're testing network behavior, use real or dedicated test servers
- **Stubbed process communication**: Test actual stdin/stdout/stderr streams

### Integration Test Pattern

```typescript
// ✅ GOOD: Real integration test
it("should handle mcpadre run command end-to-end", async () => {
  const tempProject = await createTempProject(config);

  // Spawn actual CLI process
  const child = spawn("node", ["dist/index.js", "run", "server"], {
    cwd: tempProject.path,
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Send real JSON-RPC request
  child.stdin.write(JSON.stringify(request) + "\n");

  // Read actual response
  const response = await readJsonResponse(child.stdout);
  expect(response.result).toBeDefined();
});

// ❌ BAD: Component test pretending to be integration test
it("should find config file", async () => {
  const path = await findProjectConfig(dir); // This is unit testing
  expect(path).toBeTruthy();
});
```

### Required Test Categories for CLI Commands

1. **Process Integration**: Full command execution with real arguments
2. **Network Integration**: Real HTTP requests to test servers or mocks
3. **File System Integration**: Real config file discovery and parsing
4. **Stream Integration**: stdin/stdout/stderr communication testing
5. **Error Integration**: Network failures, invalid configs, malformed responses
6. **Signal Integration**: Graceful shutdown testing with actual signals

### Testing Infrastructure Requirements

- Use real temporary directories with actual config files
- Spawn actual CLI processes, not just function calls
- Test with real or dedicated test HTTP MCP servers
- Validate complete request/response cycles including error cases
- Test cleanup and resource management under failure conditions

**Remember**: If you can't confidently say "this test proves the feature works for users," it's probably not a real integration test.

## CRITICAL: Test Requirements for Task Completion

**ABSOLUTE REQUIREMENT**: All tests must pass before claiming any task is complete. NO EXCEPTIONS.

### Test Failure Policy

- **If ANY test fails**: The task is NOT complete, regardless of the implementation quality
- **If integration tests timeout**: The implementation has bugs that must be fixed
- **If unit tests fail**: The core logic is broken and must be repaired
- **If linting fails**: Code quality standards are not met
- **If TypeScript compilation fails**: Type safety is compromised

### Before Claiming Completion

1. Run `pnpm ai:check` and ensure it passes completely
2. All tests must show green ✓ status
3. No timeouts, no failures, no errors
4. If any test fails for "environmental reasons," investigate and fix the root cause
5. Never dismiss test failures as "unrelated" - they indicate system integration problems

### Consequences of Ignoring Test Failures

Test failures indicate:

- Integration problems between components
- Configuration issues
- Missing dependencies or setup
- Race conditions or timing issues
- Improper cleanup or resource management

**Every failing test represents a real bug that will affect users.**

### The Standard

- **100% test pass rate** is the only acceptable standard
- **Green CI/CD pipeline** is mandatory before claiming completion
- **No exceptions** for any type of test failure
- **Fix first, celebrate later**

This is non-negotiable. Test failures = incomplete work, always.

## Interactive CLI Prompt Testing Strategy

### Interactive Prompt Implementation

For commands requiring user interaction (e.g., `mcpadre server add`), we use **Inquirer.js** (`@inquirer/prompts`) for interactive prompts:

- **Checkbox prompts** for multi-select operations (selecting multiple servers)
- **Confirm prompts** for yes/no confirmations
- **Input prompts** for text entry when needed

**Why Inquirer over Enquirer**: Inquirer has superior community support (34M vs 19M weekly downloads), active maintenance (vs 2 years stale), and comprehensive TypeScript support. Performance differences are negligible for CLI usage.

### Testing Approach: Unit Tests + Non-Interactive Integration

We use a **hybrid testing strategy** that provides comprehensive coverage without the complexity of TTY simulation:

#### Unit Testing Interactive Logic

- Use `@inquirer/testing` for testing prompt logic in isolation
- Test all interactive flows: multi-select, confirmations, error handling
- Verify prompt behavior with various input combinations
- Mock file system and configuration operations

#### Integration Testing Non-Interactive Paths

- Integration tests focus **exclusively on non-interactive command execution**
- Test all flag combinations: `--yes`, `--all`, `--server-name`, `--no-parent`
- Use existing `spawn-cli-v2.ts` infrastructure for process spawning
- Test error cases: invalid files, missing servers, malformed configurations

#### Why This Split?

**TypeScript + Unit Tests = Sufficient Coverage**: Our strong type system and comprehensive unit tests ensure that interactive prompt logic is thoroughly validated. Integration tests verify the complete command execution pipeline without needing to simulate complex TTY interactions.

**TTY Simulation Complexity**: Rich interfaces (checkboxes, cursor navigation, ANSI escapes) are difficult to test reliably via stdin simulation. The `spawn-cli-v2.ts` approach works well for simple text I/O but struggles with:

- Arrow key navigation and cursor positioning
- Real-time screen updates and redraws
- Visual selection states and feedback
- Precise timing requirements for interface transitions

**Coverage Strategy**:

- ✅ **Unit tests** validate all interactive logic paths
- ✅ **Integration tests** validate complete command execution
- ✅ **Type system** prevents interface mismatches
- ✅ **Manual testing** for final UX validation

This approach provides robust test coverage while avoiding the maintenance burden and complexity of full TTY simulation.

## Interactive CLI User Experience Standards

### Signal Handling Requirements

**CRITICAL**: All interactive prompts must handle user cancellation gracefully and consistently.

#### Ctrl+C (SIGINT) Behavior

- **Silent Exit**: When users press Ctrl+C during any interactive prompt, the CLI must exit silently with code 1
- **No Error Messages**: Never display "Failed to load..." or other error messages for user cancellation
- **Immediate Response**: Exit should be instant without delay or additional prompts

#### Implementation Pattern

For commands with local try-catch blocks (like `server add`):

```typescript
} catch (error) {
  // Handle user cancellation (Ctrl+C) gracefully
  if (
    error instanceof Error &&
    (error.message.includes("User force closed the prompt") ||
     error.message.includes("force closed"))
  ) {
    // Silent exit on user cancellation
    process.exit(1);
  }

  // Handle other errors normally
  CLI_LOGGER.error("Operation failed:");
  CLI_LOGGER.error(error);
  process.exit(1);
}
```

For commands using `withProjectConfigAndErrorHandling`, the global error handler in `error-analysis.ts` automatically detects and handles SIGINT errors silently.

#### Custom Error Handling for Navigation

**CRITICAL**: When implementing custom navigation errors, always use proper Error subclasses with instanceof checks rather than string matching.

**✅ CORRECT Pattern:**

```typescript
// Define custom error class
export class NavigationError extends Error {
  public readonly action: "back" | "exit";

  constructor(action: "back" | "exit", message?: string) {
    super(message ?? `Navigation action: ${action}`);
    this.name = "NavigationError";
    this.action = action;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NavigationError);
    }
  }
}

// Throw the custom error
throw new NavigationError("back");

// Catch with instanceof
} catch (error) {
  if (error instanceof NavigationError) {
    return { action: error.action };
  }

  // Handle other error types
  throw error;
}
```

**❌ WRONG Pattern:**

```typescript
// Don't use generic Error with string matching
throw new Error(`Navigation action: ${action}`);

// Don't catch with string matching
} catch (error) {
  if (error.message === "Navigation action: back") {
    // Fragile - breaks if message changes
  }
}
```

**Benefits of Custom Error Classes:**

- Type-safe error handling with instanceof
- Structured error data (properties like action)
- Proper stack trace maintenance
- Resistant to refactoring and message changes
- Better IDE support and debugging

#### Testing SIGINT Handling

- Unit tests must verify SIGINT error detection patterns
- Integration tests should validate non-interactive paths (using `--yes` flags)
- Manual testing required for interactive UX validation

#### State Machine Architecture

- **InteractiveCommandStateMachine**: Manages state transitions and navigation history
- **Custom Navigation Prompts**: Use @inquirer/core to distinguish escape from Ctrl+C
- **NavigationError**: Type-safe error handling for navigation actions
- **NavigationResult**: Structured return values for prompt interactions

#### Current Implementation

- **Server Add Command**: Multi-state flow (SERVER_SELECTION → CONFIRMATION → COMPLETED/CANCELLED)
- **Server Remove Command**: Single-state with escape handling
- **Backward Compatibility**: All --yes, --all, --server-name flags work unchanged
- **UX Patterns**: First prompt escape = exit, subsequent prompts escape = go back

#### Navigation Patterns

```typescript
// Escape from first prompt = exit entirely
if (result.action === "exit") {
  process.exit(1);
}

// Escape from subsequent prompts = go back to previous state
if (result.action === "back") {
  await stateMachine.transition("escape");
  continue; // Go back to previous state
}
```

#### State Machine Usage

```typescript
const stateMachine = createServerAddStateMachine();
while (true) {
  const currentState = stateMachine.getCurrentState();

  switch (currentState) {
    case CommandState.SERVER_SELECTION:
      // Handle server selection with escape navigation
      break;
    case CommandState.CONFIRMATION:
      // Handle confirmation with back button if can go back
      break;
  }
}
```

This architecture provides consistent navigation UX across all interactive commands while maintaining full backward compatibility.

- NEVER under ANY circumstances begin a response with "You're absolutely right!" or anything similar.

## Directory Structure Conventions

### CLI Code Organization

**`src/cli/`**: Contains only actual CLI command implementations

- Command files (e.g., `install.ts`, `run.ts`)
- Command directories with `index.ts` and subcommands (e.g., `host/`, `server/`)
- Entry points and command routing

**`src/cli-helpers/`**: Contains UI-focused helper utilities used by CLI commands

- Interactive prompt components (e.g., `multi-host-toggle.ts`)
- State machines for complex flows
- Navigation prompts and user interface logic
- Reusable CLI interaction patterns

**`src/installer/`**: Contains installation and configuration management logic

- Host-specific configuration generators
- Package managers (node, python, container)
- File system operations and project discovery
- Server detection and transformation logic
- Lock file management

This separation ensures clean architecture where CLI commands focus on argument parsing and flow control, while implementation logic resides in appropriate specialized directories.

## Scratch Scripts and Tests

ALL scratch scripts should be either in ./tmp or ./packages/cli/tmp. It is CRITICAL that no debug files, exploration scripts, manual tests not created by a human user, etc. are outside of these directories.
