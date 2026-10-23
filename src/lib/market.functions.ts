import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type Bar, aggregateBarsByYear } from "./candles";

export type SymbolData = {
  symbol: string;
  exchange: string;
  bars: Bar[];
  error: string | null;
  name?: string;
  latestClose: number | null;
  latestCloseAt: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
};

const yahooSymbol = (symbol: string, exchange: string) => {
  const s = symbol.trim().toUpperCase();
  if (s.includes(".") || s.startsWith("^")) return s;
  return `${s}.${exchange === "BSE" ? "BO" : "NS"}`;
};

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
};

async function fetchYahooJson(path: string): Promise<{ ok: boolean; status: number; json: any }> {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  let lastStatus = 500;
  for (const host of hosts) {
    try {
      const res = await fetch(`https://${host}${path}`, { headers: YAHOO_HEADERS });
      lastStatus = res.status;
      if (res.ok) {
        const json = await res.json();
        return { ok: true, status: res.status, json };
      }
      if (res.status === 404) {
        return { ok: false, status: 404, json: null };
      }
    } catch {
      // try next host mirror
    }
  }
  return { ok: false, status: lastStatus, json: null };
}

async function fetchOne(symbol: string, exchange: string, timeframe: "weekly" | "monthly"): Promise<SymbolData> {
  const interval = timeframe === "weekly" ? "1wk" : "1mo";
  const range = timeframe === "weekly" ? "3y" : "10y";
  const yahoo = encodeURIComponent(yahooSymbol(symbol, exchange));
  const chartPath = `/v8/finance/chart/${yahoo}?interval=${interval}&range=${range}`;
  const dailyPath = `/v8/finance/chart/${yahoo}?interval=1d&range=1mo`;
  try {
    const [chartResult, dailyResult] = await Promise.all([
      fetchYahooJson(chartPath),
      fetchYahooJson(dailyPath).catch(() => ({ ok: false, status: 500, json: null })),
    ]);
    const json = chartResult.json;
    const r = json?.chart?.result?.[0];
    const daily = dailyResult.json?.chart?.result?.[0];
    const dailyCloses = daily?.indicators?.quote?.[0]?.close as (number | null)[] | undefined;
    const dailyTimestamps = daily?.timestamp as number[] | undefined;
    let latestDailyIndex = -1;
    if (dailyCloses) {
      for (let i = dailyCloses.length - 1; i >= 0; i--) {
        const close = dailyCloses[i];
        if (typeof close === "number" && Number.isFinite(close)) {
          latestDailyIndex = i;
          break;
        }
      }
    }
    const latestClose = latestDailyIndex >= 0 ? dailyCloses?.[latestDailyIndex] ?? null : null;
    const latestCloseAt = latestDailyIndex >= 0 ? dailyTimestamps?.[latestDailyIndex] ?? null : null;
    if (!chartResult.ok) return { symbol, exchange, bars: [], error: chartResult.status === 404 ? "Symbol not found" : `Data source error (${chartResult.status})`, latestClose, latestCloseAt, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null };
    if (!r?.timestamp) return { symbol, exchange, bars: [], error: json?.chart?.error?.description ?? "No data returned", latestClose, latestCloseAt, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null };
    const fiftyTwoWeekHigh = typeof r.meta?.fiftyTwoWeekHigh === "number" ? r.meta.fiftyTwoWeekHigh : null;
    const fiftyTwoWeekLow = typeof r.meta?.fiftyTwoWeekLow === "number" ? r.meta.fiftyTwoWeekLow : null;
    const q = r.indicators.quote[0];
    const bars: Bar[] = r.timestamp.map((t: number, i: number) => ({
      t,
      o: q.open[i],
      h: q.high[i],
      l: q.low[i],
      c: q.close[i],
      v: q.volume ? q.volume[i] : null,
    }));
    return { symbol, exchange, bars, error: null, name: r.meta?.longName ?? r.meta?.shortName, latestClose, latestCloseAt, fiftyTwoWeekHigh, fiftyTwoWeekLow };
  } catch (e) {
    console.error("market fetch failed", symbol, e);
    return { symbol, exchange, bars: [], error: "Network error", latestClose: null, latestCloseAt: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null };
  }
}

