import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost } from "../lib/api.js";
import { requireCollection } from "../lib/state.js";

export function registerObservationTools(server: McpServer) {
  server.tool(
    "add_observations",
    `Add structured observations to existing entities. Each observation is an object with:
- text: the fact itself
- source: where this was learned (optional)
- confidence: certainty score 0.0-1.0 (optional, defaults to 1.0)

Observations are appended to the entity's _observations array with automatic timestamps. This is the primary way to accumulate knowledge about entities over time.`,
    {
      observations: z.array(z.object({
        entityId: z.string().describe("Entity ID (e.g. 'person:sarah_chen')"),
        contents: z.array(z.object({
          text: z.string().describe("The observation fact"),
          source: z.string().optional().describe("Where this was learned"),
          confidence: z.number().min(0).max(1).optional().default(1.0).describe("Certainty score"),
        })).describe("Structured observations to add"),
      })).describe("Observations to add per entity"),
    },
    async ({ observations }) => {
      const col = requireCollection();
      const results = [];

      for (const obs of observations) {
        try {
          // Build structured observation objects
          const newObs = obs.contents.map(c => ({
            text: c.text,
            source: c.source || "lattice-mcp",
            confidence: c.confidence ?? 1.0,
            created_at: new Date().toISOString(),
          }));

          const obsJson = JSON.stringify(newObs);
          const result = await apiPost(`/api/collections/${col.id}/graph/query`, {
            query: `UPDATE ${obs.entityId} SET _observations += ${obsJson};`,
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
    "Remove specific observations from entities by matching the observation text exactly. The observation object is removed from the _observations array.",
    {
      deletions: z.array(z.object({
        entityId: z.string().describe("Entity ID"),
        texts: z.array(z.string()).describe("Exact observation text strings to remove"),
      })).describe("Observations to remove per entity"),
    },
    async ({ deletions }) => {
      const col = requireCollection();
      const results = [];

      for (const del of deletions) {
        try {
          // Remove observations where text matches any of the given strings
          // We filter out matching objects from the array
          const textsJson = JSON.stringify(del.texts);
          const result = await apiPost(`/api/collections/${col.id}/graph/query`, {
            query: `UPDATE ${del.entityId} SET _observations = array::filter(_observations, |$obs| !${textsJson}.contains($obs.text));`,
          });
          results.push({ entityId: del.entityId, removed: del.texts.length, result });
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
