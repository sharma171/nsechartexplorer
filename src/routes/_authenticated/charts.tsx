import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, ExternalLink } from "lucide-react";
import { z } from "zod";
import { fetchOhlc } from "@/lib/market.functions";
import { computeCells, summarise } from "@/lib/candles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StockSearch } from "@/components/StockSearch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CandleChart = lazy(() => import("@/components/CandleChart"));

export const Route = createFileRoute("/_authenticated/charts")({
  validateSearch: z.object({ symbols: z.string().default("") }),
  head: () => ({
    meta: [
      { title: "Compare charts — Candle Colour Tracker" },
      { name: "description", content: "Open several NSE candlestick charts side by side." },
      { property: "og:title", content: "Compare charts — Candle Colour Tracker" },
      { property: "og:description", content: "Open several NSE candlestick charts side by side." },
    ],
  }),
  component: Charts,
});

function Charts() {
  const { symbols } = Route.useSearch();
  const navigate = useNavigate({ from: "/charts" });
  const list = symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const [input, setInput] = useState("");
  const [timeframe, setTimeframe] = useState<"weekly" | "monthly">("weekly");
  const [cols, setCols] = useState("2");
  const getOhlc = useServerFn(fetchOhlc);
  const setList = (l: string[]) => navigate({ search: { symbols: [...new Set(l)].join(",") } });

  const data = useQuery({
    queryKey: ["chart", timeframe, list.join(",")],
    enabled: list.length > 0,
    queryFn: () => getOhlc({ data: { timeframe, items: list.map((s) => ({ symbol: s, exchange: "NSE" })) } }),
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (input.trim()) { setList([...list, ...input.split(/[ ,]+/).map((s) => s.toUpperCase()).filter(Boolean)]); setInput(""); } }}>
          <Input className="w-64 font-mono" placeholder="Or type symbols: TCS, INFY" value={input} onChange={(e) => setInput(e.target.value)} />
          <Button>Add chart</Button>
        </form>
        <div className="w-80"><StockSearch existing={new Set(list.map((s) => `NSE:${s}`))} onAdd={(h) => setList([...list, h.symbol])} placeholder="Search a stock to chart" /></div>
        <Select value={timeframe} onValueChange={(v) => setTimeframe(v as any)}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent>
        </Select>
        <Select value={cols} onValueChange={setCols}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{["1", "2", "3"].map((c) => <SelectItem key={c} value={c}>{c} per row</SelectItem>)}</SelectContent>
        </Select>
        {list.length > 0 && <Button variant="ghost" onClick={() => setList([])}>Clear all</Button>}
      </div>
      {!list.length && <p className="rounded-md border border-dashed p-10 text-center text-muted-foreground">Add one or more symbols to compare their candlestick charts side by side.</p>}
      <div className={`grid gap-4 ${cols === "1" ? "grid-cols-1" : cols === "2" ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>
        {list.map((sym) => {
          const d = data.data?.find((x) => x.symbol === sym);
          const s = d ? summarise(computeCells(d.bars, "standard").slice(-24)) : null;
          return (
            <div key={sym} className="rounded-md border bg-card">
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <span className="font-mono font-bold">{sym}</span>
                <span className="truncate text-xs text-muted-foreground">{d?.name}</span>
                {s && <span className={`text-xs font-semibold ${s.trend === "Bullish" ? "text-bull" : s.trend === "Bearish" ? "text-bear" : "text-muted-foreground"}`}>{s.trend}</span>}
                <a className="ml-auto text-muted-foreground hover:text-foreground" href={`https://www.tradingview.com/chart/?symbol=NSE:${sym}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                <button className="text-muted-foreground hover:text-destructive" onClick={() => setList(list.filter((x) => x !== sym))}><X className="h-4 w-4" /></button>
              </div>
              <div className="p-2">
                {data.isLoading ? <div className="grid h-[300px] place-items-center text-muted-foreground">Loading…</div> :
                  d?.error ? <div className="grid h-[300px] place-items-center text-bear">{d.error}</div> :
                  d ? <Suspense fallback={<div className="h-[300px]" />}><CandleChart bars={d.bars} symbol={d.symbol} high52={d.fiftyTwoWeekHigh} low52={d.fiftyTwoWeekLow} /></Suspense> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
