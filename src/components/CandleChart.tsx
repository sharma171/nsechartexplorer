import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { fetchSymbolChart } from "@/lib/market.functions";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  BarSeries,
  HistogramSeries,
  ColorType,
  LineStyle,
  PriceScaleMode,
  CrosshairMode,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Bar } from "@/lib/candles";
import { computeCells } from "@/lib/candles";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  RotateCcw,
  BarChart2,
  Activity,
  X,
  RefreshCw,
} from "lucide-react";

const C = {
  bg: "#0f1419",
  grid: "#1a222d",
  text: "#8b98a8",
  up: "#22c55e",
  down: "#ef4444",
  sma20: "#f59e0b",
  sma50: "#3b82f6",
  ema20: "#a855f7",
  bollinger: "#06b6d4",
  areaTop: "rgba(34, 197, 94, 0.28)",
  areaBottom: "rgba(34, 197, 94, 0.02)",
  areaLine: "#22c55e",
};

export type ChartType = "candle" | "heikin-ashi" | "area" | "line" | "bar";
export type TimeRange = "1M" | "3M" | "6M" | "1Y" | "ALL";
export type ChartInterval = "default" | "1y" | "1mo" | "1wk" | "1d" | "1h" | "15m" | "5m" | "1m";

export type CandleChartProps = {
  bars: Bar[];
  height?: number;
  averageBuyPrice?: number | null;
  high52?: number | null;
  low52?: number | null;
  symbol?: string;
  exchange?: string;
  showToolbar?: boolean;
  onFullScreen?: () => void;
  isFullScreen?: boolean;
};

// Helper to format Indian volume (Lakhs and Crores)
function formatIndianVolume(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  if (v >= 10000000) return `${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `${(v / 100000).toFixed(2)} L`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} K`;
  return v.toLocaleString("en-IN");
}

