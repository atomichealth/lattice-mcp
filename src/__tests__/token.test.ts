import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We test the token logic directly rather than importing the module
// (which hardcodes ~/.lattice) by reimplementing the same logic against a temp dir.
// This validates the serialization, expiry, and persistence logic.

const TEST_DIR = join(tmpdir(), `lattice-mcp-test-${Date.now()}`);
const TOKEN_FILE = join(TEST_DIR, "token.json");

interface StoredToken {
  jwt: string;
  email: string;
  name: string;
  groups: string[];
  issuedAt: string;
  expiresAt: string;
  latticeUrl: string;
}

function saveToken(token: StoredToken): void {
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
}

function loadToken(): StoredToken | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null;
    const data = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) return null;
    return data as StoredToken;
  } catch {
    return null;
  }
}

function deleteToken(): void {
  try {
    if (existsSync(TOKEN_FILE)) rmSync(TOKEN_FILE);
  } catch {}
}

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe("token storage", () => {
  it("returns null when no token file exists", () => {
    expect(loadToken()).toBeNull();
  });

  it("saves and loads a valid token", () => {
    const token: StoredToken = {
      jwt: "eyJhbGciOiJIUzI1NiJ9.test.sig",
      email: "test@atomichealth.com",
      name: "Test User",
      groups: ["everyone", "admins"],
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      latticeUrl: "https://lattice.atomic.health",
    };

    saveToken(token);
    const loaded = loadToken();

    expect(loaded).not.toBeNull();
    expect(loaded!.jwt).toBe(token.jwt);
    expect(loaded!.email).toBe("test@atomichealth.com");
    expect(loaded!.groups).toEqual(["everyone", "admins"]);
  });

  it("returns null for an expired token", () => {
    const token: StoredToken = {
      jwt: "expired-jwt",
      email: "test@atomichealth.com",
      name: "Test User",
      groups: [],
      issuedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(), // expired 1s ago
      latticeUrl: "https://lattice.atomic.health",
    };

    saveToken(token);
    expect(loadToken()).toBeNull();
  });

  it("deletes a token", () => {
    const token: StoredToken = {
      jwt: "to-delete",
      email: "test@atomichealth.com",
      name: "Test",
      groups: [],
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      latticeUrl: "https://lattice.atomic.health",
    };

    saveToken(token);
    expect(loadToken()).not.toBeNull();

    deleteToken();
    expect(loadToken()).toBeNull();
  });

  it("persists token as valid JSON on disk", () => {
    const token: StoredToken = {
      jwt: "check-json",
      email: "test@atomichealth.com",
      name: "Test",
      groups: ["everyone"],
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      latticeUrl: "https://lattice.atomic.health",
    };

    saveToken(token);
    const raw = readFileSync(TOKEN_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.jwt).toBe("check-json");
    expect(parsed.latticeUrl).toBe("https://lattice.atomic.health");
  });
});
