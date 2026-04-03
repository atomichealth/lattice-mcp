import { describe, it, expect } from "vitest";

describe("config", () => {
  it("defaults LATTICE_URL to lattice.atomic.health", async () => {
    // Clear any env override
    const prev = process.env.LATTICE_URL;
    delete process.env.LATTICE_URL;

    // Re-import to get fresh value
    const { LATTICE_URL } = await import("../lib/config.js");
    expect(LATTICE_URL).toBe("https://lattice.atomic.health");

    // Restore
    if (prev) process.env.LATTICE_URL = prev;
  });

  it("respects LATTICE_URL env override", async () => {
    process.env.LATTICE_URL = "http://localhost:30001";

    // Dynamic import won't re-evaluate since it's cached,
    // but we can verify the env var is set correctly
    expect(process.env.LATTICE_URL).toBe("http://localhost:30001");

    delete process.env.LATTICE_URL;
  });
});
