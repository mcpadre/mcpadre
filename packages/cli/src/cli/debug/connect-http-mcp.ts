// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import { createTarget } from "../../runner/servers/common/target.js";
import { HttpMcpClient } from "../../runner/servers/http/client.js";
import { InteractiveSessionManager } from "../../runner/session/index.js";
import { CLI_LOGGER } from "../_deps.js";
import { withErrorHandling } from "../utils/with-error-handling.js";

import type { HttpMcpServer } from "../../config/types/index.js";

/**
 * Validate that a URL is HTTPS
 */
function validateHttpsUrl(url: string): void {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new Error(`Invalid URL: ${error}`);
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("URL must use HTTPS protocol for security");
  }
}

/**
 * Create the connect-http-mcp debug command
 */
export function makeConnectHttpMcpCommand(): Command<
  [string],
  Record<string, never>
> {
  return new Command("connect-http-mcp")
    .description("Connect to an HTTP MCP server for interactive debugging")
    .argument("<url>", "HTTPS URL of the MCP server")
    .action(
      withErrorHandling(async (url: string) => {
        // Validate URL
        validateHttpsUrl(url);
        CLI_LOGGER.info(`🔗 Connecting to MCP server at: ${url}`);

        // Create HTTP MCP client using existing infrastructure
        const config: HttpMcpServer = { http: { url } };
        const client = new HttpMcpClient(
          config,
          {},
          CLI_LOGGER,
          "debug-http-client"
        );
        const target = createTarget(client);

        // Create interactive session manager
        const sessionManager = new InteractiveSessionManager({
          target,
          logger: CLI_LOGGER,
        });

        // Start interactive session
        await sessionManager.start();
      })
    );
}
