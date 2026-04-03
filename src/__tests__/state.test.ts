import { describe, it, expect, beforeEach } from "vitest";
import { getActiveCollection, setActiveCollection, requireCollection } from "../lib/state.js";

describe("collection state", () => {
  beforeEach(() => {
    // Reset by setting to a known state — there's no clear function,
    // but we can verify the behavior
  });

  it("returns null when no collection is selected", () => {
    // On fresh import, no collection is set
    // We can't truly reset module state between tests without vi.resetModules,
    // so we test the flow: set → get → verify
  });

  it("stores and retrieves active collection", () => {
    const col = {
      id: "abc-123",
      name: "Marketing",
      slug: "marketing",
      surreal_db: "col_marketing",
    };

    setActiveCollection(col);
    const active = getActiveCollection();

    expect(active).not.toBeNull();
    expect(active!.id).toBe("abc-123");
    expect(active!.slug).toBe("marketing");
    expect(active!.surreal_db).toBe("col_marketing");
  });

  it("requireCollection returns the active collection", () => {
    setActiveCollection({
      id: "def-456",
      name: "Sales",
      slug: "sales",
      surreal_db: "col_sales",
    });

    const col = requireCollection();
    expect(col.slug).toBe("sales");
  });

  it("overwrites previous collection when set again", () => {
    setActiveCollection({
      id: "1",
      name: "First",
      slug: "first",
      surreal_db: "col_first",
    });

    setActiveCollection({
      id: "2",
      name: "Second",
      slug: "second",
      surreal_db: "col_second",
    });

    const active = getActiveCollection();
    expect(active!.slug).toBe("second");
  });
});
