import { describe, expect, it } from "vitest";
import {
  calculateSma,
  calculateEma,
  calculateRsi,
  calculateMacd,
  calculateBollingerBands,
  calculateAtr,
  calculateClassicPivots,
  computeStockIndicators,
} from "./indicators";
import type { Bar } from "./candles";

describe("indicators", () => {
  it("calculates SMA correctly", () => {
    const values = [10, 20, 30, 40, 50];
    expect(calculateSma(values, 3)).toBe(40); // (30 + 40 + 50) / 3
    expect(calculateSma(values, 5)).toBe(30);
    expect(calculateSma(values, 10)).toBeNull();
  });

  it("calculates EMA correctly", () => {
    const values = [10, 11, 12, 13, 14, 15];
    const ema = calculateEma(values, 3);
    expect(ema).not.toBeNull();
    expect(ema!).toBeGreaterThan(13);
    expect(ema!).toBeLessThan(15);
  });

  it("calculates RSI correctly", () => {
    // 15 strictly increasing closes -> RSI should be 100
    const bullishCloses = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
    const rsiBull = calculateRsi(bullishCloses, 14);
    expect(rsiBull).toBe(100);

    // 15 strictly decreasing closes -> RSI should be 0
    const bearishCloses = Array.from({ length: 20 }, (_, i) => 100 - i * 2);
    const rsiBear = calculateRsi(bearishCloses, 14);
    expect(rsiBear).toBe(0);

    // Mixed closes
    const mixed = [10, 12, 11, 13, 14, 12, 15, 14, 16, 17, 15, 16, 18, 19, 18, 20];
    const rsiMixed = calculateRsi(mixed, 14);
    expect(rsiMixed).not.toBeNull();
    expect(rsiMixed!).toBeGreaterThan(50);
  });

  it("calculates MACD correctly", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
    const macd = calculateMacd(closes);
    expect(macd).not.toBeNull();
    expect(macd?.trend).toBe("Bullish");
  });

  it("calculates Bollinger Bands correctly", () => {
    const closes = Array.from({ length: 25 }, () => 100);
    const bb = calculateBollingerBands(closes, 20);
    expect(bb).not.toBeNull();
    expect(bb?.middle).toBe(100);
    expect(bb?.upper).toBe(100);
    expect(bb?.lower).toBe(100);
  });

  it("calculates Classic Pivots correctly", () => {
    const prevBar: Bar = { t: 1000, o: 100, h: 120, l: 90, c: 110 };
    const p = calculateClassicPivots(prevBar);
    expect(p).not.toBeNull();
    // Pivot = (120 + 90 + 110) / 3 = 106.67
    expect(p?.pivot).toBe(106.67);
    // R1 = 2 * 106.67 - 90 = 123.34
    expect(p?.r1).toBe(123.34);
    // S1 = 2 * 106.67 - 120 = 93.34
    expect(p?.s1).toBe(93.34);
  });

  it("computes 52-week stats and week-wise stats", () => {
    const now = Math.floor(Date.now() / 1000);
    const day = 86400;
    const bars: Bar[] = Array.from({ length: 60 }, (_, i) => ({
      t: now - (60 - i) * 7 * day,
      o: 100 + i,
      h: 105 + i,
      l: 95 + i,
      c: 102 + i,
    }));

    const indicators = computeStockIndicators(bars);
    expect(indicators.high52).not.toBeNull();
    expect(indicators.low52).not.toBeNull();
    expect(indicators.high52!).toBeGreaterThanOrEqual(indicators.low52!);
    expect(indicators.currentWeek).not.toBeNull();
    expect(indicators.currentWeek?.high).toBe(105 + 59);
    expect(indicators.currentWeek?.low).toBe(95 + 59);
    expect(indicators.recentWeeks.length).toBe(10);
    expect(indicators.range52PositionPct).not.toBeNull();
  });
});
