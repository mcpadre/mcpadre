// pattern: Imperative Shell

import { Command } from "@commander-js/extra-typings";

import { CLI_LOGGER } from "./_deps.js";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeHelloCommand() {
  return new Command("hello")
    .description("Say hello to the world")
    .action(() => {
      CLI_LOGGER.info("Hello, World!");
      CLI_LOGGER.debug("Hello command executed successfully");
      CLI_LOGGER.warn("Send in the clowns!");
    });
}
