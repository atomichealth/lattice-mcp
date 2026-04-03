import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost } from "../lib/api.js";
import { requireCollection } from "../lib/state.js";

export function registerQueryTools(server: McpServer) {
  server.tool(
    "read_graph",
    "Read the entire knowledge graph — all entities and their relationships. For large graphs, results are limited. Use discover_schema first to understand the graph structure.",
    {
      limit: z.number().optional().default(100).describe("Max entities per type (default 100)"),
    },
    async ({ limit }) => {
      const col = requireCollection();

      try {
        // Get all types
        const types = await apiGet(`/api/collections/${col.id}/graph/types`);
        const entities: any[] = [];
        const relations: any[] = [];

        for (const t of types) {
          if (t.is_edge) {
            // Fetch edges
            const edgeResult = await apiPost(`/api/collections/${col.id}/graph/query`, {
              query: `SELECT * FROM \`${t.name}\` LIMIT ${limit};`,
            });
            const edges = edgeResult?.[0]?.result || [];
            for (const edge of edges) {
              relations.push({
                id: edge.id,
                from: edge.in,
                to: edge.out,
                relationType: t.name,
                ...edge,
              });
            }
          } else {
            // Fetch entities
            const data = await apiGet(`/api/collections/${col.id}/graph/entities/${t.name}?limit=${limit}`);
            for (const entity of (data.entities || [])) {
              entities.push({
                ...entity,
                entityType: t.name,
              });
            }
          }
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ entities, relations }, null, 2),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "search_nodes",
    "Search for entities in the knowledge graph by query string. Searches across entity names and observations.",
    {
      query: z.string().describe("Search query (e.g. 'Sarah', 'Nike project', 'Q4 revenue')"),
      types: z.array(z.string()).optional().describe("Filter by entity types (e.g. ['person', 'project'])"),
      limit: z.number().optional().default(20).describe("Max results"),
    },
    async ({ query, types, limit }) => {
      const col = requireCollection();

      try {
        const result = await apiPost(`/api/collections/${col.id}/graph/search`, {
          query,
          types,
          limit,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "discover_schema",
    "Discover the knowledge graph schema — what record types exist, their field counts, record counts, and whether they are entity types or edge types.",
    {},
    async () => {
      const col = requireCollection();

      try {
        const types = await apiGet(`/api/collections/${col.id}/graph/types`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(types, null, 2) }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "resolve_entity",
    "Check if an entity already exists before creating it. Returns exact matches, fuzzy matches with similarity scores, and a recommendation. Use this to avoid creating duplicate entities.",
    {
      entityType: z.string().describe("Record type to search (e.g. 'person', 'organization')"),
      name: z.string().optional().describe("Name to match against"),
      email: z.string().optional().describe("Email for exact matching"),
    },
    async ({ entityType, name, email }) => {
      const col = requireCollection();

      try {
        const result = await apiPost(`/api/collections/${col.id}/graph/resolve`, {
          record_type: entityType,
          name,
          email,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
