/**
 * Token storage — persists the JWT to disk.
 * Stored in ~/.lattice/token.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface StoredToken {
  jwt: string;
  email: string;
  name: string;
  groups: string[];
  issuedAt: string;
  expiresAt: string;
  latticeUrl: string;
}

const LATTICE_DIR = join(homedir(), ".lattice");
const TOKEN_FILE = join(LATTICE_DIR, "token.json");

export function loadToken(): StoredToken | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null;
    const data = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));

    // Check expiry
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      console.error("[lattice] Token expired. Please re-authenticate.");
      deleteToken();
      return null;
    }

    return data as StoredToken;
  } catch {
    return null;
  }
}

export function saveToken(token: StoredToken): void {
  if (!existsSync(LATTICE_DIR)) {
    mkdirSync(LATTICE_DIR, { recursive: true });
  }
  writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
}

export function deleteToken(): void {
  try {
    if (existsSync(TOKEN_FILE)) unlinkSync(TOKEN_FILE);
  } catch {}
}
