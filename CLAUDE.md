# Lattice MCP

MCP server for the Lattice knowledge graph. `@atomichealth/lattice-mcp` on npm.

**Git**: `git@github.com:atomichealth/lattice-mcp.git` | SSH key `~/.ssh/id_dev360_rsa` | author `c.toivola@gmail.com`

## Knowledge Graph Principles

These are load-bearing — do not compromise.

1. **Bi-temporal edges**: Every relation has `valid_at`/`invalid_at`. Facts are invalidated, never hard-deleted. Enables historical queries and audit trails.
2. **Structured observations**: `{ text, source, confidence, created_at }` — not bare strings. Every fact tracks provenance.
3. **Provenance on everything**: `_provenance` with created_by, confidence, source, derived_from on every entity and edge.
4. **Typed fields + observations**: Entities support structured attributes (email, role) AND freeform observations. SurrealDB tables are schemaless.
5. **SurrealDB stays**: Multi-model advantage (graph + vector + FTS). FalkorDB is the escape hatch if perf bottlenecks at 80K+ records.
6. **Semantic tools over raw queries**: Guide agents toward create_entities/create_relations. Raw SurrealQL is the escape hatch, not the default.

## Stack

- stdio transport, MCP SDK ^1.28.0, zod for tool schemas
- Auth: Google SSO via Lattice API `/auth/mcp` → localhost callback → `~/.lattice/token.json`
- API: `https://lattice.atomic.health` (override with `LATTICE_URL`)
- Semantic release on push to `main`. Secret: `NPM_TOKEN`.

## Dev

```bash
npm test          # 102 tests (vitest)
npm run build     # tsc → dist/
```
