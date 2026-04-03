import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost } from "../lib/api.js";
import { requireCollection } from "../lib/state.js";

export function registerQueryTools(server: McpServer) {
  server.tool(
    "read_graph",
    "Read the current state of the knowledge graph — all entities and their active (non-invalidated) relationships. For large graphs, results are limited per type. Use discover_schema first to understand the graph structure.",
    {
      limit: z.number().optional().default(100).describe("Max entities per type (default 100)"),
      include_invalidated: z.boolean().optional().default(false).describe("Include invalidated/historical relations (default false)"),
    },
    async ({ limit, include_invalidated }) => {
      const col = requireCollection();

      try {
        const types = await apiGet(`/api/collections/${col.id}/graph/types`);
        const entities: any[] = [];
        const relations: any[] = [];

        for (const t of types) {
          if (t.is_edge) {
            const whereClause = include_invalidated ? "" : " WHERE invalid_at = NONE OR invalid_at = NULL";
            const edgeResult = await apiPost(`/api/collections/${col.id}/graph/query`, {
              query: `SELECT * FROM \`${t.name}\`${whereClause} LIMIT ${limit};`,
            });
            const edges = edgeResult?.[0]?.result || [];
            for (const edge of edges) {
              relations.push({
                id: edge.id,
                from: edge.in,
                to: edge.out,
                relationType: t.name,
                fact: edge.fact,
                valid_at: edge.valid_at,
                invalid_at: edge.invalid_at,
                confidence: edge.confidence,
                source: edge.source,
              });
            }
          } else {
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
    "Search for entities in the knowledge graph by query string. Searches across entity names and observation text.",
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
    "Discover the knowledge graph schema — what record types exist, their field counts, record counts, and whether they are entity types or edge types. Call this before writing to understand the graph structure.",
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
    "Check if an entity already exists before creating it. Returns exact matches, fuzzy matches with similarity scores, and a recommendation. ALWAYS call this before create_entities to avoid duplicates.",
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

  server.tool(
    "graph_timeline",
    `Show the temporal evolution of an entity's relationships. Returns all relations (current and historical) sorted by valid_at, showing when facts became true and when they were invalidated. This gives a chronological view of how an entity's connections changed over time.`,
    {
      entityId: z.string().describe("Entity ID (e.g. 'person:sarah_chen')"),
      edgeType: z.string().optional().describe("Filter by edge type (e.g. 'WORKS_ON'). Omit for all types."),
      since: z.string().optional().describe("Only show relations valid after this date (ISO 8601)"),
    },
    async ({ entityId, edgeType, since }) => {
      const col = requireCollection();

      try {
        // Get the entity itself
        const entity = await apiGet(`/api/collections/${col.id}/graph/entity/${entityId}`);

        // Build timeline from outgoing and incoming edges
        const timeline: any[] = [];

        // Get all outgoing edges (including invalidated)
        const outQuery = edgeType
          ? `SELECT *, 'outgoing' AS _direction FROM ${entityId}->${edgeType} ORDER BY valid_at ASC;`
          : `SELECT *, 'outgoing' AS _direction FROM ${entityId}->? ORDER BY valid_at ASC;`;

        const inQuery = edgeType
          ? `SELECT *, 'incoming' AS _direction FROM ${entityId}<-${edgeType} ORDER BY valid_at ASC;`
          : `SELECT *, 'incoming' AS _direction FROM ${entityId}<-? ORDER BY valid_at ASC;`;

        const [outResult, inResult] = await Promise.all([
          apiPost(`/api/collections/${col.id}/graph/query`, { query: outQuery }),
          apiPost(`/api/collections/${col.id}/graph/query`, { query: inQuery }),
        ]);

        const outEdges = outResult?.[0]?.result || [];
        const inEdges = inResult?.[0]?.result || [];

        for (const edge of [...outEdges, ...inEdges]) {
          const entry = {
            id: edge.id,
            direction: edge._direction,
            fact: edge.fact,
            from: edge.in,
            to: edge.out,
            valid_at: edge.valid_at,
            invalid_at: edge.invalid_at,
            is_current: !edge.invalid_at,
            confidence: edge.confidence,
            source: edge.source,
          };

          // Filter by since date if provided
          if (since && entry.valid_at && new Date(entry.valid_at) < new Date(since)) {
            continue;
          }

          timeline.push(entry);
        }

        // Sort by valid_at
        timeline.sort((a, b) => {
          const aDate = a.valid_at ? new Date(a.valid_at).getTime() : 0;
          const bDate = b.valid_at ? new Date(b.valid_at).getTime() : 0;
          return aDate - bDate;
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              entity: entity.entity,
              timeline,
              current_relations: timeline.filter(t => t.is_current).length,
              historical_relations: timeline.filter(t => !t.is_current).length,
            }, null, 2),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
