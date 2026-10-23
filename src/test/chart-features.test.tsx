import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FullScreenChartDialog } from "@/components/FullScreenChartDialog";
import { aggregateBarsByYear } from "@/lib/candles";
import type { Tables } from "@/integrations/supabase/types";

// Mock lightweight-charts
vi.mock("lightweight-charts", () => ({
  createChart: () => ({
    addSeries: () => ({
      setData: vi.fn(),
      createPriceLine: vi.fn(),
    }),
    priceScale: () => ({
      applyOptions: vi.fn(),
    }),
    timeScale: () => ({
      fitContent: vi.fn(),
      setVisibleRange: vi.fn(),
    }),
    subscribeCrosshairMove: vi.fn(),
    remove: vi.fn(),
  }),
  CandlestickSeries: {},
  LineSeries: {},
  AreaSeries: {},
  BarSeries: {},
  HistogramSeries: {},
  ColorType: { Solid: "solid" },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  PriceScaleMode: { Normal: 0, Logarithmic: 1 },
  CrosshairMode: { Normal: 0 },
}));

// Mock @tanstack/react-start useServerFn
vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useServerFn: () => vi.fn().mockResolvedValue({ bars: [], error: null }),
  };
});

const mockCompany: Tables<"companies"> = {
  id: "co-1",
  board_id: "board-1",
  name: "Tata Motors PV",
  symbol: "TMPV",
  exchange: "NSE",
  sector: "Automobile",
  quantity: 100,
  average_buy_price: 265,
  action: null,
  observation: null,
  last_reviewed: null,
  active: true,
  created_at: new Date().toISOString(),
};

const mockBars = [
  { t: 1700000000, o: 260, h: 275, l: 255, c: 270, v: 1000000 },
  { t: 1700086400, o: 270, h: 280, l: 265, c: 278, v: 1200000 },
];

describe("Chart Features & Full Screen Dialog", () => {
  it("aggregates bars into yearly candles", () => {
    const bars = [
      { t: 1704067200, o: 100, h: 120, l: 90, c: 110, v: 1000 }, // Jan 2024
      { t: 1717200000, o: 110, h: 140, l: 105, c: 135, v: 2000 }, // Jun 2024
    ];
    const yearly = aggregateBarsByYear(bars);
    expect(yearly).toHaveLength(1);
    expect(yearly[0]!.o).toBe(100);
    expect(yearly[0]!.h).toBe(140);
    expect(yearly[0]!.l).toBe(90);
    expect(yearly[0]!.c).toBe(135);
    expect(yearly[0]!.v).toBe(3000);
  });

  it("renders FullScreenChartDialog with all stock information and indicators", () => {
    const onClose = vi.fn();
    render(
      <FullScreenChartDialog
        open={true}
        onOpenChange={onClose}
        co={mockCompany}
        bars={mockBars}
        money={(v) => `₹${v}`}
        indicators={{
          currentPrice: 270,
          high52: 320,
          low52: 210,
          range52PositionPct: 54,
          pctFrom52Low: 28.5,
          pctFrom52High: -15.6,
          currentWeek: {
            high: 280,
            low: 265,
            open: 270,
            close: 278,
            range: 15,
            rangePct: 5.5,
            change: 8,
            changePct: 2.96,
            isGreen: true,
          },
          recentWeeks: [],
          rsi14: 58.4,
          rsiStatus: "Neutral",
          sma20: 265,
          priceVsSma20Pct: 1.8,
          sma50: 250,
          priceVsSma50Pct: 8,
          sma200: null,
          ema20: 267,
          ema50: 252,
          bollinger: null,
          macd: null,
          atr14: null,
          pivots: null,
        }}
        portRow={{
          shares: 100,
          averageBuyPrice: 265,
          latestClose: 270,
          invested: 26500,
          currentValue: 27000,
          profitLoss: 500,
          profitLossPercent: 1.89,
        }}
      />,
    );

    // Verify Symbol and Company Name are displayed
    expect(screen.getAllByText("TMPV").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tata Motors PV").length).toBeGreaterThan(0);

    // Verify Live Price is displayed
    expect(screen.getByText("₹270")).toBeDefined();

    // Verify 52W Range info is displayed
    expect(screen.getByText("₹320")).toBeDefined();
    expect(screen.getByText("₹210")).toBeDefined();

    // Verify RSI is displayed
    expect(screen.getByText("RSI 58.4 (Neutral)")).toBeDefined();

    // Verify Close button triggers onOpenChange(false)
    const closeBtn = screen.getByTitle("Close Full Screen");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledWith(false);
  });
});
