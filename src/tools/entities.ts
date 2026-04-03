import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost } from "../lib/api.js";
import { requireCollection } from "../lib/state.js";

/** Structured observation — richer than a bare string */
const ObservationSchema = z.object({
  text: z.string().describe("The observation fact (e.g. 'Prefers morning meetings')"),
  source: z.string().optional().describe("Where this was learned (e.g. 'slack_msg:123', 'meeting_transcript')"),
  confidence: z.number().min(0).max(1).optional().default(1.0)
    .describe("How certain is this fact? 1.0 = verified, 0.5 = inferred"),
});

export function registerEntityTools(server: McpServer) {
  server.tool(
    "create_entities",
    `Create new entities in the knowledge graph. Each entity has:
- name: the entity's display name
- entityType: becomes the SurrealDB table (e.g. 'person', 'project', 'organization')
- observations: structured facts about the entity, each with text + optional source and confidence
- attributes: optional typed fields (email, role, revenue, etc.)

Provenance (who created, when) is automatically tracked. Call resolve_entity first to check for duplicates.`,
    {
      entities: z.array(z.object({
        name: z.string().describe("Entity name (e.g. 'Sarah Chen')"),
        entityType: z.string().describe("Entity type — becomes the SurrealDB table (e.g. 'person', 'project', 'organization')"),
        observations: z.array(ObservationSchema).describe("Structured facts about this entity"),
        attributes: z.record(z.any()).optional().describe("Typed fields (e.g. { email: 'sarah@acme.com', role: 'Designer' })"),
      })).describe("Entities to create"),
    },
    async ({ entities }) => {
      const col = requireCollection();
      const results = [];

      for (const entity of entities) {
        try {
          // Build observations with timestamps
          const observations = entity.observations.map(obs => ({
            text: obs.text,
            source: obs.source || "lattice-mcp",
            confidence: obs.confidence ?? 1.0,
            created_at: new Date().toISOString(),
          }));

          const result = await apiPost(`/api/collections/${col.id}/graph/write`, {
            record_type: entity.entityType,
            data: {
              name: entity.name,
              ...(entity.attributes || {}),
              _observations: observations,
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
    "Delete entities from the knowledge graph by their full SurrealDB ID (e.g. 'person:sarah_chen'). This is a hard delete — the entity and all its edges are permanently removed. For facts/relations, prefer invalidate_relations instead.",
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
    "Get specific entities by their names or IDs, including their current (non-invalidated) relationships. Returns full entity data with incoming and outgoing edges.",
    {
      names: z.array(z.string()).describe("Entity names or SurrealDB IDs (e.g. ['Sarah Chen', 'person:sarah_chen'])"),
    },
    async ({ names }) => {
      const col = requireCollection();
      const results = [];

      for (const name of names) {
        try {
          if (name.includes(":")) {
            const data = await apiGet(`/api/collections/${col.id}/graph/entity/${name}`);
            results.push(data);
          } else {
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