export const fetchOhlc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      timeframe: z.enum(["weekly", "monthly"]),
      items: z.array(z.object({ symbol: z.string().min(1).max(30), exchange: z.string().max(5) })).max(100),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const out: SymbolData[] = [];
    const queue = [...data.items];
    // Each symbol uses two data requests, so three workers stay within the runtime's six-connection limit.
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (queue.length) {
          const it = queue.shift()!;
          out.push(await fetchOne(it.symbol, it.exchange, data.timeframe));
        }
      }),
    );
    return out;
  });

export const searchSymbols = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const searchPath = `/v1/finance/search?q=${encodeURIComponent(data.q)}&quotesCount=20&newsCount=0&enableFuzzyQuery=true&region=IN&lang=en-IN`;
      const res = await fetchYahooJson(searchPath);
      const json = res.json ?? {};
      return ((json.quotes ?? []) as any[])
        .filter((q) => typeof q.symbol === "string" && (q.quoteType === "EQUITY" || q.quoteType === "ETF") && (q.symbol.endsWith(".NS") || q.symbol.endsWith(".BO")))
        .map((q) => ({
          symbol: q.symbol.replace(/\.(NS|BO)$/, ""),
          exchange: q.symbol.endsWith(".BO") ? "BSE" : "NSE",
          name: (q.longname ?? q.shortname ?? q.symbol) as string,
          sector: (q.sector ?? null) as string | null,
        }));
    } catch {
      return [];
    }
  });

export type ChartInterval = "1m" | "5m" | "15m" | "1h" | "1d" | "1wk" | "1mo" | "1y";

export async function fetchIntervalBars(
  symbol: string,
  exchange: string,
  interval: ChartInterval,
): Promise<{ bars: Bar[]; error: string | null }> {
  const yahoo = encodeURIComponent(yahooSymbol(symbol, exchange));
  let qInterval = interval;
  let qRange = "1y";

  if (interval === "1m") {
    qInterval = "1m";
    qRange = "5d";
  } else if (interval === "5m") {
    qInterval = "5m";
    qRange = "1mo";
  } else if (interval === "15m") {
    qInterval = "15m";
    qRange = "1mo";
  } else if (interval === "1h") {
    qInterval = "60m";
    qRange = "6mo";
  } else if (interval === "1d") {
    qInterval = "1d";
    qRange = "2y";
  } else if (interval === "1wk") {
    qInterval = "1wk";
    qRange = "5y";
  } else if (interval === "1mo") {
    qInterval = "1mo";
    qRange = "10y";
  } else if (interval === "1y") {
    qInterval = "1mo";
    qRange = "max";
  }

  const chartPath = `/v8/finance/chart/${yahoo}?interval=${qInterval}&range=${qRange}`;
  try {
    const res = await fetchYahooJson(chartPath);
    if (!res.ok) return { bars: [], error: `Data source error (${res.status})` };
    const json = res.json ?? {};
    const r = json?.chart?.result?.[0];
    if (!r?.timestamp) return { bars: [], error: json?.chart?.error?.description ?? "No data returned" };
    const q = r.indicators.quote[0];
    let bars: Bar[] = r.timestamp
      .map((t: number, i: number) => ({
        t,
        o: q.open[i],
        h: q.high[i],
        l: q.low[i],
        c: q.close[i],
        v: q.volume ? q.volume[i] : null,
      }))
      .filter((b: Bar) => b.o != null && b.h != null && b.l != null && b.c != null);

    if (interval === "1y") {
      bars = aggregateBarsByYear(bars);
    }
    return { bars, error: null };
  } catch (e: any) {
    console.error("fetchIntervalBars error", symbol, e);
    return { bars: [], error: "Network error" };
  }
}

export const fetchSymbolChart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      symbol: z.string().min(1).max(30),
      exchange: z.string().max(5).default("NSE"),
      interval: z.enum(["1m", "5m", "15m", "1h", "1d", "1wk", "1mo", "1y"]),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    return await fetchIntervalBars(data.symbol, data.exchange, data.interval as ChartInterval);
  });

