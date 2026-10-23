import type { Bar } from "./candles";

export type WeekStats = {
  t: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  range: number | null;
  rangePct: number | null;
  changePct: number | null;
};

export type WeekHistoryItem = {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  range: number;
  rangePct: number;
  changePct: number;
  isGreen: boolean;
};

export type Pivots = {
  r2: number | null;
  r1: number | null;
  pivot: number | null;
  s1: number | null;
  s2: number | null;
};

export type MacdResult = {
  macdLine: number | null;
  signalLine: number | null;
  histogram: number | null;
  trend: "Bullish" | "Bearish" | null;
};

export type BollingerBands = {
  upper: number | null;
  middle: number | null;
  lower: number | null;
  bandwidth: number | null;
  percentB: number | null;
};

export type StockIndicators = {
  currentPrice: number | null;
  // 52-week statistics
  high52: number | null;
  low52: number | null;
  pctFrom52High: number | null; // e.g. -5.2%
  pctFrom52Low: number | null;  // e.g. +34.5%
  range52PositionPct: number | null; // 0 to 100%

  // Current & previous week stats
  currentWeek: WeekStats | null;
  prevWeek: WeekStats | null;

  // Recent weeks breakdown (up to last 10 weeks)
  recentWeeks: WeekHistoryItem[];

  // Technical Indicators
  rsi14: number | null;
  rsiStatus: "Overbought" | "Oversold" | "Neutral" | null;

  // Moving averages
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  ema50: number | null;
  priceVsSma20Pct: number | null;
  priceVsSma50Pct: number | null;

  // MACD & Bollinger
  macd: MacdResult | null;
  bollinger: BollingerBands | null;

  // ATR & Pivots
  atr14: number | null;
  pivots: Pivots | null;
};

/** Compute Simple Moving Average for a series of numbers */
export function calculateSma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Number((sum / period).toFixed(2));
}

/** Compute Exponential Moving Average */
export function calculateEma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  const k = 2 / (period + 1);
  // Start with SMA of first period items
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i]! * k + ema * (1 - k);
  }
  return Number(ema.toFixed(2));
}

/** Compute EMA series */
export function calculateEmaSeries(values: number[], period: number): (number | null)[] {
  if (values.length < period || period <= 0) return values.map(() => null);
  const result: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i]! * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

/** Compute RSI (Wilder's 14-period RSI) */
export function calculateRsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i]! - closes[i - 1]!);
  }

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 0; i < period; i++) {
    const diff = changes[i]!;
    if (diff > 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period; i < changes.length; i++) {
    const diff = changes[i]!;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return Number(rsi.toFixed(1));
}

/** Compute MACD (12, 26, 9) */
export function calculateMacd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult | null {
  if (closes.length < slow + signalPeriod) return null;

  const fastEma = calculateEmaSeries(closes, fast);
  const slowEma = calculateEmaSeries(closes, slow);

  const macdSeries: number[] = [];
  const validIndices: number[] = [];
  for (let i = slow - 1; i < closes.length; i++) {
    if (fastEma[i] != null && slowEma[i] != null) {
      macdSeries.push(fastEma[i]! - slowEma[i]!);
      validIndices.push(i);
    }
  }

  if (macdSeries.length < signalPeriod) return null;
  const signal = calculateEma(macdSeries, signalPeriod);
  const latestMacd = macdSeries[macdSeries.length - 1]!;

  if (signal === null) return null;
  const histogram = Number((latestMacd - signal).toFixed(2));

  return {
    macdLine: Number(latestMacd.toFixed(2)),
    signalLine: Number(signal.toFixed(2)),
    histogram,
    trend: histogram >= 0 ? "Bullish" : "Bearish",
  };
}

/** Compute Bollinger Bands (period 20, 2 std deviations) */
export function calculateBollingerBands(closes: number[], period = 20, stdMult = 2): BollingerBands | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = middle + stdMult * stdDev;
  const lower = middle - stdMult * stdDev;
  const current = closes[closes.length - 1]!;
  const bandwidth = middle > 0 ? ((upper - lower) / middle) * 100 : null;
  const percentB = upper > lower ? (current - lower) / (upper - lower) : null;

  return {
    upper: Number(upper.toFixed(2)),
    middle: Number(middle.toFixed(2)),
    lower: Number(lower.toFixed(2)),
    bandwidth: bandwidth !== null ? Number(bandwidth.toFixed(2)) : null,
    percentB: percentB !== null ? Number(percentB.toFixed(2)) : null,
  };
}

