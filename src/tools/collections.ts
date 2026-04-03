import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet } from "../lib/api.js";
import { setActiveCollection, getActiveCollection, type CollectionInfo } from "../lib/state.js";
import { LATTICE_COLLECTION } from "../lib/config.js";

export function registerCollectionTools(server: McpServer) {
  server.tool(
    "list_collections",
    "List all available knowledge graph collections. Each collection is a separate graph database. You must select a collection before using other graph tools.",
    {},
    async () => {
      try {
        const collections = await apiGet("/api/collections");
        const active = getActiveCollection();
        const list = collections.map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          active: active?.id === c.id,
        }));
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(list, null, 2),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "set_collection",
    "Select a collection to work with. All subsequent graph operations will target this collection. Use list_collections first to see available options.",
    {
      slug: z.string().describe("Collection slug (e.g. 'marketing', 'sales')"),
    },
    async ({ slug }) => {
      try {
        const collections = await apiGet("/api/collections");
        const col = collections.find((c: any) => c.slug === slug || c.name === slug || c.id === slug);
        if (!col) {
          const slugs = collections.map((c: any) => c.slug).join(", ");
          return {
            content: [{
              type: "text" as const,
              text: `Collection "${slug}" not found. Available: ${slugs}`,
            }],
            isError: true,
          };
        }

        setActiveCollection({
          id: col.id,
          name: col.name,
          slug: col.slug,
          surreal_db: col.surreal_db,
        });

        return {
          content: [{
            type: "text" as const,
            text: `Active collection set to "${col.name}" (${col.slug})`,
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // Auto-select collection from env if configured
  if (LATTICE_COLLECTION) {
    (async () => {
      try {
        const collections = await apiGet("/api/collections");
        const col = collections.find((c: any) => c.slug === LATTICE_COLLECTION);
        if (col) {
          setActiveCollection({
            id: col.id,
            name: col.name,
            slug: col.slug,
            surreal_db: col.surreal_db,
          });
          console.error(`[lattice] Auto-selected collection: ${col.name}`);
        }
      } catch {
        // Will be selected manually
      }
    })();
  }
}
