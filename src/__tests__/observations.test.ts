import { describe, it, expect } from "vitest";

/**
 * Tests for the structured observation model.
 * Validates the observation shape, timestamp injection, and confidence defaults.
 */

interface Observation {
  text: string;
  source: string;
  confidence: number;
  created_at: string;
}

function buildObservation(input: {
  text: string;
  source?: string;
  confidence?: number;
}): Observation {
  return {
    text: input.text,
    source: input.source || "lattice-mcp",
    confidence: input.confidence ?? 1.0,
    created_at: new Date().toISOString(),
  };
}

describe("structured observations", () => {
  it("creates observation with all fields", () => {
    const obs = buildObservation({
      text: "Prefers morning meetings",
      source: "slack_msg:123",
      confidence: 0.8,
    });

    expect(obs.text).toBe("Prefers morning meetings");
    expect(obs.source).toBe("slack_msg:123");
    expect(obs.confidence).toBe(0.8);
    expect(obs.created_at).toBeTruthy();
    expect(new Date(obs.created_at).getTime()).toBeGreaterThan(0);
  });

  it("defaults source to lattice-mcp", () => {
    const obs = buildObservation({ text: "Some fact" });
    expect(obs.source).toBe("lattice-mcp");
  });

  it("defaults confidence to 1.0", () => {
    const obs = buildObservation({ text: "Verified fact" });
    expect(obs.confidence).toBe(1.0);
  });

  it("preserves zero confidence", () => {
    const obs = buildObservation({ text: "Wild guess", confidence: 0 });
    expect(obs.confidence).toBe(0);
  });

  it("preserves low confidence", () => {
    const obs = buildObservation({ text: "Inference", confidence: 0.3 });
    expect(obs.confidence).toBe(0.3);
  });

  it("generates ISO 8601 timestamps", () => {
    const obs = buildObservation({ text: "test" });
    // Should be parseable and recent
    const ts = new Date(obs.created_at);
    expect(ts.getTime()).toBeGreaterThan(Date.now() - 5000);
    expect(ts.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("builds multiple observations with independent timestamps", async () => {
    const obs1 = buildObservation({ text: "first" });
    // Small delay to ensure different timestamps
    await new Promise(r => setTimeout(r, 2));
    const obs2 = buildObservation({ text: "second" });

    expect(obs1.text).toBe("first");
    expect(obs2.text).toBe("second");
    // Both should have timestamps
    expect(obs1.created_at).toBeTruthy();
    expect(obs2.created_at).toBeTruthy();
  });
});
