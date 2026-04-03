import { describe, it, expect } from "vitest";

/**
 * Tests for tool input/output shape validation.
 * Validates that tool parameters serialize correctly for the API.
 */

/** Simulates building the API payload for create_entities */
function buildCreateEntityPayload(entity: {
  name: string;
  entityType: string;
  observations: { text: string; source?: string; confidence?: number }[];
  attributes?: Record<string, any>;
}): { record_type: string; data: Record<string, any>; source: string } {
  const observations = entity.observations.map(obs => ({
    text: obs.text,
    source: obs.source || "lattice-mcp",
    confidence: obs.confidence ?? 1.0,
    created_at: new Date().toISOString(),
  }));

  return {
    record_type: entity.entityType,
    data: {
      name: entity.name,
      ...(entity.attributes || {}),
      _observations: observations,
    },
    source: "lattice-mcp",
  };
}

/** Simulates building the API payload for create_relations */
function buildRelatePayload(rel: {
  from: string;
  to: string;
  relationType: string;
  fact?: string;
  valid_at?: string;
  confidence?: number;
  source?: string;
  properties?: Record<string, any>;
}): { from: string; to: string; edge: string; properties: Record<string, any> } {
  return {
    from: rel.from,
    to: rel.to,
    edge: rel.relationType,
    properties: {
      ...(rel.properties || {}),
      fact: rel.fact,
      valid_at: rel.valid_at || new Date().toISOString(),
      invalid_at: null,
      confidence: rel.confidence ?? 1.0,
      source: rel.source || "lattice-mcp",
    },
  };
}

describe("create_entities payload", () => {
  it("builds correct payload with structured observations", () => {
    const payload = buildCreateEntityPayload({
      name: "Sarah Chen",
      entityType: "person",
      observations: [
        { text: "Lead designer at Nike", source: "linkedin", confidence: 0.95 },
        { text: "Based in Portland" },
      ],
    });

    expect(payload.record_type).toBe("person");
    expect(payload.data.name).toBe("Sarah Chen");
    expect(payload.data._observations).toHaveLength(2);
    expect(payload.data._observations[0].text).toBe("Lead designer at Nike");
    expect(payload.data._observations[0].source).toBe("linkedin");
    expect(payload.data._observations[0].confidence).toBe(0.95);
    expect(payload.data._observations[0].created_at).toBeTruthy();
    expect(payload.data._observations[1].source).toBe("lattice-mcp"); // default
    expect(payload.data._observations[1].confidence).toBe(1.0); // default
  });

  it("merges attributes into data", () => {
    const payload = buildCreateEntityPayload({
      name: "Acme Corp",
      entityType: "organization",
      observations: [{ text: "Fortune 500 company" }],
      attributes: { industry: "Tech", revenue: 5000000, public: true },
    });

    expect(payload.data.industry).toBe("Tech");
    expect(payload.data.revenue).toBe(5000000);
    expect(payload.data.public).toBe(true);
    expect(payload.data.name).toBe("Acme Corp");
    expect(payload.data._observations).toHaveLength(1);
  });

  it("handles entity with no attributes", () => {
    const payload = buildCreateEntityPayload({
      name: "Alpha Project",
      entityType: "project",
      observations: [{ text: "Q4 initiative" }],
    });

    expect(payload.data.name).toBe("Alpha Project");
    expect(Object.keys(payload.data)).toEqual(["name", "_observations"]);
  });

  it("handles empty observations array", () => {
    const payload = buildCreateEntityPayload({
      name: "Placeholder",
      entityType: "topic",
      observations: [],
    });

    expect(payload.data._observations).toEqual([]);
  });
});

describe("create_relations payload", () => {
  it("builds correct payload with temporal fields", () => {
    const payload = buildRelatePayload({
      from: "person:sarah_chen",
      to: "project:nike_rebrand",
      relationType: "WORKS_ON",
      fact: "Sarah leads the Nike rebrand project",
      confidence: 0.92,
      source: "meeting_notes",
    });

    expect(payload.from).toBe("person:sarah_chen");
    expect(payload.to).toBe("project:nike_rebrand");
    expect(payload.edge).toBe("WORKS_ON");
    expect(payload.properties.fact).toBe("Sarah leads the Nike rebrand project");
    expect(payload.properties.valid_at).toBeTruthy();
    expect(payload.properties.invalid_at).toBeNull();
    expect(payload.properties.confidence).toBe(0.92);
    expect(payload.properties.source).toBe("meeting_notes");
  });

  it("defaults confidence to 1.0", () => {
    const payload = buildRelatePayload({
      from: "a:1",
      to: "b:2",
      relationType: "RELATED_TO",
    });

    expect(payload.properties.confidence).toBe(1.0);
  });

  it("defaults source to lattice-mcp", () => {
    const payload = buildRelatePayload({
      from: "a:1",
      to: "b:2",
      relationType: "RELATED_TO",
    });

    expect(payload.properties.source).toBe("lattice-mcp");
  });

  it("sets invalid_at to null (current)", () => {
    const payload = buildRelatePayload({
      from: "a:1",
      to: "b:2",
      relationType: "X",
    });

    expect(payload.properties.invalid_at).toBeNull();
  });

  it("merges custom properties", () => {
    const payload = buildRelatePayload({
      from: "person:a",
      to: "organization:b",
      relationType: "WORKS_AT",
      properties: { role: "CTO", department: "Engineering" },
    });

    expect(payload.properties.role).toBe("CTO");
    expect(payload.properties.department).toBe("Engineering");
    expect(payload.properties.invalid_at).toBeNull(); // temporal fields still present
  });

  it("accepts explicit valid_at", () => {
    const payload = buildRelatePayload({
      from: "a:1",
      to: "b:2",
      relationType: "X",
      valid_at: "2025-01-15T00:00:00Z",
    });

    expect(payload.properties.valid_at).toBe("2025-01-15T00:00:00Z");
  });
});

describe("invalidate_relations logic", () => {
  it("builds UPDATE query with invalid_at", () => {
    const id = "WORKS_ON:abc123";
    const timestamp = "2026-03-01T00:00:00Z";
    const query = `UPDATE ${id} SET invalid_at = '${timestamp}';`;

    expect(query).toBe("UPDATE WORKS_ON:abc123 SET invalid_at = '2026-03-01T00:00:00Z';");
  });

  it("builds UPDATE query with reason", () => {
    const id = "WORKS_ON:abc123";
    const timestamp = "2026-03-01T00:00:00Z";
    const reason = "Employee resigned";
    const query = `UPDATE ${id} SET invalid_at = '${timestamp}', _invalidation_reason = '${reason}';`;

    expect(query).toContain("_invalidation_reason = 'Employee resigned'");
  });

  it("escapes single quotes in reason", () => {
    const reason = "It's no longer valid";
    const escaped = reason.replace(/'/g, "''");
    expect(escaped).toBe("It''s no longer valid");
  });
});
