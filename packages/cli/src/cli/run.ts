// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import { runMcpServer } from "../runner/index.js";

import { withConfigContextAndErrorHandling } from "./_utils/with-config-context-and-error-handling.js";
import { CLI_LOGGER } from "./_deps.js";
import { getUserDir } from "./_globals.js";

import type { SettingsProject, SettingsUser } from "../config/types/index.js";
import type { ConfigContext } from "./_utils/contexts/index.js";

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
          context: ConfigContext,
          config: SettingsProject | SettingsUser,
          serverName: string
        ) => {
          const configType = context.getConfigTypeName();
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

          // Common options for runMcpServer
          const runOptions = {
            serverName,
            serverConfig,
            projectConfig: config as SettingsProject, // runMcpServer expects a SettingsProject
            logger: CLI_LOGGER,
          };

          // Add user-specific options if in user mode
          if (context.type === "user") {
            await runMcpServer({
              ...runOptions,
              isUserMode: true,
              userDir: getUserDir(),
            });
          } else {
            await runMcpServer(runOptions);
          }
        }
      )
    );
}
