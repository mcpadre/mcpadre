// pattern: Functional Core
// Generic function to create pipeline targets from any MCP client

import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../../test-utils/json-rpc/types.js";
import type { PipelineTarget } from "../../pipeline/types.js";
import type { BaseMcpClient } from "./base-client.js";

/**
 * Create a generic pipeline target from any MCP client
 * Allows any client implementing the send method to be used as terminal handlers in the pipeline
 */
export function createTarget(client: BaseMcpClient): PipelineTarget {
  return async (request: JsonRpcRequest): Promise<JsonRpcResponse> => {
    return client.send(request);
  };
}
