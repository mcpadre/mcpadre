// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import { runMcpServer } from "../runner/index.js";

import { withConfigContextAndErrorHandling } from "./_utils/with-config-context-and-error-handling.js";
import { CLI_LOGGER } from "./_deps.js";

import type { WorkspaceContext } from "../config/types/index.js";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeRunCommand() {
  return new Command("run")
    .description("Run an MCP server from project or user configuration")
    .argument(
      "<server-name>",
      "Name of the server to run from mcpServers config"
    )

    .action(
      withConfigContextAndErrorHandling(
        async (
          context: WorkspaceContext,
          config: WorkspaceContext["mergedConfig"],
          serverName: string
        ) => {
          const configType = context.workspaceType;
          CLI_LOGGER.info(`Starting ${configType} MCP server: ${serverName}`);

          // Extract named server from mcpServers config
          const serverConfig = config.mcpServers[serverName];
          if (!serverConfig) {
            const availableServers = Object.keys(config.mcpServers);
            CLI_LOGGER.error(
              `Server '${serverName}' not found in ${configType} configuration. Available servers: ${availableServers.join(", ")}`
            );
            process.exit(1);
          }

          // Run the MCP server with workspace context
          await runMcpServer({
            serverName,
            serverConfig,
            context,
            logger: CLI_LOGGER,
          });
        }
      )
    );
}