/** Compute Average True Range (14 period) */
export function calculateAtr(bars: Bar[], period = 14): number | null {
  const validBars = bars.filter((b) => b.h != null && b.l != null && b.c != null);
  if (validBars.length <= period) return null;

  const trs: number[] = [];
  for (let i = 1; i < validBars.length; i++) {
    const cur = validBars[i]!;
    const prev = validBars[i - 1]!;
    const tr = Math.max(
      cur.h! - cur.l!,
      Math.abs(cur.h! - prev.c!),
      Math.abs(cur.l! - prev.c!),
    );
    trs.push(tr);
  }

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]!) / period;
  }
  return Number(atr.toFixed(2));
}

/** Classic Floor Pivot Points from the previous bar */
export function calculateClassicPivots(prevBar: Bar | null): Pivots | null {
  if (!prevBar || prevBar.h == null || prevBar.l == null || prevBar.c == null) return null;
  const h = prevBar.h;
  const l = prevBar.l;
  const c = prevBar.c;
  const p = Number(((h + l + c) / 3).toFixed(2));
  const r1 = Number((2 * p - l).toFixed(2));
  const s1 = Number((2 * p - h).toFixed(2));
  const r2 = Number((p + (h - l)).toFixed(2));
  const s2 = Number((p - (h - l)).toFixed(2));

  return {
    pivot: p,
    r1,
    s1,
    r2,
    s2,
  };
}

/**
 * Master function to compute all indicators and 52W / week-wise statistics
 * for a stock given its bars and optional latest close.
 */
