import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost } from "../lib/api.js";
import { requireCollection } from "../lib/state.js";

export function registerEntityTools(server: McpServer) {
  server.tool(
    "create_entities",
    "Create new entities in the knowledge graph. Each entity has a name, entityType (becomes the record type/table), and observations (array of string facts about the entity). Provenance is automatically tracked.",
    {
      entities: z.array(z.object({
        name: z.string().describe("Entity name (e.g. 'Sarah Chen')"),
        entityType: z.string().describe("Entity type — becomes the SurrealDB table (e.g. 'person', 'project', 'organization')"),
        observations: z.array(z.string()).describe("Facts about this entity"),
      })).describe("Entities to create"),
    },
    async ({ entities }) => {
      const col = requireCollection();
      const results = [];

      for (const entity of entities) {
        try {
          const result = await apiPost(`/api/collections/${col.id}/graph/write`, {
            record_type: entity.entityType,
            data: {
              name: entity.name,
              _observations: entity.observations,
            },
            source: "lattice-mcp",
          });
          results.push({ name: entity.name, status: "created", result });
        } catch (err: any) {
          results.push({ name: entity.name, status: "error", error: err.message });
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    "delete_entities",
    "Delete entities from the knowledge graph by their full SurrealDB ID (e.g. 'person:sarah_chen').",
    {
      entityIds: z.array(z.string()).describe("Entity IDs to delete (e.g. ['person:sarah_chen', 'project:alpha'])"),
    },
    async ({ entityIds }) => {
      const col = requireCollection();

      try {
        const result = await apiPost(`/api/collections/${col.id}/graph/delete`, {
          ids: entityIds,
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
    "open_nodes",
    "Get specific entities by their names or IDs, including their relationships. Returns full entity data with incoming and outgoing edges.",
    {
      names: z.array(z.string()).describe("Entity names or SurrealDB IDs (e.g. ['Sarah Chen', 'person:sarah_chen'])"),
    },
    async ({ names }) => {
      const col = requireCollection();
      const results = [];

      for (const name of names) {
        try {
          // If it looks like a SurrealDB ID (contains ":"), fetch directly
          if (name.includes(":")) {
            const data = await apiGet(`/api/collections/${col.id}/graph/entity/${name}`);
            results.push(data);
          } else {
            // Search by name
            const searchResult = await apiPost(`/api/collections/${col.id}/graph/query`, {
              query: `SELECT * FROM (SELECT * FROM _record_types).slug AS types LET $results = (SELECT * FROM type::thing($types, '') WHERE name CONTAINS '${name.replace(/'/g, "''")}'); RETURN $results;`,
            });
            // Fallback: search across common text fields
            const fallback = await apiPost(`/api/collections/${col.id}/graph/search`, {
              query: name,
              limit: 5,
            });
            results.push({ name, matches: fallback });
          }
        } catch (err: any) {
          results.push({ name, error: err.message });
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );
}
