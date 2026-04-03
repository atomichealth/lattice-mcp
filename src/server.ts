/**
 * Lattice MCP Server — tool registration and setup.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCollectionTools } from "./tools/collections.js";
import { registerEntityTools } from "./tools/entities.js";
import { registerRelationTools } from "./tools/relations.js";
import { registerObservationTools } from "./tools/observations.js";
import { registerQueryTools } from "./tools/query.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "lattice",
    version: "0.1.0",
  });

  registerCollectionTools(server);
  registerEntityTools(server);
  registerRelationTools(server);
  registerObservationTools(server);
  registerQueryTools(server);

  return server;
}
