#!/usr/bin/env node

/**
 * Lattice MCP — entry point.
 *
 * Usage: npx @atomichealth/lattice-mcp
 *
 * Environment variables:
 *   LATTICE_URL        — Lattice API base URL (default: https://api.lattice.run)
 *   LATTICE_COLLECTION — Auto-select a collection by slug
 *   LATTICE_TOKEN      — Pre-provided JWT (skip browser OAuth)
 *
 * On first run, opens browser for Google SSO authentication.
 * On subsequent runs, uses stored token from ~/.lattice/token.json
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadToken } from "./lib/token.js";
import { authenticate } from "./lib/auth.js";
import { createServer } from "./server.js";

async function main() {
  // Check for existing token
  let token = loadToken();

  if (!token) {
    console.error("[lattice] No active session. Starting authentication...");
    try {
      token = await authenticate();
      console.error(`[lattice] Authenticated as ${token.name} (${token.email})`);
    } catch (err: any) {
      console.error(`[lattice] Authentication failed: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.error(`[lattice] Authenticated as ${token.name} (${token.email})`);
  }

  // Start MCP server
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[lattice] MCP server running");
}

main().catch((err) => {
  console.error(`[lattice] Fatal: ${err.message}`);
  process.exit(1);
});
