import { describe, expect, it } from "vitest";
import { calculatePosition, summarisePortfolio } from "./portfolio";

describe("portfolio calculations", () => {
  it("calculates invested value, current value, and gain from shares and prices", () => {
    const position = calculatePosition({ quantity: 10, averageBuyPrice: 100, latestClose: 120 });

    expect(position.invested).toBe(1000);
    expect(position.currentValue).toBe(1200);
    expect(position.profitLoss).toBe(200);
    expect(position.profitLossPercent).toBe(20);
  });

  it("totals only known cost basis and available closing prices", () => {
    const total = summarisePortfolio([
      { quantity: 10, averageBuyPrice: 100, latestClose: 120 },
      { quantity: 5, averageBuyPrice: null, latestClose: 80 },
      { quantity: 2, averageBuyPrice: 50, latestClose: null },
    ]);

    expect(total.totalShares).toBe(17);
    expect(total.totalInvested).toBe(1100);
    expect(total.totalCurrentValue).toBe(1600);
    expect(total.totalProfitLoss).toBe(200);
    expect(total.totalProfitLossPercent).toBe(20);
    expect(total.positionsMissingCost).toBe(1);
    expect(total.positionsMissingPrice).toBe(1);
  });
});