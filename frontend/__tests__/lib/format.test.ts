import { formatCount, formatSeason, formatDate } from "../../src/lib/format";

describe("formatCount", () => {
  test("singular form for 1", () => {
    expect(formatCount(1, "image")).toBe("1 image");
  });

  test("plural form for 0", () => {
    expect(formatCount(0, "image")).toBe("0 images");
  });

  test("plural form for many", () => {
    expect(formatCount(12, "image")).toBe("12 images");
  });

  test("y -> ies pluralisation", () => {
    expect(formatCount(3, "entry")).toBe("3 entries");
  });

  test("vowel+y stays regular (days, keys)", () => {
    expect(formatCount(2, "day")).toBe("2 days");
  });

  test("sh/ch/s/x/z take -es", () => {
    expect(formatCount(2, "brush")).toBe("2 brushes");
    expect(formatCount(2, "box")).toBe("2 boxes");
    expect(formatCount(2, "match")).toBe("2 matches");
  });

  test("explicit plural overrides default", () => {
    expect(formatCount(2, "person", "people")).toBe("2 people");
  });
});

describe("formatSeason", () => {
  test("uppercase input becomes Title Case", () => {
    expect(formatSeason("SPRING")).toBe("Spring");
  });

  test("lowercase input becomes Title Case", () => {
    expect(formatSeason("fall")).toBe("Fall");
  });

  test("mixed input is normalised", () => {
    expect(formatSeason("SuMmEr")).toBe("Summer");
  });

  test("empty string returns empty string", () => {
    expect(formatSeason("")).toBe("");
  });
});

describe("formatDate", () => {
  test("formats a valid ISO date", () => {
    const formatted = formatDate("2024-03-15T10:20:00Z");
    // Exact output depends on the JVM locale; asserting on the pieces is
    // more robust than pinning the full string.
    expect(formatted).toMatch(/2024/);
    expect(formatted).toMatch(/Mar/);
    expect(formatted).toMatch(/15/);
  });

  test("returns input unchanged for invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  test("empty string returns empty string", () => {
    expect(formatDate("")).toBe("");
  });
});
