import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost } from "../lib/api.js";
import { requireCollection } from "../lib/state.js";

export function registerObservationTools(server: McpServer) {
  server.tool(
    "add_observations",
    "Add new observations (string facts) to existing entities in the knowledge graph. Observations are appended to the entity's _observations array.",
    {
      observations: z.array(z.object({
        entityId: z.string().describe("Entity ID (e.g. 'person:sarah_chen')"),
        contents: z.array(z.string()).describe("New observations to add"),
      })).describe("Observations to add per entity"),
    },
    async ({ observations }) => {
      const col = requireCollection();
      const results = [];

      for (const obs of observations) {
        try {
          // Append to the _observations array using SurrealQL
          const escaped = obs.contents.map(c => c.replace(/'/g, "''"));
          const arrayLiteral = `[${escaped.map(c => `'${c}'`).join(", ")}]`;
          const result = await apiPost(`/api/collections/${col.id}/graph/query`, {
            query: `UPDATE ${obs.entityId} SET _observations += ${arrayLiteral};`,
          });
          results.push({ entityId: obs.entityId, added: obs.contents.length, result });
        } catch (err: any) {
          results.push({ entityId: obs.entityId, error: err.message });
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    "delete_observations",
    "Remove specific observations from entities. Matches by exact string.",
    {
      deletions: z.array(z.object({
        entityId: z.string().describe("Entity ID"),
        observations: z.array(z.string()).describe("Exact observation strings to remove"),
      })).describe("Observations to remove per entity"),
    },
    async ({ deletions }) => {
      const col = requireCollection();
      const results = [];

      for (const del of deletions) {
        try {
          // Remove specific items from the _observations array
          const escaped = del.observations.map(o => o.replace(/'/g, "''"));
          const arrayLiteral = `[${escaped.map(o => `'${o}'`).join(", ")}]`;
          const result = await apiPost(`/api/collections/${col.id}/graph/query`, {
            query: `UPDATE ${del.entityId} SET _observations -= ${arrayLiteral};`,
          });
          results.push({ entityId: del.entityId, removed: del.observations.length, result });
        } catch (err: any) {
          results.push({ entityId: del.entityId, error: err.message });
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );
}
