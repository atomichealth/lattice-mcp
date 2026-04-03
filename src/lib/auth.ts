/**
 * Authentication flow for the Lattice MCP.
 *
 * 1. Start a temporary localhost HTTP server on a random port
 * 2. Open browser to {LATTICE_URL}/auth/mcp?callback=http://localhost:PORT/callback
 * 3. Lattice API initiates Google OAuth (domain-restricted to admin domains)
 * 4. On success, API redirects to localhost with JWT + user info
 * 5. MCP stores the token and closes the server
 *
 * This mirrors the Notion MCP auth pattern — browser-based OAuth with
 * localhost callback.
 */

import { createServer, type Server } from "node:http";
import { URL } from "node:url";
import { saveToken, type StoredToken } from "./token.js";
import { LATTICE_URL } from "./config.js";

/** Auth landing page HTML served at the callback */
function successPage(email: string, name: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lattice — Authenticated</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0a;
      color: #fafafa;
    }
    .card {
      text-align: center;
      padding: 48px;
      max-width: 420px;
    }
    .logo {
      width: 48px;
      height: 48px;
      margin: 0 auto 24px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo svg { width: 24px; height: 24px; }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .user {
      color: #a1a1aa;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .user strong { color: #fafafa; }
    .hint {
      color: #71717a;
      font-size: 13px;
      margin-top: 16px;
    }
    .check {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: #22c55e;
      border-radius: 50%;
      margin-bottom: 16px;
    }
    .check svg { width: 18px; height: 18px; stroke: white; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    </div>
    <div class="check">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <h1>Connected to Lattice</h1>
    <p class="user">Signed in as <strong>${name}</strong></p>
    <p class="user">${email}</p>
    <p class="hint">You can close this tab and return to Claude Code.</p>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Lattice — Authentication Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #0a0a0a; color: #fafafa;
    }
    .card { text-align: center; padding: 48px; max-width: 420px; }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; color: #ef4444; }
    p { color: #a1a1aa; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authentication Failed</h1>
    <p>${message}</p>
    <p style="margin-top: 16px; color: #71717a; font-size: 13px;">Please close this tab and try again.</p>
  </div>
</body>
</html>`;
}

export async function authenticate(): Promise<StoredToken> {
  // Allow pre-provided token via env
  const envToken = process.env.LATTICE_TOKEN;
  if (envToken) {
    const token: StoredToken = {
      jwt: envToken,
      email: "env-token",
      name: "Environment Token",
      groups: [],
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      latticeUrl: LATTICE_URL,
    };
    saveToken(token);
    return token;
  }

  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost`);

      if (url.pathname === "/callback") {
        const jwt = url.searchParams.get("token");
        const email = url.searchParams.get("email");
        const name = url.searchParams.get("name");
        const groups = url.searchParams.get("groups");
        const expiresAt = url.searchParams.get("expires");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(errorPage(error));
          reject(new Error(error));
          setTimeout(() => server.close(), 1000);
          return;
        }

        if (!jwt || !email) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(errorPage("Missing authentication parameters. Please try again."));
          reject(new Error("Missing token or email in callback"));
          setTimeout(() => server.close(), 1000);
          return;
        }

        const token: StoredToken = {
          jwt,
          email,
          name: name || email.split("@")[0],
          groups: groups ? groups.split(",") : [],
          issuedAt: new Date().toISOString(),
          expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          latticeUrl: LATTICE_URL,
        };

        saveToken(token);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(successPage(email, token.name));

        resolve(token);
        setTimeout(() => server.close(), 1000);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    // Listen on random available port
    server.listen(0, "127.0.0.1", async () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to start auth server"));
        return;
      }

      const port = addr.port;
      const callbackUrl = `http://127.0.0.1:${port}/callback`;
      const authUrl = `${LATTICE_URL}/auth/mcp?callback=${encodeURIComponent(callbackUrl)}`;

      console.error(`[lattice] Opening browser for authentication...`);
      console.error(`[lattice] If browser doesn't open, visit: ${authUrl}`);

      try {
        const open = (await import("open")).default;
        await open(authUrl);
      } catch {
        console.error(`[lattice] Could not open browser automatically.`);
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out (5 minutes)"));
    }, 5 * 60 * 1000);
  });
}