export default function CandleChart({
  bars,
  height = 300,
  averageBuyPrice,
  high52,
  low52,
  symbol,
  exchange = "NSE",
  showToolbar = true,
  onFullScreen,
  isFullScreen = false,
}: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const getSymbolChart = useServerFn(fetchSymbolChart);

  // Chart configuration state
  const [chartType, setChartType] = useState<ChartType>("candle");
  const [selectedRange, setSelectedRange] = useState<TimeRange>("ALL");
  const [isLogScale, setIsLogScale] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Interval resolution state (Year, Month, Week, Day, Hour, Minute, Default=Total)
  const [selectedInterval, setSelectedInterval] = useState<ChartInterval>("default");
  const [intervalBars, setIntervalBars] = useState<Bar[] | null>(null);
  const [isLoadingInterval, setIsLoadingInterval] = useState(false);
  const [intervalCache, setIntervalCache] = useState<Record<string, Bar[]>>({});

  const handleIntervalChange = useCallback(
    async (interval: ChartInterval) => {
      setSelectedInterval(interval);
      if (interval === "default") {
        setIntervalBars(null);
        return;
      }
      if (!symbol) return;
      const cacheKey = `${exchange || "NSE"}:${symbol}:${interval}`;
      if (intervalCache[cacheKey]) {
        setIntervalBars(intervalCache[cacheKey]!);
        return;
      }
      setIsLoadingInterval(true);
      try {
        const res = await getSymbolChart({
          data: {
            symbol,
            exchange: exchange || "NSE",
            interval: interval as any,
          },
        });
        if (res.bars && res.bars.length > 0) {
          setIntervalCache((prev) => ({ ...prev, [cacheKey]: res.bars }));
          setIntervalBars(res.bars);
        }
      } catch (err) {
        console.error("Failed to load chart interval:", err);
      } finally {
        setIsLoadingInterval(false);
      }
    },
    [symbol, exchange, intervalCache, getSymbolChart],
  );

  // Active bars: either interval-specific or original props.bars
  const activeBars = selectedInterval !== "default" && intervalBars ? intervalBars : bars;

  useEffect(() => {
    // If no initial bars were provided, but symbol is given, automatically fetch 1D candles
    if (bars.length === 0 && symbol && selectedInterval === "default") {
      handleIntervalChange("1d");
    }
  }, [bars.length, symbol, selectedInterval, handleIntervalChange]);

  // Indicators toggle state
  const [showSma20, setShowSma20] = useState(false);
  const [showSma50, setShowSma50] = useState(false);
  const [showEma20, setShowEma20] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showAvgBuy, setShowAvgBuy] = useState(Boolean(averageBuyPrice));
  const [show52W, setShow52W] = useState(false);

  // Keep track of active indicator count
  const activeIndicatorsCount =
    (showSma20 ? 1 : 0) +
    (showSma50 ? 1 : 0) +
    (showEma20 ? 1 : 0) +
    (showBollinger ? 1 : 0) +
    (showVolume ? 1 : 0) +
    (showAvgBuy && averageBuyPrice ? 1 : 0) +
    (show52W && (high52 || low52) ? 1 : 0);

  // Filter valid bars
  const validBars = useMemo(
    () => activeBars.filter((b) => b.o != null && b.h != null && b.l != null && b.c != null && b.t != null),
    [activeBars],
  );

  const barMap = useMemo(() => new Map(validBars.map((b) => [b.t, b])), [validBars]);

  // Latest bar for default HUD
  const latestBar = validBars.length > 0 ? validBars[validBars.length - 1]! : null;

  // Live HUD crosshair state
  const [hovered, setHovered] = useState<{
    t: number | null;
    o: number | null;
    h: number | null;
    l: number | null;
    c: number | null;
    v: number | null;
    change: number | null;
    changePct: number | null;
  } | null>(null);

  // Default HUD values from latest candle
  const activeHud = useMemo(() => {
    if (hovered && hovered.o != null) return hovered;
    if (!latestBar) return null;
    return {
      t: latestBar.t,
      o: latestBar.o,
      h: latestBar.h,
      l: latestBar.l,
      c: latestBar.c,
      v: latestBar.v ?? null,
      change: latestBar.o != null && latestBar.c != null ? latestBar.c - latestBar.o : null,
      changePct:
        latestBar.o != null && latestBar.c != null && latestBar.o > 0
          ? ((latestBar.c - latestBar.o) / latestBar.o) * 100
          : null,
    };
  }, [hovered, latestBar]);

  // Compute Heikin-Ashi candles
  const haBars = useMemo(() => {
    if (chartType !== "heikin-ashi") return [];
    const cells = computeCells(validBars, "heikin-ashi");
    return cells
      .filter((c) => c.bar.h != null && c.bar.l != null && c.ha != null)
      .map((c) => {
        const o = c.ha!.o;
        const cl = c.ha!.c;
        const h = Math.max(c.bar.h!, o, cl);
        const l = Math.min(c.bar.l!, o, cl);
        return {
          time: c.t as UTCTimestamp,
          open: Number(o.toFixed(2)),
          high: Number(h.toFixed(2)),
          low: Number(l.toFixed(2)),
          close: Number(cl.toFixed(2)),
        };
      });
  }, [validBars, chartType]);

  // Compute SMA series
  const sma20Data = useMemo(() => {
    if (!showSma20 || validBars.length < 20) return [];
    const res: { time: UTCTimestamp; value: number }[] = [];
    for (let i = 19; i < validBars.length; i++) {
      let sum = 0;
      for (let j = 0; j < 20; j++) sum += validBars[i - j]!.c!;
      res.push({ time: validBars[i]!.t as UTCTimestamp, value: Number((sum / 20).toFixed(2)) });
    }
    return res;
  }, [validBars, showSma20]);

  const sma50Data = useMemo(() => {
    if (!showSma50 || validBars.length < 50) return [];
    const res: { time: UTCTimestamp; value: number }[] = [];
    for (let i = 49; i < validBars.length; i++) {
      let sum = 0;
      for (let j = 0; j < 50; j++) sum += validBars[i - j]!.c!;
      res.push({ time: validBars[i]!.t as UTCTimestamp, value: Number((sum / 50).toFixed(2)) });
    }
    return res;
  }, [validBars, showSma50]);

  // Compute EMA 20
  const ema20Data = useMemo(() => {
    if (!showEma20 || validBars.length < 20) return [];
    const res: { time: UTCTimestamp; value: number }[] = [];
    const k = 2 / 21;
    let ema = 0;
    for (let i = 0; i < 20; i++) ema += validBars[i]!.c!;
    ema /= 20;
    res.push({ time: validBars[19]!.t as UTCTimestamp, value: Number(ema.toFixed(2)) });
    for (let i = 20; i < validBars.length; i++) {
      ema = validBars[i]!.c! * k + ema * (1 - k);
      res.push({ time: validBars[i]!.t as UTCTimestamp, value: Number(ema.toFixed(2)) });
    }
    return res;
  }, [validBars, showEma20]);

  // Compute Bollinger Bands
  const bbData = useMemo(() => {
    if (!showBollinger || validBars.length < 20) return { upper: [], lower: [], middle: [] };
    const upper: { time: UTCTimestamp; value: number }[] = [];
    const lower: { time: UTCTimestamp; value: number }[] = [];
    const middle: { time: UTCTimestamp; value: number }[] = [];
    for (let i = 19; i < validBars.length; i++) {
      let sum = 0;
      for (let j = 0; j < 20; j++) sum += validBars[i - j]!.c!;
      const m = sum / 20;
      let variance = 0;
      for (let j = 0; j < 20; j++) variance += Math.pow(validBars[i - j]!.c! - m, 2);
      const std = Math.sqrt(variance / 20);
      const t = validBars[i]!.t as UTCTimestamp;
      middle.push({ time: t, value: Number(m.toFixed(2)) });
      upper.push({ time: t, value: Number((m + 2 * std).toFixed(2)) });
      lower.push({ time: t, value: Number((m - 2 * std).toFixed(2)) });
    }
    return { upper, lower, middle };
  }, [validBars, showBollinger]);

  // Compute Volume data
  const volumeData = useMemo(() => {
    if (!showVolume) return [];
    return validBars
      .filter((b) => b.v != null && b.v > 0)
      .map((b) => ({
        time: b.t as UTCTimestamp,
        value: b.v!,
        color: b.c! >= b.o! ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)",
      }));
  }, [validBars, showVolume]);

  const currentHeight = isExpanded ? 480 : height;

  // Set time range zoom
  const handleRangeClick = useCallback(
    (range: TimeRange) => {
      if (!chartRef.current || validBars.length === 0) return;
      setSelectedRange(range);
      if (range === "ALL") {
        chartRef.current.timeScale().fitContent();
        return;
      }
      const lastTime = validBars[validBars.length - 1]!.t;
      let days = 30;
      if (range === "3M") days = 90;
      if (range === "6M") days = 180;
      if (range === "1Y") days = 365;
      const fromTime = (lastTime - days * 86400) as UTCTimestamp;
      chartRef.current.timeScale().setVisibleRange({
        from: fromTime,
        to: lastTime as UTCTimestamp,
      });
    },
    [validBars],
  );

  // Initialize and update Lightweight Chart
  useEffect(() => {
    const container = containerRef.current;
    if (!container || validBars.length === 0) return;

    const initialHeight = isFullScreen
      ? Math.max(300, container.clientHeight || 550)
      : currentHeight;

    const chart = createChart(container, {
      height: initialHeight,
      width: container.clientWidth || undefined,
      autoSize: true,
      localization: { locale: "en-IN" },
      layout: { background: { type: ColorType.Solid, color: C.bg }, textColor: C.text },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: C.grid, timeVisible: true, secondsVisible: false },
      rightPriceScale: {
        borderColor: C.grid,
        mode: isLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      },
    });
    chartRef.current = chart;

    // 1. Add Main Series based on chartType
    let mainSeries: any = null;
    if (chartType === "candle") {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: C.up,
        downColor: C.down,
        borderUpColor: C.up,
        borderDownColor: C.down,
        wickUpColor: C.up,
        wickDownColor: C.down,
      });
      mainSeries.setData(
        validBars.map((b) => ({
          time: b.t as UTCTimestamp,
          open: b.o!,
          high: b.h!,
          low: b.l!,
          close: b.c!,
        })),
      );
    } else if (chartType === "heikin-ashi") {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: C.up,
        downColor: C.down,
        borderUpColor: C.up,
        borderDownColor: C.down,
        wickUpColor: C.up,
        wickDownColor: C.down,
      });
      mainSeries.setData(haBars);
    } else if (chartType === "area") {
      mainSeries = chart.addSeries(AreaSeries, {
        lineColor: C.areaLine,
        topColor: C.areaTop,
        bottomColor: C.areaBottom,
        lineWidth: 2,
      });
      mainSeries.setData(validBars.map((b) => ({ time: b.t as UTCTimestamp, value: b.c! })));
    } else if (chartType === "line") {
      mainSeries = chart.addSeries(LineSeries, {
        color: C.areaLine,
        lineWidth: 2,
      });
      mainSeries.setData(validBars.map((b) => ({ time: b.t as UTCTimestamp, value: b.c! })));
    } else if (chartType === "bar") {
      mainSeries = chart.addSeries(BarSeries, {
        upColor: C.up,
        downColor: C.down,
      });
      mainSeries.setData(
        validBars.map((b) => ({
          time: b.t as UTCTimestamp,
          open: b.o!,
          high: b.h!,
          low: b.l!,
          close: b.c!,
        })),
      );
    }

    // 2. Add Volume Series (Sub-chart at bottom)
    if (showVolume && volumeData.length > 0) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
      volumeSeries.setData(volumeData);
    }

    // 3. Add SMA 20 Overlay
    if (showSma20 && sma20Data.length > 0) {
      const s20 = chart.addSeries(LineSeries, {
        color: C.sma20,
        lineWidth: 2,
        title: "SMA 20",
      });
      s20.setData(sma20Data);
    }

    // 4. Add SMA 50 Overlay
    if (showSma50 && sma50Data.length > 0) {
      const s50 = chart.addSeries(LineSeries, {
        color: C.sma50,
        lineWidth: 2,
        title: "SMA 50",
      });
      s50.setData(sma50Data);
    }

    // 5. Add EMA 20 Overlay
    if (showEma20 && ema20Data.length > 0) {
      const e20 = chart.addSeries(LineSeries, {
        color: C.ema20,
        lineWidth: 2,
        title: "EMA 20",
      });
      e20.setData(ema20Data);
    }

    // 6. Add Bollinger Bands Overlay
    if (showBollinger && bbData.middle.length > 0) {
      const bbUp = chart.addSeries(LineSeries, {
        color: C.bollinger,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: "BB Upper",
      });
      bbUp.setData(bbData.upper);
      const bbMid = chart.addSeries(LineSeries, {
        color: "rgba(6, 182, 212, 0.5)",
        lineWidth: 1,
        title: "BB Middle",
      });
      bbMid.setData(bbData.middle);
      const bbLow = chart.addSeries(LineSeries, {
        color: C.bollinger,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: "BB Lower",
      });
      bbLow.setData(bbData.lower);
    }

    // 7. Add Average Buy Price Line (Upstox/Kite feature)
    if (mainSeries && showAvgBuy && averageBuyPrice) {
      const isProfit = (latestBar?.c ?? 0) >= averageBuyPrice;
      mainSeries.createPriceLine({
        price: averageBuyPrice,
        color: isProfit ? "#22c55e" : "#ef4444",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `Avg Buy ₹${averageBuyPrice}`,
      });
    }

    // 8. Add 52-Week High & Low reference lines
    if (mainSeries && show52W) {
      if (high52) {
        mainSeries.createPriceLine({
          price: high52,
          color: "#22c55e",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `52W High ₹${high52}`,
        });
      }
      if (low52) {
        mainSeries.createPriceLine({
          price: low52,
          color: "#ef4444",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `52W Low ₹${low52}`,
        });
      }
    }

    // 9. Subscribe to Crosshair hover for Live HUD
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHovered(null);
        return;
      }
      const b = barMap.get(param.time as number);
      if (b && b.o != null && b.c != null) {
        setHovered({
          t: b.t,
          o: b.o,
          h: b.h,
          l: b.l,
          c: b.c,
          v: b.v ?? null,
          change: b.c - b.o,
          changePct: b.o > 0 ? ((b.c - b.o) / b.o) * 100 : null,
        });
      }
    });

    // Resize observer ensures canvas dynamically tracks container size
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver((entries) => {
        if (!entries[0] || !chartRef.current) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          chartRef.current.applyOptions({
            width: Math.floor(width),
            height: Math.floor(isFullScreen ? height : currentHeight),
          });
        }
      });
      ro.observe(container);
    }

    // Initial fit
    requestAnimationFrame(() => {
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    });

    return () => {
      ro?.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [
    validBars,
    haBars,
    chartType,
    currentHeight,
    isFullScreen,
    isLogScale,
    showVolume,
    volumeData,
    showSma20,
    sma20Data,
    showSma50,
    sma50Data,
    showEma20,
    ema20Data,
    showBollinger,
    bbData,
    showAvgBuy,
    averageBuyPrice,
    show52W,
    high52,
    low52,
    barMap,
    latestBar,
  ]);

  return (
    <div className={`w-full ${isFullScreen ? "h-full flex flex-col min-h-0 space-y-1.5" : "space-y-2"}`}>
      {/* ─── Upstox-Style Interactive Chart Toolbar ─── */}
      {showToolbar && (
        <div className="flex-none flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/70 px-3 py-1.5 text-xs">
          {/* Left: Chart Type & Indicators Popover */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Chart Type Selector */}
            <div className="flex items-center rounded-md border bg-secondary/40 p-0.5">
              {(
                [
                  { type: "candle", label: "Candle" },
                  { type: "heikin-ashi", label: "HA" },
                  { type: "area", label: "Area" },
                  { type: "line", label: "Line" },
                  { type: "bar", label: "Bar" },
                ] as const
              ).map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    chartType === type
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Indicators Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 gap-1.5 text-xs ${
                    activeIndicatorsCount > 0 ? "border-primary/50 text-primary" : ""
                  }`}
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  Indicators
                  {activeIndicatorsCount > 0 && (
                    <span className="ml-0.5 rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                      {activeIndicatorsCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3 font-sans text-xs space-y-2.5" align="start">
                <p className="font-semibold text-foreground uppercase tracking-wider text-[10px] pb-1 border-b">
                  Chart Overlay Indicators
                </p>

                {/* SMA 20 */}
                <label className="flex items-center justify-between cursor-pointer hover:bg-secondary/40 rounded px-1.5 py-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: C.sma20 }} />
                    <span className="font-medium">SMA 20</span>
                  </div>
                  <Checkbox checked={showSma20} onCheckedChange={(v) => setShowSma20(Boolean(v))} />
                </label>

                {/* SMA 50 */}
                <label className="flex items-center justify-between cursor-pointer hover:bg-secondary/40 rounded px-1.5 py-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: C.sma50 }} />
                    <span className="font-medium">SMA 50</span>
                  </div>
                  <Checkbox checked={showSma50} onCheckedChange={(v) => setShowSma50(Boolean(v))} />
                </label>

                {/* EMA 20 */}
                <label className="flex items-center justify-between cursor-pointer hover:bg-secondary/40 rounded px-1.5 py-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: C.ema20 }} />
                    <span className="font-medium">EMA 20</span>
                  </div>
                  <Checkbox checked={showEma20} onCheckedChange={(v) => setShowEma20(Boolean(v))} />
                </label>

                {/* Bollinger Bands */}
                <label className="flex items-center justify-between cursor-pointer hover:bg-secondary/40 rounded px-1.5 py-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: C.bollinger }} />
                    <span className="font-medium">Bollinger Bands (20, 2)</span>
                  </div>
                  <Checkbox checked={showBollinger} onCheckedChange={(v) => setShowBollinger(Boolean(v))} />
                </label>

                {/* Volume */}
                <label className="flex items-center justify-between cursor-pointer hover:bg-secondary/40 rounded px-1.5 py-1">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">Volume Sub-Chart</span>
                  </div>
                  <Checkbox checked={showVolume} onCheckedChange={(v) => setShowVolume(Boolean(v))} />
                </label>

                {/* My Buy Price */}
                {averageBuyPrice && (
                  <label className="flex items-center justify-between cursor-pointer hover:bg-secondary/40 rounded px-1.5 py-1 border-t pt-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      <span className="font-medium">My Buy Price (₹{averageBuyPrice})</span>
                    </div>
                    <Checkbox checked={showAvgBuy} onCheckedChange={(v) => setShowAvgBuy(Boolean(v))} />
                  </label>
                )}

                {/* 52W High & Low */}
                {(high52 || low52) && (
                  <label className="flex items-center justify-between cursor-pointer hover:bg-secondary/40 rounded px-1.5 py-1">
                    <div className="flex items-center gap-2">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">52-Week High/Low Lines</span>
                    </div>
                    <Checkbox checked={show52W} onCheckedChange={(v) => setShow52W(Boolean(v))} />
                  </label>
                )}
              </PopoverContent>
            </Popover>

            {/* Timeframe Resolution Selector (Year, Month, Week, Day, Hour, Minute, Default=Total) */}
            <div className="flex items-center rounded-md border bg-secondary/40 p-0.5">
              <button
                type="button"
                onClick={() => handleIntervalChange("default")}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  selectedInterval === "default"
                    ? "bg-primary text-primary-foreground font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Total Time (Default Board Data)"
              >
                Total
              </button>
              {(
                [
                  { id: "1y", label: "1Y", title: "Yearly Candles (1Y)" },
                  { id: "1mo", label: "1M", title: "Monthly Candles (1M)" },
                  { id: "1wk", label: "1W", title: "Weekly Candles (1W)" },
                  { id: "1d", label: "1D", title: "Daily Candles (1D)" },
                  { id: "1h", label: "1H", title: "Hourly Candles (1H)" },
                  { id: "15m", label: "15m", title: "15-Minute Candles" },
                  { id: "5m", label: "5m", title: "5-Minute Candles" },
                  { id: "1m", label: "1m", title: "1-Minute Candles" },
                ] as const
              ).map(({ id, label, title }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleIntervalChange(id)}
                  disabled={isLoadingInterval}
                  className={`rounded px-1.5 py-1 text-[11px] font-mono transition-colors disabled:opacity-50 ${
                    selectedInterval === id
                      ? "bg-primary text-primary-foreground font-bold shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title={title}
                >
                  {label}
                </button>
              ))}
              {isLoadingInterval && (
                <span className="flex items-center px-1.5 text-primary" title="Loading candles...">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                </span>
              )}
            </div>
          </div>

          {/* Right: Time Range & Controls */}
          <div className="flex items-center gap-2">
            {/* Quick Range Zoom (1M, 3M, 6M, 1Y, ALL) */}
            <div className="flex items-center rounded-md border bg-secondary/40 p-0.5">
              {(["1M", "3M", "6M", "1Y", "ALL"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => handleRangeClick(r)}
                  className={`rounded px-1.5 py-1 text-[11px] font-mono transition-colors ${
                    selectedRange === r
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Log / Linear Scale Toggle */}
            <button
              onClick={() => setIsLogScale((v) => !v)}
              className={`rounded border px-2 py-1 text-[11px] font-mono transition-colors ${
                isLogScale ? "bg-primary/20 text-primary border-primary/50" : "text-muted-foreground hover:bg-secondary"
              }`}
              title="Toggle Logarithmic / Linear scale"
            >
              {isLogScale ? "LOG" : "LIN"}
            </button>

            {/* Fit Content Reset */}
            <button
              onClick={() => {
                chartRef.current?.timeScale().fitContent();
                setSelectedRange("ALL");
              }}
              className="rounded border p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Reset Zoom / Fit Content"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            {/* Expand / Minimize / Full Screen Height */}
            <button
              type="button"
              onClick={() => {
                if (onFullScreen) {
                  onFullScreen();
                } else {
                  setIsExpanded((v) => !v);
                }
              }}
              className="rounded border p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title={
                onFullScreen
                  ? isFullScreen
                    ? "Exit Full Screen"
                    : "Open Full Screen Chart"
                  : isExpanded
                  ? "Collapse height"
                  : "Expand chart height"
              }
            >
              {isFullScreen || isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* ─── Live Dynamic OHLCV HUD Banner (Upstox / TradingView style) ─── */}
      <div className="flex-none flex flex-wrap items-center justify-between gap-2 rounded-md border bg-secondary/30 px-3 py-1 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-3">
          {symbol && <span className="font-bold text-foreground">{symbol}</span>}
          {selectedInterval !== "default" && (
            <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary uppercase">
              {selectedInterval}
            </span>
          )}
          {activeHud?.t && (
            <span className="text-muted-foreground">
              {selectedInterval === "1m" || selectedInterval === "5m" || selectedInterval === "15m" || selectedInterval === "1h"
                ? new Date(activeHud.t * 1000).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                    timeZone: "Asia/Kolkata",
                  })
                : selectedInterval === "1y"
                ? new Date(activeHud.t * 1000).toLocaleDateString("en-IN", {
                    year: "numeric",
                    timeZone: "Asia/Kolkata",
                  })
                : new Date(activeHud.t * 1000).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    timeZone: "Asia/Kolkata",
                  })}
            </span>
          )}
          {activeHud ? (
            <>
              <span>
                <span className="text-muted-foreground mr-1">O:</span>
                <span className="font-semibold text-foreground">{activeHud.o?.toFixed(2)}</span>
              </span>
              <span>
                <span className="text-muted-foreground mr-1">H:</span>
                <span className="font-semibold text-foreground">{activeHud.h?.toFixed(2)}</span>
              </span>
              <span>
                <span className="text-muted-foreground mr-1">L:</span>
                <span className="font-semibold text-foreground">{activeHud.l?.toFixed(2)}</span>
              </span>
              <span>
                <span className="text-muted-foreground mr-1">C:</span>
                <span className="font-semibold text-foreground">{activeHud.c?.toFixed(2)}</span>
              </span>
              {activeHud.changePct != null && (
                <span
                  className={`font-semibold ${
                    activeHud.changePct >= 0 ? "text-bull" : "text-bear"
                  }`}
                >
                  {activeHud.change != null ? (activeHud.change >= 0 ? "+" : "") : ""}
                  {activeHud.change?.toFixed(2)} ({activeHud.changePct >= 0 ? "+" : ""}
                  {activeHud.changePct.toFixed(2)}%)
                </span>
              )}
              {activeHud.v != null && activeHud.v > 0 && (
                <span>
                  <span className="text-muted-foreground mr-1">Vol:</span>
                  <span className="font-semibold text-foreground">{formatIndianVolume(activeHud.v)}</span>
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Hover over candles to view OHLCV</span>
          )}
        </div>

        {/* Active Indicators Removable Badges */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {showSma20 && (
            <span
              className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-foreground cursor-pointer hover:opacity-80"
              onClick={() => setShowSma20(false)}
              title="Click to remove SMA 20"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: C.sma20 }} />
              SMA 20 <X className="h-2.5 w-2.5" />
            </span>
          )}
          {showSma50 && (
            <span
              className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-foreground cursor-pointer hover:opacity-80"
              onClick={() => setShowSma50(false)}
              title="Click to remove SMA 50"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: C.sma50 }} />
              SMA 50 <X className="h-2.5 w-2.5" />
            </span>
          )}
          {showEma20 && (
            <span
              className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-foreground cursor-pointer hover:opacity-80"
              onClick={() => setShowEma20(false)}
              title="Click to remove EMA 20"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: C.ema20 }} />
              EMA 20 <X className="h-2.5 w-2.5" />
            </span>
          )}
          {showBollinger && (
            <span
              className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-foreground cursor-pointer hover:opacity-80"
              onClick={() => setShowBollinger(false)}
              title="Click to remove Bollinger Bands"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: C.bollinger }} />
              BB(20,2) <X className="h-2.5 w-2.5" />
            </span>
          )}
          {showAvgBuy && averageBuyPrice && (
            <span
              className="inline-flex items-center gap-1 rounded bg-blue-500/10 text-blue-500 border border-blue-500/30 px-1.5 py-0.5 font-semibold cursor-pointer hover:opacity-80"
              onClick={() => setShowAvgBuy(false)}
              title="Click to remove Buy Price line"
            >
              Buy ₹{averageBuyPrice} <X className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
      </div>

      {/* ─── Canvas Container ─── */}
      {validBars.length === 0 ? (
        <div
          style={isFullScreen ? undefined : { height: currentHeight }}
          className={`grid place-items-center rounded-lg border border-dashed bg-[#0f1419] text-muted-foreground ${
            isFullScreen ? "flex-1 min-h-[300px]" : "h-64"
          }`}
        >
          {isLoadingInterval ? (
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">Loading {selectedInterval} candles…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-center p-4">
              <p className="text-sm font-medium text-foreground">No candle data for {symbol || "this stock"}</p>
              <p className="text-xs text-muted-foreground">Select another timeframe (1D, 1W, 1M, 1H) from the toolbar above.</p>
            </div>
          )}
        </div>
      ) : (
        <div
          ref={containerRef}
          style={isFullScreen ? undefined : { height: currentHeight }}
          className={`w-full rounded-lg overflow-hidden border bg-[#0f1419] relative ${
            isFullScreen ? "flex-1 min-h-[300px]" : ""
          }`}
        >
          {isLoadingInterval && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-xs">
              <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-lg">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs font-medium">Fetching {selectedInterval} data…</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
