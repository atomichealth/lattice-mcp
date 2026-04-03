import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost } from "../lib/api.js";
import { requireCollection } from "../lib/state.js";

export function registerRelationTools(server: McpServer) {
  server.tool(
    "create_relations",
    `Create relationships (edges) between entities in the knowledge graph. Each relation has:
- from/to: source and target entity IDs
- relationType: edge table name (e.g. 'WORKS_ON', 'MANAGES')
- fact: human-readable description of this relationship
- valid_at: when this fact became true in reality (optional, defaults to now)
- confidence: how certain is this relationship (0.0-1.0)
- source: where this was learned from

Relations are bi-temporal: they track both when the fact is true (valid_at/invalid_at) and when the system learned it (created_at). Relations are never hard-deleted — use invalidate_relations to mark them as no longer true.`,
    {
      relations: z.array(z.object({
        from: z.string().describe("Source entity ID (e.g. 'person:sarah_chen')"),
        to: z.string().describe("Target entity ID (e.g. 'project:nike_rebrand')"),
        relationType: z.string().describe("Relationship type — becomes the edge table (e.g. 'WORKS_ON', 'MANAGES', 'BELONGS_TO')"),
        fact: z.string().optional().describe("Human-readable fact (e.g. 'Sarah leads the Nike rebrand project')"),
        valid_at: z.string().optional().describe("When this fact became true (ISO 8601). Defaults to now."),
        confidence: z.number().min(0).max(1).optional().default(1.0).describe("Confidence score (1.0 = verified, lower = inferred)"),
        source: z.string().optional().describe("Where this was learned (e.g. 'gong_transcript:123')"),
        properties: z.record(z.any()).optional().describe("Additional edge properties (e.g. { role: 'lead' })"),
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
            properties: {
              ...(rel.properties || {}),
              fact: rel.fact,
              valid_at: rel.valid_at || new Date().toISOString(),
              invalid_at: null,
              confidence: rel.confidence ?? 1.0,
              source: rel.source || "lattice-mcp",
            },
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
    "invalidate_relations",
    `Mark relations as no longer true by setting their invalid_at timestamp. This is a soft-delete — the relation remains in the graph for historical queries but is excluded from current-state queries. Use this instead of delete_relations when a fact was once true but is no longer (e.g. someone changed jobs, a project ended).`,
    {
      relationIds: z.array(z.string()).describe("Relation/edge IDs to invalidate (e.g. ['WORKS_ON:abc123'])"),
      invalid_at: z.string().optional().describe("When this fact stopped being true (ISO 8601). Defaults to now."),
      reason: z.string().optional().describe("Why this relation is being invalidated"),
    },
    async ({ relationIds, invalid_at, reason }) => {
      const col = requireCollection();
      const results = [];
      const timestamp = invalid_at || new Date().toISOString();

      for (const id of relationIds) {
        try {
          const result = await apiPost(`/api/collections/${col.id}/graph/query`, {
            query: `UPDATE ${id} SET invalid_at = '${timestamp}'${reason ? `, _invalidation_reason = '${reason.replace(/'/g, "''")}'` : ""};`,
          });
          results.push({ id, status: "invalidated", invalid_at: timestamp });
        } catch (err: any) {
          results.push({ id, status: "error", error: err.message });
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    "delete_relations",
    "Hard-delete relations from the knowledge graph. WARNING: This permanently removes the edge — no historical record is kept. Prefer invalidate_relations for facts that were once true but are no longer.",
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
