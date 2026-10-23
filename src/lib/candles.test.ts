import { describe, it, expect } from "vitest";
import { computeCells, summarise, aggregateBarsByYear } from "./candles";

const b = (o: number, c: number, t = 1) => ({ t, o, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, c });

describe("candle engine", () => {
  it("standard colours", () => {
    const cells = computeCells([b(10, 12), b(12, 11), b(11, 11), { t: 4, o: null, h: null, l: null, c: null }], "standard");
    expect(cells.map((c) => c.colour)).toEqual(["green", "red", "neutral", "nodata"]);
  });
  it("tolerance makes small moves neutral", () => {
    expect(computeCells([b(100, 100.4)], "standard", 0.5)[0]!.colour).toBe("neutral");
  });
  it("heikin-ashi uses previous HA", () => {
    const cells = computeCells([b(10, 12), b(12, 14)], "heikin-ashi");
    expect(cells[1]!.ha!.o).toBeCloseTo((11 + 11) / 2);
    expect(cells[1]!.colour).toBe("green");
  });
  it("trend summary", () => {
    const s = summarise(computeCells([b(12, 10), b(10, 11), b(11, 12), b(12, 13)], "standard"));
    expect(s.trend).toBe("Bullish");
    expect(s.streak).toBe(3);
  });
  it("aggregates bars into calendar years correctly", () => {
    // 2024 timestamps: Jan 2024 and Jun 2024
    const jan24 = Math.floor(new Date("2024-01-01T00:00:00Z").getTime() / 1000);
    const jun24 = Math.floor(new Date("2024-06-01T00:00:00Z").getTime() / 1000);
    // 2025 timestamps: Jan 2025 and Dec 2025
    const jan25 = Math.floor(new Date("2025-01-01T00:00:00Z").getTime() / 1000);
    const dec25 = Math.floor(new Date("2025-12-01T00:00:00Z").getTime() / 1000);

    const input = [
      { t: jan24, o: 100, h: 120, l: 90, c: 110, v: 500 },
      { t: jun24, o: 110, h: 150, l: 105, c: 140, v: 600 },
      { t: jan25, o: 140, h: 160, l: 130, c: 155, v: 400 },
      { t: dec25, o: 155, h: 180, l: 145, c: 175, v: 800 },
    ];

    const yearly = aggregateBarsByYear(input);
    expect(yearly).toHaveLength(2);
    // 2024 bar
    expect(yearly[0]).toEqual({
      t: jan24,
      o: 100,
      h: 150,
      l: 90,
      c: 140,
      v: 1100,
    });
    // 2025 bar
    expect(yearly[1]).toEqual({
      t: jan25,
      o: 140,
      h: 180,
      l: 130,
      c: 175,
      v: 1200,
    });
  });
});