export function computeStockIndicators(
  bars: Bar[],
  latestCloseOverride?: number | null,
  meta52High?: number | null,
  meta52Low?: number | null,
): StockIndicators {
  const validBars = bars.filter(
    (b) => b.h != null && b.l != null && b.c != null && b.o != null && b.c > 0,
  );

  const closes = validBars.map((b) => b.c as number);
  const lastBar = validBars.length > 0 ? validBars[validBars.length - 1]! : null;
  const prevBar = validBars.length > 1 ? validBars[validBars.length - 2]! : null;

  const currentPrice = latestCloseOverride ?? (lastBar ? lastBar.c : null);

  // 1. 52-Week High & Low
  // 52 weeks is ~52 bars in weekly timeframe, or roughly 365 days
  let high52: number | null = meta52High ?? null;
  let low52: number | null = meta52Low ?? null;

  if (validBars.length > 0) {
    // If not provided in metadata or to ensure accurate bar coverage:
    // Take the last 52 bars or bars within 365 days
    const latestTime = lastBar?.t ?? Date.now() / 1000;
    const oneYearAgo = latestTime - 365 * 24 * 3600;
    const bars52 = validBars.filter((b) => b.t >= oneYearAgo);
    const candidateBars = bars52.length >= 10 ? bars52 : validBars.slice(-52);

    const computedHigh = Math.max(...candidateBars.map((b) => b.h!));
    const computedLow = Math.min(...candidateBars.map((b) => b.l!));

    high52 = high52 != null ? Math.max(high52, computedHigh) : computedHigh;
    low52 = low52 != null ? Math.min(low52, computedLow) : computedLow;
  }

  let pctFrom52High: number | null = null;
  let pctFrom52Low: number | null = null;
  let range52PositionPct: number | null = null;

  if (currentPrice != null && high52 != null && low52 != null) {
    if (high52 > 0) {
      pctFrom52High = Number((((currentPrice - high52) / high52) * 100).toFixed(2));
    }
    if (low52 > 0) {
      pctFrom52Low = Number((((currentPrice - low52) / low52) * 100).toFixed(2));
    }
    if (high52 > low52) {
      const pos = ((currentPrice - low52) / (high52 - low52)) * 100;
      range52PositionPct = Number(Math.min(100, Math.max(0, pos)).toFixed(1));
    }
  }

  // 2. Week-Wise Stats
  const currentWeek: WeekStats | null = lastBar
    ? {
        t: lastBar.t,
        open: lastBar.o,
        high: lastBar.h,
        low: lastBar.l,
        close: lastBar.c,
        range: lastBar.h != null && lastBar.l != null ? Number((lastBar.h - lastBar.l).toFixed(2)) : null,
        rangePct:
          lastBar.h != null && lastBar.l != null && lastBar.l > 0
            ? Number((((lastBar.h - lastBar.l) / lastBar.l) * 100).toFixed(2))
            : null,
        changePct:
          lastBar.o != null && lastBar.c != null && lastBar.o > 0
            ? Number((((lastBar.c - lastBar.o) / lastBar.o) * 100).toFixed(2))
            : null,
      }
    : null;

  const prevWeek: WeekStats | null = prevBar
    ? {
        t: prevBar.t,
        open: prevBar.o,
        high: prevBar.h,
        low: prevBar.l,
        close: prevBar.c,
        range: prevBar.h != null && prevBar.l != null ? Number((prevBar.h - prevBar.l).toFixed(2)) : null,
        rangePct:
          prevBar.h != null && prevBar.l != null && prevBar.l > 0
            ? Number((((prevBar.h - prevBar.l) / prevBar.l) * 100).toFixed(2))
            : null,
        changePct:
          prevBar.o != null && prevBar.c != null && prevBar.o > 0
            ? Number((((prevBar.c - prevBar.o) / prevBar.o) * 100).toFixed(2))
            : null,
      }
    : null;

  // Recent weeks breakdown (up to last 10 weeks, newest first)
  const recentWeeks: WeekHistoryItem[] = validBars
    .slice(-10)
    .reverse()
    .map((b) => {
      const open = b.o!;
      const high = b.h!;
      const low = b.l!;
      const close = b.c!;
      const range = high - low;
      const rangePct = low > 0 ? (range / low) * 100 : 0;
      const changePct = open > 0 ? ((close - open) / open) * 100 : 0;
      return {
        t: b.t,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        range: Number(range.toFixed(2)),
        rangePct: Number(rangePct.toFixed(2)),
        changePct: Number(changePct.toFixed(2)),
        isGreen: close >= open,
      };
    });

  // 3. Technical Indicators
  const rsi14 = calculateRsi(closes, 14);
  const rsiStatus: StockIndicators["rsiStatus"] =
    rsi14 == null ? null : rsi14 >= 70 ? "Overbought" : rsi14 <= 30 ? "Oversold" : "Neutral";

  const sma20 = calculateSma(closes, 20);
  const sma50 = calculateSma(closes, 50);
  const sma200 = calculateSma(closes, 200);

  const ema20 = calculateEma(closes, 20);
  const ema50 = calculateEma(closes, 50);

  const priceVsSma20Pct =
    currentPrice != null && sma20 != null && sma20 > 0
      ? Number((((currentPrice - sma20) / sma20) * 100).toFixed(2))
      : null;

  const priceVsSma50Pct =
    currentPrice != null && sma50 != null && sma50 > 0
      ? Number((((currentPrice - sma50) / sma50) * 100).toFixed(2))
      : null;

  const macd = calculateMacd(closes);
  const bollinger = calculateBollingerBands(closes);
  const atr14 = calculateAtr(validBars, 14);
  const pivots = calculateClassicPivots(prevBar);

  return {
    currentPrice,
    high52,
    low52,
    pctFrom52High,
    pctFrom52Low,
    range52PositionPct,
    currentWeek,
    prevWeek,
    recentWeeks,
    rsi14,
    rsiStatus,
    sma20,
    sma50,
    sma200,
    ema20,
    ema50,
    priceVsSma20Pct,
    priceVsSma50Pct,
    macd,
    bollinger,
    atr14,
    pivots,
  };
}
