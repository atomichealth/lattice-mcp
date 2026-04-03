import { describe, it, expect } from "vitest";

/**
 * Tests for the bi-temporal edge model.
 * Validates temporal fields, invalidation logic, and timeline filtering.
 */

interface TemporalEdge {
  id: string;
  from: string;
  to: string;
  relationType: string;
  fact: string;
  valid_at: string;
  invalid_at: string | null;
  confidence: number;
  source: string;
  created_at: string;
}

function createEdge(overrides: Partial<TemporalEdge> = {}): TemporalEdge {
  return {
    id: `WORKS_ON:${Math.random().toString(36).slice(2, 8)}`,
    from: "person:sarah_chen",
    to: "project:nike_rebrand",
    relationType: "WORKS_ON",
    fact: "Sarah works on the Nike rebrand",
    valid_at: new Date().toISOString(),
    invalid_at: null,
    confidence: 1.0,
    source: "lattice-mcp",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function isCurrentEdge(edge: TemporalEdge): boolean {
  return edge.invalid_at === null;
}

function isValidAt(edge: TemporalEdge, date: Date): boolean {
  const validAt = new Date(edge.valid_at);
  if (date < validAt) return false;
  if (edge.invalid_at && date >= new Date(edge.invalid_at)) return false;
  return true;
}

function filterTimeline(edges: TemporalEdge[], since?: string): TemporalEdge[] {
  let filtered = edges;
  if (since) {
    const sinceDate = new Date(since);
    filtered = edges.filter(e => new Date(e.valid_at) >= sinceDate);
  }
  return filtered.sort((a, b) =>
    new Date(a.valid_at).getTime() - new Date(b.valid_at).getTime()
  );
}

describe("bi-temporal edge model", () => {
  it("creates edge with valid_at defaulting to now", () => {
    const edge = createEdge();
    expect(edge.valid_at).toBeTruthy();
    expect(new Date(edge.valid_at).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it("creates edge with null invalid_at (current)", () => {
    const edge = createEdge();
    expect(edge.invalid_at).toBeNull();
    expect(isCurrentEdge(edge)).toBe(true);
  });

  it("invalidated edge has non-null invalid_at", () => {
    const edge = createEdge({
      valid_at: "2025-01-01T00:00:00Z",
      invalid_at: "2026-03-01T00:00:00Z",
    });
    expect(isCurrentEdge(edge)).toBe(false);
  });

  it("isValidAt returns true for dates within validity window", () => {
    const edge = createEdge({
      valid_at: "2025-01-01T00:00:00Z",
      invalid_at: "2026-06-01T00:00:00Z",
    });

    expect(isValidAt(edge, new Date("2025-06-01"))).toBe(true);
    expect(isValidAt(edge, new Date("2026-01-01"))).toBe(true);
  });

  it("isValidAt returns false before valid_at", () => {
    const edge = createEdge({
      valid_at: "2025-06-01T00:00:00Z",
      invalid_at: null,
    });

    expect(isValidAt(edge, new Date("2025-01-01"))).toBe(false);
  });

  it("isValidAt returns false after invalid_at", () => {
    const edge = createEdge({
      valid_at: "2025-01-01T00:00:00Z",
      invalid_at: "2025-12-31T00:00:00Z",
    });

    expect(isValidAt(edge, new Date("2026-06-01"))).toBe(false);
  });

  it("isValidAt returns true for current edge at any future date", () => {
    const edge = createEdge({
      valid_at: "2025-01-01T00:00:00Z",
      invalid_at: null,
    });

    expect(isValidAt(edge, new Date("2030-01-01"))).toBe(true);
  });

  it("preserves confidence and source on edges", () => {
    const edge = createEdge({
      confidence: 0.75,
      source: "gong_transcript:456",
    });

    expect(edge.confidence).toBe(0.75);
    expect(edge.source).toBe("gong_transcript:456");
  });
});

describe("timeline filtering", () => {
  const edges: TemporalEdge[] = [
    createEdge({ id: "e1", valid_at: "2024-01-01T00:00:00Z", invalid_at: "2025-01-01T00:00:00Z", fact: "First job" }),
    createEdge({ id: "e2", valid_at: "2025-01-01T00:00:00Z", invalid_at: "2026-01-01T00:00:00Z", fact: "Second job" }),
    createEdge({ id: "e3", valid_at: "2026-01-01T00:00:00Z", invalid_at: null, fact: "Current job" }),
  ];

  it("returns all edges sorted by valid_at", () => {
    const timeline = filterTimeline(edges);
    expect(timeline).toHaveLength(3);
    expect(timeline[0].fact).toBe("First job");
    expect(timeline[1].fact).toBe("Second job");
    expect(timeline[2].fact).toBe("Current job");
  });

  it("filters by since date", () => {
    const timeline = filterTimeline(edges, "2025-06-01T00:00:00Z");
    expect(timeline).toHaveLength(1);
    expect(timeline[0].fact).toBe("Current job");
  });

  it("returns empty for future since date", () => {
    const timeline = filterTimeline(edges, "2030-01-01T00:00:00Z");
    expect(timeline).toHaveLength(0);
  });

  it("returns all for ancient since date", () => {
    const timeline = filterTimeline(edges, "2000-01-01T00:00:00Z");
    expect(timeline).toHaveLength(3);
  });

  it("identifies current vs historical", () => {
    const current = edges.filter(isCurrentEdge);
    const historical = edges.filter(e => !isCurrentEdge(e));
    expect(current).toHaveLength(1);
    expect(current[0].fact).toBe("Current job");
    expect(historical).toHaveLength(2);
  });
});

describe("edge invalidation", () => {
  it("invalidation sets invalid_at without changing other fields", () => {
    const edge = createEdge({
      fact: "Sarah works at Nike",
      valid_at: "2025-01-01T00:00:00Z",
      confidence: 0.9,
    });

    // Simulate invalidation
    const invalidated = {
      ...edge,
      invalid_at: "2026-03-01T00:00:00Z",
    };

    expect(invalidated.fact).toBe("Sarah works at Nike");
    expect(invalidated.valid_at).toBe("2025-01-01T00:00:00Z");
    expect(invalidated.confidence).toBe(0.9);
    expect(invalidated.invalid_at).toBe("2026-03-01T00:00:00Z");
    expect(isCurrentEdge(invalidated)).toBe(false);
  });

  it("re-creation after invalidation produces two edges in timeline", () => {
    const old = createEdge({
      id: "e_old",
      fact: "Sarah is a designer",
      valid_at: "2024-01-01T00:00:00Z",
      invalid_at: "2025-06-01T00:00:00Z",
    });
    const current = createEdge({
      id: "e_new",
      fact: "Sarah is a design director",
      valid_at: "2025-06-01T00:00:00Z",
      invalid_at: null,
    });

    const timeline = filterTimeline([old, current]);
    expect(timeline).toHaveLength(2);
    expect(timeline[0].fact).toBe("Sarah is a designer");
    expect(timeline[0].invalid_at).not.toBeNull();
    expect(timeline[1].fact).toBe("Sarah is a design director");
    expect(timeline[1].invalid_at).toBeNull();
  });
});
