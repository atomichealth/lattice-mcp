import { describe, it, expect } from "vitest";
import { createServer } from "node:http";

/**
 * Tests the localhost callback server that the MCP auth flow uses.
 * Simulates what the Lattice API redirect does after successful OAuth.
 */

function startCallbackServer(): Promise<{ port: number; close: () => void; result: Promise<Record<string, string>> }> {
  return new Promise((resolve) => {
    let resolveResult: (value: Record<string, string>) => void;
    const resultPromise = new Promise<Record<string, string>>((r) => { resolveResult = r; });

    const server = createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost`);

      if (url.pathname === "/callback") {
        const params: Record<string, string> = {};
        url.searchParams.forEach((v, k) => { params[k] = v; });

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body>OK</body></html>");
        resolveResult(params);
        setTimeout(() => server.close(), 100);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("Failed to bind");
      resolve({
        port: addr.port,
        close: () => server.close(),
        result: resultPromise,
      });
    });
  });
}

describe("auth callback server", () => {
  it("receives token parameters from OAuth redirect", async () => {
    const { port, result } = await startCallbackServer();

    // Simulate the Lattice API redirecting back with JWT
    const params = new URLSearchParams({
      token: "jwt-abc123",
      email: "user@atomichealth.com",
      name: "Test User",
      groups: "everyone,admins",
      expires: "2026-04-04T00:00:00.000Z",
    });

    const res = await fetch(`http://127.0.0.1:${port}/callback?${params}`);
    expect(res.status).toBe(200);

    const received = await result;
    expect(received.token).toBe("jwt-abc123");
    expect(received.email).toBe("user@atomichealth.com");
    expect(received.name).toBe("Test User");
    expect(received.groups).toBe("everyone,admins");
  });

  it("returns 404 for non-callback paths", async () => {
    const { port, close } = await startCallbackServer();

    const res = await fetch(`http://127.0.0.1:${port}/random`);
    expect(res.status).toBe(404);
    close();
  });

  it("handles error parameter from failed OAuth", async () => {
    const { port, result } = await startCallbackServer();

    const params = new URLSearchParams({
      error: "Domain not allowed",
    });

    const res = await fetch(`http://127.0.0.1:${port}/callback?${params}`);
    expect(res.status).toBe(200);

    const received = await result;
    expect(received.error).toBe("Domain not allowed");
    expect(received.token).toBeUndefined();
  });
});
