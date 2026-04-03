/**
 * HTTP client for the Lattice API.
 * All requests include the JWT for authentication.
 * Auto-triggers re-auth on 401.
 */

import { LATTICE_URL } from "./config.js";
import { loadToken, deleteToken } from "./token.js";

function getHeaders(): Record<string, string> {
  const token = loadToken();
  if (!token) throw new Error("Not authenticated. Restart lattice-mcp to log in.");

  return {
    Authorization: `Bearer ${token.jwt}`,
    "Content-Type": "application/json",
  };
}

export async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${LATTICE_URL}${path}`, {
    headers: getHeaders(),
  });

  if (res.status === 401) {
    deleteToken();
    throw new Error("Token expired or revoked. Please restart lattice-mcp to re-authenticate.");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function apiPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${LATTICE_URL}${path}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    deleteToken();
    throw new Error("Token expired or revoked. Please restart lattice-mcp to re-authenticate.");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}
