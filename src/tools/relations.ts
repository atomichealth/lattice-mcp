import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost } from "../lib/api.js";
import { requireCollection } from "../lib/state.js";

export function registerRelationTools(server: McpServer) {
  server.tool(
    "create_relations",
    "Create relationships between entities in the knowledge graph. Each relation connects a source entity to a target entity with a named relationship type.",
    {
      relations: z.array(z.object({
        from: z.string().describe("Source entity ID (e.g. 'person:sarah_chen')"),
        to: z.string().describe("Target entity ID (e.g. 'project:nike_rebrand')"),
        relationType: z.string().describe("Relationship type — becomes the edge table (e.g. 'WORKS_ON', 'MANAGES', 'BELONGS_TO')"),
      })).describe("Relations to create"),
    },
    async ({ relations }) => {
      const col = requireCollection();
      const results = [];

      for (const rel of relations) {
        try {
          const result = await apiPost(`/api/collections/${col.id}/graph/relate`, {
            from: rel.from,
            to: rel.to,
            edge: rel.relationType,
          });
          results.push({ from: rel.from, to: rel.to, type: rel.relationType, status: "created", result });
        } catch (err: any) {
          results.push({ from: rel.from, to: rel.to, type: rel.relationType, status: "error", error: err.message });
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    "delete_relations",
    "Delete specific relations from the knowledge graph by their edge IDs.",
    {
      relationIds: z.array(z.string()).describe("Relation/edge IDs to delete (e.g. ['WORKS_ON:abc123'])"),
    },
    async ({ relationIds }) => {
      const col = requireCollection();

      try {
        const result = await apiPost(`/api/collections/${col.id}/graph/delete`, {
          ids: relationIds,
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
