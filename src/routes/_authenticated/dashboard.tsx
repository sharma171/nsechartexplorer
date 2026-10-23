import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Plus, Trash2, Download, LineChart, ExternalLink, ListPlus, Pencil, Check, X, TrendingUp, TrendingDown, Activity, BarChart2, Gauge, Compass, Layers, ArrowUpRight, ArrowDownRight, Maximize2 } from "lucide-react";
import { StockSearch, type StockHit } from "@/components/StockSearch";
import { RotatePrompt } from "@/components/RotatePrompt";
import { NIFTY50 } from "@/lib/nifty";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fetchOhlc, type SymbolData } from "@/lib/market.functions";
import { computeCells, summarise, periodLabel, type Cell, type Method } from "@/lib/candles";
import { calculatePosition, summarisePortfolio } from "@/lib/portfolio";
import { computeStockIndicators, type StockIndicators } from "@/lib/indicators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { lazy, Suspense } from "react";
import { FullScreenChartDialog } from "@/components/FullScreenChartDialog";

const CandleChart = lazy(() => import("@/components/CandleChart"));


type Board = Tables<"boards">;
type Company = Tables<"companies">;
const ACTIONS = ["Hold", "Review", "Exit Consideration", "Remain Out", "Wait", "Monitor", "Enter"];

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Boards — Candle Colour Tracker" },
      { name: "description", content: "Weekly and monthly candle colour grid for your NSE companies." },
      { property: "og:title", content: "Boards — Candle Colour Tracker" },
      { property: "og:description", content: "Weekly and monthly candle colour grid for your NSE companies." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const boards = useQuery({
    queryKey: ["boards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("boards").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = boards.data?.find((b) => b.id === activeId) ?? boards.data?.[0];

  const createBoard = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from("boards").insert({ name }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (b) => { qc.invalidateQueries({ queryKey: ["boards"] }); setActiveId(b.id); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <TooltipProvider delayDuration={100}>
      <RotatePrompt />
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        {boards.data?.map((b) => (
          <button key={b.id} onClick={() => setActiveId(b.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${active?.id === b.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {b.name}
          </button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => { const n = prompt("Board name", "Watchlist"); if (n?.trim()) createBoard.mutate(n.trim()); }}>
          <Plus className="h-4 w-4" /> New board
        </Button>
      </div>
      {boards.isLoading ? <p className="p-6 text-muted-foreground">Loading…</p> :
        !active ? (
          <div className="mx-auto max-w-md p-12 text-center">
            <h2 className="font-display text-2xl font-bold">Create your first board</h2>
            <p className="mt-2 text-muted-foreground">A board is one colour grid of companies, e.g. your Portfolio or a Watchlist.</p>
            <Button className="mt-6" onClick={() => createBoard.mutate("Portfolio")}>Create "Portfolio"</Button>
          </div>
        ) : <BoardView key={active.id} board={active} />}
    </TooltipProvider>
  );
}

function BoardView({ board }: { board: Board }) {
  const qc = useQueryClient();
  const getOhlc = useServerFn(fetchOhlc);
  const timeframe = board.timeframe as "weekly" | "monthly";
  const periods = timeframe === "weekly" ? board.weekly_periods : board.monthly_periods;

  const [fullScreenTarget, setFullScreenTarget] = useState<{
    co: Company;
    bars: import("@/lib/candles").Bar[];
    quote?: SymbolData | null;
    portRow?: DashRowPortData;
    indicators?: StockIndicators | null;
  } | null>(null);

  const companies = useQuery({
    queryKey: ["companies", board.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("board_id", board.id).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const activeCos = (companies.data ?? []).filter((c) => c.active);
  const symKey = activeCos.map((c) => `${c.exchange}:${c.symbol}`).sort().join(",");

  const market = useQuery({
    queryKey: ["ohlc", timeframe, symKey],
    enabled: activeCos.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await getOhlc({ data: { timeframe, items: activeCos.map((c) => ({ symbol: c.symbol, exchange: c.exchange })) } });
      const failed = res.filter((r) => r.error);
      const rows = res.map((r) => ({ board_id: board.id, symbol: r.symbol, status: r.error ? "failed" : "ok", message: r.error ?? `${r.bars.length} ${timeframe} bars` }));
      await supabase.from("refresh_log").insert(rows);
      await supabase.from("boards").update({ last_refreshed: new Date().toISOString() }).eq("id", board.id);
      qc.invalidateQueries({ queryKey: ["boards"] });
      qc.invalidateQueries({ queryKey: ["log", board.id] });
      if (failed.length) toast.warning(`${failed.length} symbol(s) failed — see Error Log`);
      return Object.fromEntries(res.map((r) => [`${r.exchange}:${r.symbol}`, r])) as Record<string, SymbolData>;
    },
  });

  const updateBoard = async (patch: Partial<Board>) => {
    const { error } = await supabase.from("boards").update(patch).eq("id", board.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["boards"] });
  };

  const rows = useMemo(() => {
    return (companies.data ?? []).map((co) => {
      const d = market.data?.[`${co.exchange}:${co.symbol}`];
      const all = d ? computeCells(d.bars, board.method as Method, Number(board.tolerance)) : [];
      const cells = all.slice(-periods);
      return { co, cells, error: d?.error ?? null, summary: summarise(cells) };
    });
  }, [companies.data, market.data, periods, board.method, board.tolerance]);

  const portfolioRows = useMemo(() => activeCos.map((co) => {
    const quote = market.data?.[`${co.exchange}:${co.symbol}`];
    return {
      co,
      ...calculatePosition({
        quantity: co.quantity,
        averageBuyPrice: co.average_buy_price,
        latestClose: quote?.latestClose ?? null,
        sector: co.sector,
      }),
      latestCloseAt: quote?.latestCloseAt ?? null,
    };
  }), [companies.data, market.data]);
  const portfolio = useMemo(() => summarisePortfolio(portfolioRows.map(({ co, ...position }) => ({
    quantity: position.quantity,
    averageBuyPrice: position.averageBuyPrice,
    latestClose: position.latestClose,
    sector: co.sector,
  }))), [portfolioRows]);
  const sectorTotals = useMemo(() => {
    const totals = new Map<string, number>();
    portfolioRows.forEach(({ co, currentValue }) => {
      if (currentValue !== null) {
        const sector = co.sector?.trim() || "Not categorized";
        totals.set(sector, (totals.get(sector) ?? 0) + currentValue);
      }
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [portfolioRows]);
  const largestHolding = [...portfolioRows].filter((p) => p.currentValue !== null).sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0))[0];
  const largestSector = sectorTotals[0];
  const money = (value: number | null | undefined) => value == null
    ? "—"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);

  // Column headers: union of period timestamps across rows
  const headers = useMemo(() => {
    const longest = rows.reduce<Cell[]>((a, r) => (r.cells.length > a.length ? r.cells : a), []);
    return longest.map((c) => c.t);
  }, [rows]);
  const ordered = board.reverse_order ? [...headers].reverse() : headers;
  const [filter, setFilter] = useState("");
  const [trendFilter, setTrendFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [sortBy, setSortBy] = useState("added");
  const sectors = [...new Set((companies.data ?? []).map((c) => c.sector).filter(Boolean) as string[])].sort();
  const visible = useMemo(() => {
    const t = filter.trim().toLowerCase();
    const v = rows.filter((r) => r.co.active
      && (!t || r.co.name.toLowerCase().includes(t) || r.co.symbol.toLowerCase().includes(t))
      && (trendFilter === "all" || (trendFilter === "fresh" ? r.summary.freshChange : r.summary.trend === trendFilter))
      && (sectorFilter === "all" || r.co.sector === sectorFilter));
    const rank = { Bullish: 0, Mixed: 1, Bearish: 2, "Data pending": 3 } as const;
    const signedStreak = (r: (typeof v)[number]) => (r.summary.streakColour === "red" ? -r.summary.streak : r.summary.streak);
    if (sortBy === "name") v.sort((a, b) => a.co.name.localeCompare(b.co.name));
    if (sortBy === "trend") v.sort((a, b) => rank[a.summary.trend] - rank[b.summary.trend]);
    if (sortBy === "streak") v.sort((a, b) => signedStreak(b) - signedStreak(a));
    if (sortBy === "sector") v.sort((a, b) => (a.co.sector ?? "~").localeCompare(b.co.sector ?? "~"));
    return v;
  }, [rows, filter, trendFilter, sectorFilter, sortBy]);
  const existing = useMemo(() => new Set((companies.data ?? []).map((c) => `${c.exchange}:${c.symbol}`)), [companies.data]);
  async function quickAdd(h: StockHit) {
    const { error } = await supabase.from("companies").insert({ board_id: board.id, name: h.name, symbol: h.symbol, exchange: h.exchange, sector: h.sector });
    if (error) { toast.error(error.message); return; }
    toast.success(`${h.symbol} added`);
    qc.invalidateQueries({ queryKey: ["companies", board.id] });
  }

  const counts = rows.filter((r) => r.co.active).reduce(
    (a, r) => { a[r.summary.trend]++; if (r.summary.freshChange) a.changed++; return a; },
    { Bullish: 0, Bearish: 0, Mixed: 0, "Data pending": 0, changed: 0 } as { Bullish: number; Bearish: number; Mixed: number; "Data pending": number; changed: number },
  );

  async function exportXlsx() {
    const XLSX = await import("xlsx-js-style");
    const fill: Record<string, string> = { green: "22C55E", red: "EF4444", neutral: "A3A3A3", nodata: "D4D4D4" };
    const head = [
      "Company", "Symbol", "Shares", "Average Buy Price", "Latest Close",
      "52W High", "52W Low", "Week High", "Week Low", "RSI (14)",
      "Invested Amount", "Current Value", "Unrealized P/L", "P/L %",
      ...ordered.map((t) => periodLabel(t, timeframe)),
      "Current Trend", "Streak", "Action", "Observation", "Last Reviewed"
    ];
    const aoa: any[][] = [head.map((v) => ({ v, s: { font: { bold: true } } }))];
    rows.filter((r) => r.co.active).forEach((r) => {
      const byT = new Map(r.cells.map((c) => [c.t, c]));
      const quote = market.data?.[`${r.co.exchange}:${r.co.symbol}`];
      const ind = computeStockIndicators(quote?.bars ?? [], quote?.latestClose, quote?.fiftyTwoWeekHigh, quote?.fiftyTwoWeekLow);
      aoa.push([
        r.co.name, r.co.symbol, r.co.quantity ?? "", r.co.average_buy_price ?? "",
        quote?.latestClose ?? "",
        ind.high52 ?? "",
        ind.low52 ?? "",
        ind.currentWeek?.high ?? "",
        ind.currentWeek?.low ?? "",
        ind.rsi14 ?? "",
        calculatePosition({ quantity: r.co.quantity, averageBuyPrice: r.co.average_buy_price, latestClose: quote?.latestClose ?? null }).invested ?? "",
        calculatePosition({ quantity: r.co.quantity, averageBuyPrice: r.co.average_buy_price, latestClose: quote?.latestClose ?? null }).currentValue ?? "",
        calculatePosition({ quantity: r.co.quantity, averageBuyPrice: r.co.average_buy_price, latestClose: quote?.latestClose ?? null }).profitLoss ?? "",
        calculatePosition({ quantity: r.co.quantity, averageBuyPrice: r.co.average_buy_price, latestClose: quote?.latestClose ?? null }).profitLossPercent ?? "",
        ...ordered.map((t) => {
          const c = byT.get(t); const col = c?.colour ?? "nodata";
          return { v: col === "nodata" ? "N/A" : c?.bar.c?.toFixed(2) ?? "", s: { fill: { fgColor: { rgb: fill[col] } } } };
        }),
        r.summary.trend, r.summary.streak, r.co.action ?? "", r.co.observation ?? "", r.co.last_reviewed ?? "",
      ]);
    });
    aoa.push([]);
    aoa.push([`Method: ${board.method}`, `Timeframe: ${timeframe}`, `Source: Yahoo Finance (NSE)`, `Refreshed: ${board.last_refreshed ?? "-"}`]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Dashboard");
    const raw: any[][] = [["Symbol", "Date", "Open", "High", "Low", "Close", "Colour"]];
    rows.forEach((r) => r.cells.forEach((c) => raw.push([r.co.symbol, new Date(c.t * 1000).toISOString().slice(0, 10), c.bar.o, c.bar.h, c.bar.l, c.bar.c, c.colour])));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(raw), "Raw Data");
    XLSX.writeFile(wb, `${board.name}-${timeframe}.xlsx`);
  }

  return (
    <Tabs defaultValue="dashboard" className="px-4 py-3">
      {fullScreenTarget && (
        <FullScreenChartDialog
          open={Boolean(fullScreenTarget)}
          onOpenChange={(v) => !v && setFullScreenTarget(null)}
          co={fullScreenTarget.co}
          bars={fullScreenTarget.bars}
          quote={fullScreenTarget.quote}
          portRow={fullScreenTarget.portRow}
          indicators={fullScreenTarget.indicators}
          money={money}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="master">Company Master ({companies.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="log">Error Log</TabsTrigger>
        </TabsList>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          <Select value={timeframe} onValueChange={(v) => updateBoard({ timeframe: v })}>
            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-muted-foreground">Periods
            <Input type="number" min={4} max={120} className="h-8 w-16" defaultValue={periods} key={timeframe}
              onBlur={(e) => { const n = Math.min(120, Math.max(4, Number(e.target.value) || periods)); updateBoard(timeframe === "weekly" ? { weekly_periods: n } : { monthly_periods: n }); }} />
          </label>
          <Select value={board.method} onValueChange={(v) => updateBoard({ method: v })}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="heikin-ashi">Heikin-Ashi</SelectItem></SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-muted-foreground">Neutral ±%
            <Input type="number" step="0.1" min={0} max={5} className="h-8 w-16" defaultValue={Number(board.tolerance)}
              onBlur={(e) => updateBoard({ tolerance: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label className="flex items-center gap-1.5 text-muted-foreground">Newest left
            <Switch checked={board.reverse_order} onCheckedChange={(v) => updateBoard({ reverse_order: v })} />
          </label>
          <Button size="sm" variant="outline" onClick={exportXlsx} disabled={!rows.length}><Download className="h-4 w-4" />Excel</Button>
          <Button size="sm" onClick={() => market.refetch()} disabled={market.isFetching || !activeCos.length}>
            <RefreshCw className={`h-4 w-4 ${market.isFetching ? "animate-spin" : ""}`} />Refresh Data
          </Button>
        </div>
      </div>

      <TabsContent value="dashboard" className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border bg-card px-4 py-2 text-xs">
          <Legend cls="bg-bull" label="Green — Close > Open (bullish)" />
          <Legend cls="bg-bear" label="Red — Close < Open (bearish)" />
          <Legend cls="bg-neutral-candle" label="Neutral — Close ≈ Open" />
          <Legend cls="bg-nodata" label="Grey hatched — no data" />
          <span className="text-muted-foreground">Method: <b className="text-foreground">{board.method === "standard" ? "Standard" : "Heikin-Ashi"}</b></span>
          <span className="text-muted-foreground">Source: <b className="text-foreground">Yahoo Finance · NSE</b></span>
          <span className="text-muted-foreground">Last refreshed: <b className="font-mono text-foreground">{board.last_refreshed ? new Date(board.last_refreshed).toLocaleString("en-IN") : "never"}</b></span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-80"><StockSearch existing={existing} onAdd={quickAdd} placeholder="Quick add: type a stock name or symbol" /></div>
          <Input className="h-9 w-48" placeholder="Filter rows…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <Select value={trendFilter} onValueChange={setTrendFilter}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All trends</SelectItem><SelectItem value="Bullish">Bullish</SelectItem><SelectItem value="Bearish">Bearish</SelectItem>
              <SelectItem value="Mixed">Mixed</SelectItem><SelectItem value="fresh">Fresh colour change</SelectItem><SelectItem value="Data pending">Data pending</SelectItem>
            </SelectContent>
          </Select>
          {sectors.length > 0 && (
            <Select value={sectorFilter} onValueChange={setSectorFilter}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All sectors</SelectItem>{sectors.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="added">Sort: order added</SelectItem><SelectItem value="name">Sort: name</SelectItem>
              <SelectItem value="trend">Sort: trend</SelectItem><SelectItem value="streak">Sort: green streak first</SelectItem><SelectItem value="sector">Sort: sector</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Stat label="Bullish" value={counts.Bullish} cls="text-bull" />
          <Stat label="Bearish" value={counts.Bearish} cls="text-bear" />
          <Stat label="Mixed" value={counts.Mixed} />
          <Stat label="Fresh colour change" value={counts.changed} cls="text-primary" />
          <Stat label="Data pending" value={counts["Data pending"]} />
        </div>
        {!companies.data?.length ? (
          <p className="rounded-md border border-dashed p-8 text-center text-muted-foreground">No companies yet. Open <b>Company Master</b> to add NSE symbols.</p>
        ) : (
          <div className="overflow-x-auto custom-scrollbar rounded-xl border shadow-sm">
            <table className="border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-card">
                  {/* Sticky: Company */}
                  <th className="sticky left-0 z-20 min-w-[180px] border-b bg-card px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Company</th>
                  {/* Sticky: Symbol */}
                  <th className="sticky left-[180px] z-20 min-w-[100px] border-b border-r bg-card px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Symbol</th>
                  {/* Candle cells */}
                  {ordered.map((t) => (
                    <th key={t} className="border-b px-0 py-3 font-mono text-[10px] font-normal text-muted-foreground">
                      <div className="mx-auto h-12 w-7 whitespace-nowrap [writing-mode:vertical-rl] rotate-180 text-left">{periodLabel(t, timeframe)}</div>
                    </th>
                  ))}
                  {/* Signal columns */}
                  <th className="border-b border-l px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trend</th>
                  <th className="border-b px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Streak</th>
                  {/* Indicator & Price Envelope columns */}
                  <th className="border-b border-l px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Week H / L</th>
                  <th className="border-b px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[145px] whitespace-nowrap">52W Range</th>
                  <th className="border-b px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Indicators</th>
                  {/* Portfolio columns */}
                  <th className="border-b border-l px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shares</th>
                  <th className="border-b px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Avg Buy ₹</th>
                  <th className="border-b px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Curr Price ₹</th>
                  <th className="border-b px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invested ₹</th>
                  <th className="border-b px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Curr Value ₹</th>
                  <th className="border-b px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">P&L ₹</th>
                  <th className="border-b px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">P&L %</th>
                  <th className="border-b px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const portRow = portfolioRows.find((p) => p.co.id === r.co.id);
                  const quote = market.data?.[`${r.co.exchange}:${r.co.symbol}`];
                  const bars = quote?.bars ?? [];
                  return (
                    <Row
                      key={r.co.id}
                      r={r}
                      ordered={ordered}
                      timeframe={timeframe}
                      loading={market.isFetching && !market.data}
                      portRow={portRow ?? null}
                      bars={bars}
                      quote={quote}
                      money={money}
                      boardId={board.id}
                      onOpenFullScreen={setFullScreenTarget}
                    />
                  );
                })}
                {/* Portfolio totals footer row */}
                {portfolioRows.length > 0 && (
                  <tr className="bg-card/80">
                    <td className="sticky left-0 z-10 border-t bg-card/80 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Totals</td>
                    <td className="sticky left-[180px] z-10 border-t border-r bg-card/80" />
                    {ordered.map((t) => <td key={t} className="border-t" />)}
                    <td className="border-t border-l" />
                    <td className="border-t" />
                    {/* Week H / L */}
                    <td className="border-t border-l" />
                    {/* 52W Range */}
                    <td className="border-t" />
                    {/* Indicators */}
                    <td className="border-t" />
                    {/* Shares */}
                    <td className="border-t border-l px-4 py-2 text-right font-mono font-semibold tabular-nums">{portfolio.totalShares.toLocaleString("en-IN")}</td>
                    <td className="border-t px-4 py-2 text-right text-muted-foreground">—</td>
                    <td className="border-t px-4 py-2 text-right text-muted-foreground">—</td>
                    <td className="border-t px-4 py-2 text-right font-mono font-semibold tabular-nums">{money(portfolio.totalInvested)}</td>
                    <td className="border-t px-4 py-2 text-right font-mono font-semibold tabular-nums">{money(portfolio.totalCurrentValue)}</td>
                    <td className={`border-t px-4 py-2 text-right font-mono font-bold tabular-nums ${
                      portfolio.totalProfitLoss > 0 ? "text-bull" : portfolio.totalProfitLoss < 0 ? "text-bear" : ""
                    }`}>{portfolio.totalProfitLoss >= 0 ? "+" : ""}{money(portfolio.totalProfitLoss)}</td>
                    <td className={`border-t px-4 py-2 text-right font-mono font-bold ${
                      (portfolio.totalProfitLossPercent ?? 0) > 0 ? "text-bull" : (portfolio.totalProfitLossPercent ?? 0) < 0 ? "text-bear" : "text-muted-foreground"
                    }`}>{portfolio.totalProfitLossPercent === null ? "—" : `${portfolio.totalProfitLossPercent >= 0 ? "+" : ""}${portfolio.totalProfitLossPercent.toFixed(2)}%`}</td>
                    <td className="border-t" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Candle colours are not buy/sell advice. Hover a cell to see OHLC. Click any row to open the detail panel.</p>
      </TabsContent>

      <TabsContent value="portfolio" className="mt-4 space-y-6">
        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="relative overflow-hidden rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Total Invested</p>
            <p className="mt-2 font-display text-2xl font-bold tabular-nums">{money(portfolio.totalInvested)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{portfolioRows.length} active holding{portfolioRows.length !== 1 ? "s" : ""}</p>
            <div className="absolute right-4 top-4 rounded-full bg-primary/10 p-2 text-primary"><TrendingUp className="h-4 w-4" /></div>
          </div>
          <div className="relative overflow-hidden rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Current Value</p>
            <p className="mt-2 font-display text-2xl font-bold tabular-nums">{money(portfolio.totalCurrentValue)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Based on latest closing prices</p>
            <div className="absolute right-4 top-4 rounded-full bg-blue-500/10 p-2 text-blue-500"><LineChart className="h-4 w-4" /></div>
          </div>
          <div className={`relative overflow-hidden rounded-xl border p-5 shadow-sm ${
            portfolio.totalProfitLoss === 0 ? "bg-card" : portfolio.totalProfitLoss > 0 ? "bg-bull/5 border-bull/20" : "bg-bear/5 border-bear/20"
          }`}>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Total P&amp;L</p>
            <p className={`mt-2 font-display text-2xl font-bold tabular-nums ${
              portfolio.totalProfitLoss === 0 ? "" : portfolio.totalProfitLoss > 0 ? "text-bull" : "text-bear"
            }`}>
              {portfolio.totalProfitLoss >= 0 ? "+" : ""}{money(portfolio.totalProfitLoss)}
            </p>
            <p className={`mt-1 text-xs ${
              portfolio.totalProfitLossPercent === null ? "text-muted-foreground" : portfolio.totalProfitLossPercent >= 0 ? "text-bull" : "text-bear"
            }`}>
              {portfolio.totalProfitLossPercent === null ? "Add buy prices to see %" : `${portfolio.totalProfitLossPercent >= 0 ? "+" : ""}${portfolio.totalProfitLossPercent.toFixed(2)}%`}
            </p>
            <div className={`absolute right-4 top-4 rounded-full p-2 ${
              portfolio.totalProfitLoss >= 0 ? "bg-bull/10 text-bull" : "bg-bear/10 text-bear"
            }`}>{portfolio.totalProfitLoss >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}</div>
          </div>
          <div className="relative overflow-hidden rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Total Shares</p>
            <p className="mt-2 font-display text-2xl font-bold tabular-nums">{portfolio.totalShares.toLocaleString("en-IN")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {portfolio.positionsMissingCost > 0 ? `${portfolio.positionsMissingCost} missing buy price` : "All positions costed"}
            </p>
            <div className="absolute right-4 top-4 rounded-full bg-secondary p-2 text-muted-foreground"><Download className="h-4 w-4" /></div>
          </div>
        </div>

        {/* Holdings table */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">Holdings</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Click <Pencil className="inline h-3 w-3" /> to edit shares or avg buy price inline. Current price = latest closing price from Yahoo Finance.</p>
            </div>
            {portfolio.positionsMissingPrice > 0 && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-600 dark:text-amber-400">
                {portfolio.positionsMissingPrice} holding(s) missing close price — hit Refresh Data
              </span>
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border shadow-sm">
            <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-card">
                  {[
                    { label: "Company", cls: "min-w-[180px] sticky left-0 z-10 bg-card" },
                    { label: "Shares", cls: "min-w-[100px] text-right" },
                    { label: "Avg Buy Price", cls: "min-w-[130px] text-right" },
                    { label: "Current Price", cls: "min-w-[130px] text-right" },
                    { label: "Total Invested", cls: "min-w-[140px] text-right" },
                    { label: "Current Value", cls: "min-w-[140px] text-right" },
                    { label: "P&L (₹)", cls: "min-w-[140px] text-right" },
                    { label: "P&L (%)", cls: "min-w-[100px] text-right" },
                    { label: "Weight", cls: "min-w-[90px] text-right" },
                    { label: "", cls: "min-w-[60px]" },
                  ].map((h) => (
                    <th key={h.label} className={`border-b px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${h.cls}`}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {portfolioRows.map((p) => {
                  const weight = p.currentValue !== null && portfolio.totalCurrentValue > 0
                    ? (p.currentValue / portfolio.totalCurrentValue) * 100
                    : null;
                  return (
                    <PortfolioRow
                      key={p.co.id}
                      p={p}
                      weight={weight}
                      money={money}
                      onSave={async (patch) => {
                        const { error } = await supabase.from("companies").update(patch).eq("id", p.co.id);
                        if (error) { toast.error(error.message); return; }
                        qc.invalidateQueries({ queryKey: ["companies", board.id] });
                        toast.success("Updated");
                      }}
                    />
                  );
                })}
                {!portfolioRows.length && (
                  <tr>
                    <td colSpan={10} className="p-10 text-center text-muted-foreground">
                      No holdings yet. Add companies and fill in share count &amp; average buy price in Company Master or inline below.
                    </td>
                  </tr>
                )}
                {/* Totals row */}
                {portfolioRows.length > 0 && (
                  <tr className="bg-card font-semibold">
                    <td className="sticky left-0 z-10 bg-card px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">Total</td>
                    <td className="px-4 py-3 text-right font-mono">{portfolio.totalShares.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">—</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">—</td>
                    <td className="px-4 py-3 text-right font-mono">{money(portfolio.totalInvested)}</td>
                    <td className="px-4 py-3 text-right font-mono">{money(portfolio.totalCurrentValue)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${
                      portfolio.totalProfitLoss === 0 ? "" : portfolio.totalProfitLoss > 0 ? "text-bull" : "text-bear"
                    }`}>{portfolio.totalProfitLoss >= 0 ? "+" : ""}{money(portfolio.totalProfitLoss)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${
                      portfolio.totalProfitLossPercent === null ? "text-muted-foreground" : portfolio.totalProfitLossPercent >= 0 ? "text-bull" : "text-bear"
                    }`}>{portfolio.totalProfitLossPercent === null ? "—" : `${portfolio.totalProfitLossPercent >= 0 ? "+" : ""}${portfolio.totalProfitLossPercent.toFixed(2)}%`}</td>
                    <td className="px-4 py-3 text-right">100%</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sector breakdown + overview */}
        <div className="grid gap-6 border-t pt-4 md:grid-cols-2">
          <section>
            <h3 className="font-display text-lg font-semibold">By sector</h3>
            {sectorTotals.length ? (
              <ul className="mt-3 space-y-2">
                {sectorTotals.map(([sector, value]) => (
                  <li key={sector} className="flex items-center justify-between gap-4 rounded-lg border bg-card/50 px-4 py-2">
                    <span className="text-sm">{sector}</span>
                    <div className="text-right">
                      <span className="font-mono font-medium">{money(value)}</span>
                      {portfolio.totalCurrentValue ? (
                        <span className="ml-2 text-xs text-muted-foreground">{(value / portfolio.totalCurrentValue * 100).toFixed(1)}%</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Closing prices will appear here after data is refreshed.</p>
            )}
          </section>
          <section>
            <h3 className="font-display text-lg font-semibold">Overview</h3>
            <div className="mt-3 space-y-3">
              {largestHolding && (
                <div className="rounded-lg border bg-card/50 px-4 py-3">
                  <p className="text-xs text-muted-foreground">Largest holding by value</p>
                  <p className="mt-1 font-medium">{largestHolding.co.name} <span className="font-mono text-sm">{money(largestHolding.currentValue)}</span></p>
                </div>
              )}
              {largestSector && (
                <div className="rounded-lg border bg-card/50 px-4 py-3">
                  <p className="text-xs text-muted-foreground">Largest sector by value</p>
                  <p className="mt-1 font-medium">{largestSector[0]} <span className="font-mono text-sm">{money(largestSector[1])}</span></p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Prices are the latest available daily closing prices from Yahoo Finance, not live quotes. P&amp;L is an estimate before fees, taxes and dividends.</p>
            </div>
          </section>
        </div>
      </TabsContent>

      <TabsContent value="master" className="mt-3"><CompanyMaster board={board} companies={companies.data ?? []} /></TabsContent>
      <TabsContent value="log" className="mt-3"><ErrorLog boardId={board.id} /></TabsContent>
    </Tabs>
  );
}

const Legend = ({ cls, label }: { cls: string; label: string }) => (
  <span className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm ${cls}`} />{label}</span>
);
const Stat = ({ label, value, cls = "" }: { label: string; value: number; cls?: string }) => (
  <div className="rounded-md border bg-card px-3 py-1.5"><span className={`font-mono text-lg font-bold ${cls}`}>{value}</span> <span className="text-muted-foreground">{label}</span></div>
);
const PortfolioStat = ({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "positive" | "negative" }) => (
  <div className="border-l-2 border-primary/50 py-1 pl-4">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className={`mt-1 font-display text-2xl font-bold ${tone === "positive" ? "text-bull" : tone === "negative" ? "text-bear" : "text-foreground"}`}>{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
  </div>
);

type PortfolioRowProps = {
  p: {
    co: Company;
    shares: number;
    averageBuyPrice: number | null;
    latestClose: number | null;
    latestCloseAt: number | null;
    invested: number | null;
    currentValue: number | null;
    profitLoss: number | null;
    profitLossPercent: number | null;
  };
  weight: number | null;
  money: (v: number | null | undefined) => string;
  onSave: (patch: Partial<Company>) => Promise<void>;
};

function PortfolioRow({ p, weight, money, onSave }: PortfolioRowProps) {
  const [editing, setEditing] = useState(false);
  const [sharesVal, setSharesVal] = useState(String(p.co.quantity ?? ""));
  const [buyPriceVal, setBuyPriceVal] = useState(String(p.co.average_buy_price ?? ""));
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    await onSave({
      quantity: sharesVal ? Number(sharesVal) : null,
      average_buy_price: buyPriceVal ? Number(buyPriceVal) : null,
    });
    setSaving(false);
    setEditing(false);
  }, [sharesVal, buyPriceVal, onSave]);

  const handleCancel = () => {
    setSharesVal(String(p.co.quantity ?? ""));
    setBuyPriceVal(String(p.co.average_buy_price ?? ""));
    setEditing(false);
  };

  const plPositive = p.profitLoss !== null && p.profitLoss > 0;
  const plNegative = p.profitLoss !== null && p.profitLoss < 0;

  return (
    <tr className="group border-t transition-colors hover:bg-secondary/30">
      {/* Company */}
      <td className="sticky left-0 z-10 border-b bg-background px-4 py-3 group-hover:bg-secondary/30">
        <div className="font-medium leading-tight">{p.co.name}</div>
        <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground">
          {p.co.symbol}
          {p.co.sector && <span className="ml-1 rounded bg-secondary px-1 text-[10px]">{p.co.sector}</span>}
        </div>
      </td>

      {/* Shares */}
      <td className="border-b px-4 py-3 text-right font-mono">
        {editing ? (
          <Input
            type="number"
            min="0"
            step="any"
            className="h-7 w-24 text-right text-xs"
            value={sharesVal}
            onChange={(e) => setSharesVal(e.target.value)}
          />
        ) : (
          <span className={p.shares ? "" : "text-muted-foreground"}>
            {p.shares ? p.shares.toLocaleString("en-IN") : "—"}
          </span>
        )}
      </td>

      {/* Avg Buy Price */}
      <td className="border-b px-4 py-3 text-right font-mono">
        {editing ? (
          <Input
            type="number"
            min="0"
            step="any"
            className="h-7 w-28 text-right text-xs"
            value={buyPriceVal}
            onChange={(e) => setBuyPriceVal(e.target.value)}
          />
        ) : (
          <span className={p.averageBuyPrice ? "" : "text-muted-foreground"}>
            {money(p.averageBuyPrice)}
          </span>
        )}
      </td>

      {/* Current Price */}
      <td className="border-b px-4 py-3 text-right font-mono">
        <span className={p.latestClose ? "" : "text-muted-foreground"}>
          {money(p.latestClose)}
        </span>
        {p.latestCloseAt && (
          <div className="text-[10px] text-muted-foreground">
            {new Date(p.latestCloseAt * 1000).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
          </div>
        )}
      </td>

      {/* Total Invested */}
      <td className="border-b px-4 py-3 text-right font-mono">
        <span className={p.invested ? "" : "text-muted-foreground"}>{money(p.invested)}</span>
      </td>

      {/* Current Value */}
      <td className="border-b px-4 py-3 text-right font-mono">
        <span className={p.currentValue ? "" : "text-muted-foreground"}>{money(p.currentValue)}</span>
      </td>

      {/* P&L ₹ */}
      <td className={`border-b px-4 py-3 text-right font-mono font-semibold ${plPositive ? "text-bull" : plNegative ? "text-bear" : "text-muted-foreground"}`}>
        {p.profitLoss === null ? (
          <span className="text-xs font-normal text-muted-foreground">
            {!p.shares ? "Add shares" : !p.averageBuyPrice ? "Add buy price" : "Refresh data"}
          </span>
        ) : (
          <>
            {p.profitLoss >= 0 ? "+" : ""}{money(p.profitLoss)}
            <div className="flex items-center justify-end gap-0.5 text-[10px] font-normal opacity-75">
              {plPositive ? <TrendingUp className="h-2.5 w-2.5" /> : plNegative ? <TrendingDown className="h-2.5 w-2.5" /> : null}
            </div>
          </>
        )}
      </td>

      {/* P&L % */}
      <td className={`border-b px-4 py-3 text-right font-mono ${plPositive ? "text-bull" : plNegative ? "text-bear" : "text-muted-foreground"}`}>
        {p.profitLossPercent === null ? "—" : (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${plPositive ? "bg-bull/10" : plNegative ? "bg-bear/10" : "bg-secondary"}`}>
            {p.profitLossPercent >= 0 ? "+" : ""}{p.profitLossPercent.toFixed(2)}%
          </span>
        )}
      </td>

      {/* Weight */}
      <td className="border-b px-4 py-3 text-right text-xs text-muted-foreground">
        {weight === null ? "—" : (
          <div>
            <div className="font-mono font-medium text-foreground">{weight.toFixed(1)}%</div>
            <div className="mt-0.5 h-1 w-16 overflow-hidden rounded-full bg-secondary ml-auto">
              <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min(weight, 100)}%` }} />
            </div>
          </div>
        )}
      </td>

      {/* Edit/Save actions */}
      <td className="border-b px-4 py-3 text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded p-1 text-bull hover:bg-bull/10 disabled:opacity-50"
              title="Save"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={handleCancel}
              className="rounded p-1 text-muted-foreground hover:bg-secondary"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100"
            title="Edit shares & buy price"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}



const colourCls: Record<string, string> = { green: "bg-bull", red: "bg-bear", neutral: "bg-neutral-candle", nodata: "bg-nodata" };

type DashRowPortData = {
  co: Company;
  shares: number;
  averageBuyPrice: number | null;
  latestClose: number | null;
  latestCloseAt: number | null;
  invested: number | null;
  currentValue: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
} | null;

function Row({
  r, ordered, timeframe, loading, portRow, bars, quote, money, boardId, onOpenFullScreen,
}: {
  r: { co: Company; cells: Cell[]; error: string | null; summary: ReturnType<typeof summarise> };
  ordered: number[];
  timeframe: "weekly" | "monthly";
  loading: boolean;
  portRow: DashRowPortData;
  bars: import("@/lib/candles").Bar[];
  quote?: SymbolData;
  money: (v: number | null | undefined) => string;
  boardId: string;
  onOpenFullScreen: (target: {
    co: Company;
    bars: import("@/lib/candles").Bar[];
    quote?: SymbolData | null;
    portRow?: DashRowPortData;
    indicators?: StockIndicators | null;
  }) => void;
}) {
  const qc = useQueryClient();
  const byT = new Map(r.cells.map((c) => [c.t, c]));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sharesVal, setSharesVal] = useState(String(r.co.quantity ?? ""));
  const [buyPriceVal, setBuyPriceVal] = useState(String(r.co.average_buy_price ?? ""));
  const [saving, setSaving] = useState(false);

  const indicators = useMemo(() => {
    return computeStockIndicators(
      bars,
      portRow?.latestClose,
      quote?.fiftyTwoWeekHigh,
      quote?.fiftyTwoWeekLow,
    );
  }, [bars, portRow?.latestClose, quote?.fiftyTwoWeekHigh, quote?.fiftyTwoWeekLow]);

  const save = async (patch: Partial<Company>) => {
    const { error } = await supabase.from("companies").update(patch).eq("id", r.co.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["companies", boardId] });
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    await save({
      quantity: sharesVal ? Number(sharesVal) : null,
      average_buy_price: buyPriceVal ? Number(buyPriceVal) : null,
    });
    setSaving(false);
    setEditing(false);
  }, [sharesVal, buyPriceVal]);

  const handleCancel = () => {
    setSharesVal(String(r.co.quantity ?? ""));
    setBuyPriceVal(String(r.co.average_buy_price ?? ""));
    setEditing(false);
  };

  const trendCls = r.summary.trend === "Bullish" ? "text-bull" : r.summary.trend === "Bearish" ? "text-bear" : "text-muted-foreground";
  const plPos = portRow?.profitLoss !== null && portRow?.profitLoss !== undefined && portRow.profitLoss > 0;
  const plNeg = portRow?.profitLoss !== null && portRow?.profitLoss !== undefined && portRow.profitLoss < 0;

  return (
    <>
      {/* ─── Detail Dialog ─── */}
      <StockDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        co={r.co}
        bars={bars}
        quote={quote}
        timeframe={timeframe}
        cells={r.cells}
        summary={r.summary}
        portRow={portRow}
        indicators={indicators}
        money={money}
        onSave={save}
        onOpenFullScreen={onOpenFullScreen}
      />

      <tr
        className="group cursor-pointer transition-colors hover:bg-secondary/30"
        onClick={() => setDialogOpen(true)}
      >
        {/* Company — sticky */}
        <td className="sticky left-0 z-10 border-b bg-background px-4 py-2.5 group-hover:bg-secondary/30">
          <div className="max-w-[170px] truncate font-medium leading-tight" title={r.co.name}>{r.co.name}</div>
          {r.co.sector && <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{r.co.sector}</div>}
        </td>
        {/* Symbol — sticky: click to open full screen chart with all features */}
        <td className="sticky left-[180px] z-10 border-b border-r bg-background px-3 py-2.5 font-mono text-xs group-hover:bg-secondary/30">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 font-bold text-foreground hover:text-primary transition-colors cursor-pointer group/sym text-left"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFullScreen({
                co: r.co,
                bars,
                quote,
                portRow,
                indicators,
              });
            }}
            title={`Open ${r.co.symbol} full screen chart`}
          >
            <span>{r.co.symbol}</span>
            <LineChart className="h-3 w-3 text-primary transition-transform group-hover/sym:scale-110" />
          </button>
        </td>
        {/* Candle cells */}
        {ordered.map((t, i) => {
          const c = byT.get(t);
          const col = loading ? "nodata" : c?.colour ?? "nodata";
          const fresh = r.summary.freshChange && t === ordered[board_last(ordered, i)];
          return (
            <td key={t} className="border-b p-[2px]">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`h-6 w-7 rounded-[3px] ${colourCls[col]} ${fresh ? "ring-2 ring-primary ring-offset-1" : ""}`} />
                </TooltipTrigger>
                <TooltipContent className="font-mono text-xs">
                  <div className="font-semibold">{r.co.symbol} · {periodLabel(t, timeframe)}</div>
                  {c && c.colour !== "nodata" ? (
                    <>
                      <div>O {c.bar.o?.toFixed(2)} H {c.bar.h?.toFixed(2)}</div>
                      <div>L {c.bar.l?.toFixed(2)} C {c.bar.c?.toFixed(2)}</div>
                      {c.ha && <div>HA O {c.ha.o.toFixed(2)} C {c.ha.c.toFixed(2)}</div>}
                    </>
                  ) : <div>N/A — no data</div>}
                </TooltipContent>
              </Tooltip>
            </td>
          );
        })}
        {/* Trend */}
        <td className={`border-b border-l px-3 py-2.5 text-xs font-semibold ${trendCls}`}>
          {r.error ? <span className="text-muted-foreground" title={r.error}>Pending</span> : r.summary.trend}
        </td>
        {/* Streak */}
        <td className="border-b px-3 py-2.5 font-mono text-xs">
          {r.summary.streak
            ? <span className={r.summary.streakColour === "green" ? "text-bull" : r.summary.streakColour === "red" ? "text-bear" : ""}>{r.summary.streak}×</span>
            : "–"}
        </td>

        {/* ─── Week H / L column ─── */}
        <td className="border-b border-l px-3 py-2 text-right font-mono text-xs">
          {indicators.currentWeek?.high != null && indicators.currentWeek?.low != null ? (
            <div className="space-y-0.5 leading-none">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[10px] text-muted-foreground">H</span>
                <span className="font-semibold text-foreground">{money(indicators.currentWeek.high)}</span>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[10px] text-muted-foreground">L</span>
                <span className="font-semibold text-foreground">{money(indicators.currentWeek.low)}</span>
              </div>
              {indicators.currentWeek.range != null && (
                <div className="text-[10px] text-muted-foreground pt-0.5">
                  Δ {indicators.currentWeek.range.toFixed(2)} {indicators.currentWeek.rangePct != null ? `(${indicators.currentWeek.rangePct.toFixed(1)}%)` : ""}
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>

        {/* ─── 52W Range column with mini visual progress bar ─── */}
        <td className="border-b px-3 py-2 min-w-[145px]">
          {indicators.high52 != null && indicators.low52 != null ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between font-mono text-[11px] leading-tight">
                <span className="text-muted-foreground" title="52W Low">{money(indicators.low52)}</span>
                <span className="text-muted-foreground" title="52W High">{money(indicators.high52)}</span>
              </div>
              <div className="relative h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div className="h-full w-full bg-gradient-to-r from-bear/40 via-amber-500/30 to-bull/40" />
                {indicators.range52PositionPct != null && (
                  <div
                    className="absolute top-0 bottom-0 w-1.5 -ml-0.5 rounded-full bg-foreground shadow-sm ring-1 ring-background"
                    style={{ left: `${indicators.range52PositionPct}%` }}
                    title={`52W Range position: ${indicators.range52PositionPct}%`}
                  />
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono leading-none">
                <span className="text-bull" title="% above 52W Low">
                  {indicators.pctFrom52Low != null ? `+${indicators.pctFrom52Low.toFixed(1)}%` : ""}
                </span>
                <span className="text-bear" title="% below 52W High">
                  {indicators.pctFrom52High != null ? `${indicators.pctFrom52High.toFixed(1)}%` : ""}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>

        {/* ─── Indicators column (RSI & Moving Average signal) ─── */}
        <td className="border-b px-3 py-2 text-center">
          <div className="flex flex-col items-center gap-1">
            {indicators.rsi14 != null ? (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold ${
                indicators.rsiStatus === "Overbought"
                  ? "bg-bear/15 text-bear border border-bear/30"
                  : indicators.rsiStatus === "Oversold"
                  ? "bg-bull/15 text-bull border border-bull/30"
                  : "bg-secondary text-foreground"
              }`} title={`RSI (14): ${indicators.rsi14} — ${indicators.rsiStatus}`}>
                RSI {indicators.rsi14}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground font-mono">RSI —</span>
            )}
            {indicators.sma20 != null && indicators.priceVsSma20Pct != null ? (
              <span className={`inline-flex items-center gap-1 text-[10px] font-mono ${
                indicators.priceVsSma20Pct >= 0 ? "text-bull" : "text-bear"
              }`} title={`Price vs 20 SMA: ${indicators.priceVsSma20Pct >= 0 ? "+" : ""}${indicators.priceVsSma20Pct}%`}>
                <span className={`h-1.5 w-1.5 rounded-full ${indicators.priceVsSma20Pct >= 0 ? "bg-bull" : "bg-bear"}`} />
                20 SMA {indicators.priceVsSma20Pct >= 0 ? "+" : ""}{indicators.priceVsSma20Pct.toFixed(1)}%
              </span>
            ) : null}
          </div>
        </td>

        {/* ─── Portfolio columns ─── */}
        {/* Shares */}
        <td className="border-b border-l px-4 py-2 text-right font-mono" onClick={(e) => editing && e.stopPropagation()}>
          {editing ? (
            <Input type="number" min="0" step="any" className="h-7 w-24 text-right text-xs" value={sharesVal} onChange={(e) => setSharesVal(e.target.value)} />
          ) : (
            <span className={portRow?.shares ? "" : "text-muted-foreground text-xs"}>
              {portRow?.shares ? portRow.shares.toLocaleString("en-IN") : "—"}
            </span>
          )}
        </td>
        {/* Avg Buy Price */}
        <td className="border-b px-4 py-2 text-right font-mono" onClick={(e) => editing && e.stopPropagation()}>
          {editing ? (
            <Input type="number" min="0" step="any" className="h-7 w-28 text-right text-xs" value={buyPriceVal} onChange={(e) => setBuyPriceVal(e.target.value)} />
          ) : (
            <span className={portRow?.averageBuyPrice ? "" : "text-muted-foreground text-xs"}>
              {portRow?.averageBuyPrice ? money(portRow.averageBuyPrice) : "—"}
            </span>
          )}
        </td>
        {/* Current Price */}
        <td className="border-b px-4 py-2 text-right font-mono">
          <span className={portRow?.latestClose ? "" : "text-muted-foreground text-xs"}>
            {portRow?.latestClose ? money(portRow.latestClose) : "—"}
          </span>
          {portRow?.latestCloseAt && (
            <div className="text-[10px] text-muted-foreground">
              {new Date(portRow.latestCloseAt * 1000).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
            </div>
          )}
        </td>
        {/* Invested */}
        <td className="border-b px-4 py-2 text-right font-mono">
          <span className={portRow?.invested ? "" : "text-muted-foreground text-xs"}>
            {portRow?.invested ? money(portRow.invested) : "—"}
          </span>
        </td>
        {/* Current Value */}
        <td className="border-b px-4 py-2 text-right font-mono">
          <span className={portRow?.currentValue ? "" : "text-muted-foreground text-xs"}>
            {portRow?.currentValue ? money(portRow.currentValue) : "—"}
          </span>
        </td>
        {/* P&L ₹ */}
        <td className={`border-b px-4 py-2 text-right font-mono font-semibold ${
          plPos ? "text-bull" : plNeg ? "text-bear" : "text-muted-foreground"
        }`}>
          {portRow?.profitLoss === null || portRow?.profitLoss === undefined ? (
            <span className="text-[11px] font-normal text-muted-foreground">
              {!portRow?.shares ? "Add shares" : !portRow?.averageBuyPrice ? "Add buy ₹" : "Refresh"}
            </span>
          ) : (
            <>{portRow.profitLoss >= 0 ? "+" : ""}{money(portRow.profitLoss)}</>
          )}
        </td>
        {/* P&L % */}
        <td className={`border-b px-4 py-2 text-right font-mono ${
          plPos ? "text-bull" : plNeg ? "text-bear" : "text-muted-foreground"
        }`}>
          {portRow?.profitLossPercent == null ? "—" : (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
              plPos ? "bg-bull/10" : plNeg ? "bg-bear/10" : "bg-secondary"
            }`}>
              {portRow.profitLossPercent >= 0 ? "+" : ""}{portRow.profitLossPercent.toFixed(2)}%
            </span>
          )}
        </td>
        {/* Edit actions */}
        <td className="border-b px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
          {editing ? (
            <div className="flex items-center justify-end gap-1">
              <button onClick={handleSave} disabled={saving}
                className="rounded p-1 text-bull hover:bg-bull/10 disabled:opacity-40" title="Save">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={handleCancel}
                className="rounded p-1 text-muted-foreground hover:bg-secondary" title="Cancel">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100"
              title="Edit shares & avg buy price">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </td>
      </tr>
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   StockDetailDialog — opens on row click
═══════════════════════════════════════════════════════ */
type DetailDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  co: Company;
  bars: import("@/lib/candles").Bar[];
  quote?: SymbolData;
  timeframe: "weekly" | "monthly";
  cells: Cell[];
  summary: ReturnType<typeof summarise>;
  portRow: DashRowPortData;
  indicators: StockIndicators;
  money: (v: number | null | undefined) => string;
  onSave: (patch: Partial<Company>) => Promise<void>;
  onOpenFullScreen: (target: {
    co: Company;
    bars: import("@/lib/candles").Bar[];
    quote?: SymbolData | null;
    portRow?: DashRowPortData;
    indicators?: StockIndicators | null;
  }) => void;
};

function StockDetailDialog({ open, onOpenChange, co, bars, quote, timeframe, cells, summary, portRow, indicators, money, onSave, onOpenFullScreen }: DetailDialogProps) {
  const [sharesVal, setSharesVal] = useState(String(co.quantity ?? ""));
  const [buyPriceVal, setBuyPriceVal] = useState(String(co.average_buy_price ?? ""));
  const [saving, setSaving] = useState(false);

  // Reset fields when dialog opens with fresh co data
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setSharesVal(String(co.quantity ?? ""));
      setBuyPriceVal(String(co.average_buy_price ?? ""));
    }
    onOpenChange(v);
  };

  // Live-calculated preview from form values
  const previewShares = sharesVal ? Number(sharesVal) : 0;
  const previewBuyPrice = buyPriceVal ? Number(buyPriceVal) : null;
  const previewClose = portRow?.latestClose ?? indicators.currentPrice ?? null;
  const previewInvested = previewShares && previewBuyPrice ? previewShares * previewBuyPrice : null;
  const previewValue = previewShares && previewClose ? previewShares * previewClose : null;
  const previewPL = previewInvested !== null && previewValue !== null ? previewValue - previewInvested : null;
  const previewPLPct = previewPL !== null && previewInvested ? (previewPL / previewInvested) * 100 : null;

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      quantity: sharesVal ? Number(sharesVal) : null,
      average_buy_price: buyPriceVal ? Number(buyPriceVal) : null,
    });
    setSaving(false);
    onOpenChange(false);
  };

  const trendCls = summary.trend === "Bullish" ? "text-bull" : summary.trend === "Bearish" ? "text-bear" : "text-muted-foreground";
  const plPos = previewPL !== null && previewPL > 0;
  const plNeg = previewPL !== null && previewPL < 0;
  const colourMap: Record<string, string> = { green: "bg-bull", red: "bg-bear", neutral: "bg-neutral-candle", nodata: "bg-nodata" };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-6xl overflow-y-auto custom-scrollbar p-0">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-display text-xl font-bold">{co.name}</h2>
              <span className="rounded bg-secondary px-2.5 py-0.5 font-mono text-sm font-semibold">{co.symbol}</span>
              {co.exchange && <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium">{co.exchange}</span>}
              {co.sector && <span className="text-xs text-muted-foreground bg-secondary/60 rounded px-2 py-0.5">{co.sector}</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-mono text-lg font-bold text-foreground">
                {previewClose ? money(previewClose) : "—"}
              </span>
              {portRow?.latestCloseAt && (
                <span className="text-xs text-muted-foreground">
                  (Close: {new Date(portRow.latestCloseAt * 1000).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })})
                </span>
              )}
              <span className={`font-semibold ${trendCls}`}>● {summary.trend}</span>
              {summary.streak > 0 && (
                <span className={`font-mono text-xs ${
                  summary.streakColour === "green" ? "text-bull" : summary.streakColour === "red" ? "text-bear" : "text-muted-foreground"
                }`}>{summary.streak}× streak</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`https://www.tradingview.com/chart/?symbol=${co.exchange}:${co.symbol}`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" /> TradingView
            </a>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md border border-border/80 bg-secondary/40 px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary hover:text-primary hover:bg-secondary cursor-pointer"
              onClick={() => {
                onOpenChange(false);
                onOpenFullScreen({
                  co,
                  bars,
                  quote,
                  portRow,
                  indicators,
                });
              }}
              title="Open Full Screen Chart with all features"
            >
              <Maximize2 className="h-3.5 w-3.5 text-primary" /> Full chart
            </button>
          </div>
        </div>

        {/* ─── 52-Week Range & Current Week Banners ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b bg-card/40 p-4">
          {/* Card 1: 52-Week Range */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-1.5 text-primary">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">52-Week Range</h4>
                  <p className="text-[11px] text-muted-foreground">High/Low price envelope</p>
                </div>
              </div>
              {indicators.range52PositionPct != null && (
                <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-xs font-semibold">
                  {indicators.range52PositionPct}% of Range
                </span>
              )}
            </div>

            {indicators.high52 != null && indicators.low52 != null ? (
              <div className="mt-3">
                {/* Visual track */}
                <div className="relative my-3">
                  <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                    <div className="h-full w-full bg-gradient-to-r from-bear/40 via-amber-500/40 to-bull/40" />
                  </div>
                  {indicators.range52PositionPct != null && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -ml-2 h-4 w-4 rounded-full border-2 border-background bg-primary shadow ring-1 ring-primary/40"
                      style={{ left: `${indicators.range52PositionPct}%` }}
                      title={`Current position: ${indicators.range52PositionPct}%`}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between font-mono text-xs">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">52W Low</span>
                    <span className="font-semibold">{money(indicators.low52)}</span>
                    {indicators.pctFrom52Low != null && (
                      <span className="ml-1 text-[11px] text-bull">+{indicators.pctFrom52Low.toFixed(1)}%</span>
                    )}
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">Current</span>
                    <span className="font-bold text-foreground">{money(previewClose)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">52W High</span>
                    <span className="font-semibold">{money(indicators.high52)}</span>
                    {indicators.pctFrom52High != null && (
                      <span className="ml-1 text-[11px] text-bear">{indicators.pctFrom52High.toFixed(1)}%</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Historical data pending.</p>
            )}
          </div>

          {/* Card 2: Current Week High & Low */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-blue-500/10 p-1.5 text-blue-500">
                  <BarChart2 className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Week High &amp; Low</h4>
                  <p className="text-[11px] text-muted-foreground">Latest candle price action</p>
                </div>
              </div>
              {indicators.currentWeek?.changePct != null && (
                <span className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold ${
                  indicators.currentWeek.changePct >= 0 ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"
                }`}>
                  {indicators.currentWeek.changePct >= 0 ? "+" : ""}{indicators.currentWeek.changePct.toFixed(2)}%
                </span>
              )}
            </div>

            {indicators.currentWeek ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 font-mono text-xs">
                <div className="rounded-lg bg-secondary/40 p-2 text-center">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">Week High</span>
                  <span className="font-semibold text-foreground">{money(indicators.currentWeek.high)}</span>
                </div>
                <div className="rounded-lg bg-secondary/40 p-2 text-center">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">Week Low</span>
                  <span className="font-semibold text-foreground">{money(indicators.currentWeek.low)}</span>
                </div>
                <div className="rounded-lg bg-secondary/40 p-2 text-center">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">Week Open</span>
                  <span className="font-semibold text-foreground">{money(indicators.currentWeek.open)}</span>
                </div>
                <div className="rounded-lg bg-secondary/40 p-2 text-center">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">Week Range</span>
                  <span className="font-semibold text-foreground">
                    {indicators.currentWeek.range != null ? `₹${indicators.currentWeek.range.toFixed(2)}` : "—"}
                  </span>
                  {indicators.currentWeek.rangePct != null && (
                    <span className="text-[10px] text-muted-foreground block">
                      ({indicators.currentWeek.rangePct.toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No current week data available.</p>
            )}
          </div>
        </div>

        {/* ─── Main Content Grid: Chart + Indicators (Left) | Portfolio (Right) ─── */}
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_330px]">
          {/* Left Column: Chart + Analysis Tabs */}
          <div className="border-b p-4 lg:border-b-0 lg:border-r space-y-4">
            {/* Candlestick chart */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <LineChart className="h-3.5 w-3.5" />
                  {timeframe === "weekly" ? "Weekly" : "Monthly"} Candlestick Chart
                </p>
                {bars.length > 0 && (
                  <p className="text-xs text-muted-foreground font-mono">
                    {bars.length} {timeframe} candles
                  </p>
                )}
              </div>
              {bars.length > 0 ? (
                <Suspense fallback={<div className="grid h-64 place-items-center text-xs text-muted-foreground">Loading chart…</div>}>
                  <CandleChart
                    bars={bars}
                    height={300}
                    symbol={co.symbol}
                    exchange={co.exchange}
                    averageBuyPrice={co.quantity ? co.average_buy_price : null}
                    high52={indicators.high52}
                    low52={indicators.low52}
                    onFullScreen={() => {
                      onOpenChange(false);
                      onOpenFullScreen({
                        co,
                        bars,
                        quote,
                        portRow,
                        indicators,
                      });
                    }}
                  />
                </Suspense>
              ) : (
                <div className="grid h-64 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
                  No chart data yet — click Refresh Data
                </div>
              )}
            </div>

            {/* Analysis Tabs */}
            <Tabs defaultValue="indicators" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="indicators" className="text-xs">Technical Indicators</TabsTrigger>
                <TabsTrigger value="weeks" className="text-xs">Week-by-Week History</TabsTrigger>
                <TabsTrigger value="candles" className="text-xs">Candle Colours ({cells.length})</TabsTrigger>
              </TabsList>

              {/* Tab 1: Detailed Technical Indicators */}
              <TabsContent value="indicators" className="mt-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* RSI Card */}
                  <div className="rounded-lg border bg-card p-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Gauge className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wider">RSI (14 Period)</span>
                      </div>
                      {indicators.rsi14 != null && (
                        <span className={`rounded-full px-2 py-0.5 font-mono text-xs font-bold ${
                          indicators.rsiStatus === "Overbought"
                            ? "bg-bear/15 text-bear border border-bear/30"
                            : indicators.rsiStatus === "Oversold"
                            ? "bg-bull/15 text-bull border border-bull/30"
                            : "bg-secondary text-foreground"
                        }`}>
                          {indicators.rsi14} · {indicators.rsiStatus}
                        </span>
                      )}
                    </div>
                    {indicators.rsi14 != null ? (
                      <div className="mt-3">
                        {/* RSI meter bar */}
                        <div className="relative h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                          <div className="flex h-full w-full">
                            <div className="w-[30%] bg-bull/40" title="Oversold (0 - 30)" />
                            <div className="w-[40%] bg-muted/60" title="Neutral (30 - 70)" />
                            <div className="w-[30%] bg-bear/40" title="Overbought (70 - 100)" />
                          </div>
                          <div
                            className="absolute top-0 bottom-0 w-1.5 -ml-0.5 rounded-full bg-foreground shadow"
                            style={{ left: `${Math.min(100, Math.max(0, indicators.rsi14))}%` }}
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                          <span>0 (Oversold)</span>
                          <span>30</span>
                          <span>70</span>
                          <span>100 (Overbought)</span>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Requires at least 15 bars.</p>
                    )}
                  </div>

                  {/* MACD Card */}
                  <div className="rounded-lg border bg-card p-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wider">MACD (12, 26, 9)</span>
                      </div>
                      {indicators.macd?.trend && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          indicators.macd.trend === "Bullish" ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"
                        }`}>
                          {indicators.macd.trend}
                        </span>
                      )}
                    </div>
                    {indicators.macd ? (
                      <div className="mt-2 grid grid-cols-3 gap-1 font-mono text-xs">
                        <div className="rounded bg-secondary/40 p-1.5 text-center">
                          <span className="text-[10px] text-muted-foreground block">MACD</span>
                          <span className="font-semibold">{indicators.macd.macdLine}</span>
                        </div>
                        <div className="rounded bg-secondary/40 p-1.5 text-center">
                          <span className="text-[10px] text-muted-foreground block">Signal</span>
                          <span className="font-semibold">{indicators.macd.signalLine}</span>
                        </div>
                        <div className="rounded bg-secondary/40 p-1.5 text-center">
                          <span className="text-[10px] text-muted-foreground block">Histogram</span>
                          <span className={`font-semibold ${indicators.macd.histogram! >= 0 ? "text-bull" : "text-bear"}`}>
                            {indicators.macd.histogram! >= 0 ? "+" : ""}{indicators.macd.histogram}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Requires at least 35 bars.</p>
                    )}
                  </div>

                  {/* Moving Averages Card */}
                  <div className="rounded-lg border bg-card p-3 shadow-sm md:col-span-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Compass className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Moving Averages (SMAs &amp; EMAs)</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">Price vs Moving Average</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs">
                      {/* 20 SMA */}
                      <div className="rounded bg-secondary/40 p-2">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>20 SMA</span>
                          {indicators.priceVsSma20Pct != null && (
                            <span className={indicators.priceVsSma20Pct >= 0 ? "text-bull font-bold" : "text-bear font-bold"}>
                              {indicators.priceVsSma20Pct >= 0 ? "+" : ""}{indicators.priceVsSma20Pct.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="font-semibold mt-1">{indicators.sma20 ? money(indicators.sma20) : "—"}</div>
                      </div>
                      {/* 50 SMA */}
                      <div className="rounded bg-secondary/40 p-2">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>50 SMA</span>
                          {indicators.priceVsSma50Pct != null && (
                            <span className={indicators.priceVsSma50Pct >= 0 ? "text-bull font-bold" : "text-bear font-bold"}>
                              {indicators.priceVsSma50Pct >= 0 ? "+" : ""}{indicators.priceVsSma50Pct.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="font-semibold mt-1">{indicators.sma50 ? money(indicators.sma50) : "—"}</div>
                      </div>
                      {/* 200 SMA */}
                      <div className="rounded bg-secondary/40 p-2">
                        <div className="text-[10px] text-muted-foreground">200 SMA</div>
                        <div className="font-semibold mt-1">{indicators.sma200 ? money(indicators.sma200) : "—"}</div>
                      </div>
                      {/* 20 EMA */}
                      <div className="rounded bg-secondary/40 p-2">
                        <div className="text-[10px] text-muted-foreground">20 EMA</div>
                        <div className="font-semibold mt-1">{indicators.ema20 ? money(indicators.ema20) : "—"}</div>
                      </div>
                      {/* 50 EMA */}
                      <div className="rounded bg-secondary/40 p-2">
                        <div className="text-[10px] text-muted-foreground">50 EMA</div>
                        <div className="font-semibold mt-1">{indicators.ema50 ? money(indicators.ema50) : "—"}</div>
                      </div>
                    </div>
                  </div>

                  {/* Bollinger Bands Card */}
                  <div className="rounded-lg border bg-card p-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Bollinger Bands (20, 2)</span>
                      </div>
                      {indicators.bollinger?.bandwidth != null && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          BW: {indicators.bollinger.bandwidth}%
                        </span>
                      )}
                    </div>
                    {indicators.bollinger ? (
                      <div className="mt-2 grid grid-cols-3 gap-1 font-mono text-xs">
                        <div className="rounded bg-secondary/40 p-1.5 text-center">
                          <span className="text-[10px] text-muted-foreground block">Upper</span>
                          <span className="font-semibold">{money(indicators.bollinger.upper)}</span>
                        </div>
                        <div className="rounded bg-secondary/40 p-1.5 text-center">
                          <span className="text-[10px] text-muted-foreground block">Middle</span>
                          <span className="font-semibold">{money(indicators.bollinger.middle)}</span>
                        </div>
                        <div className="rounded bg-secondary/40 p-1.5 text-center">
                          <span className="text-[10px] text-muted-foreground block">Lower</span>
                          <span className="font-semibold">{money(indicators.bollinger.lower)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Requires at least 20 bars.</p>
                    )}
                  </div>

                  {/* Classic Pivots & ATR Card */}
                  <div className="rounded-lg border bg-card p-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <BarChart2 className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Pivots &amp; Volatility (ATR)</span>
                      </div>
                      {indicators.atr14 != null && (
                        <span className="font-mono text-xs font-semibold text-primary">
                          ATR: ₹{indicators.atr14}
                        </span>
                      )}
                    </div>
                    {indicators.pivots ? (
                      <div className="mt-2 grid grid-cols-5 gap-1 font-mono text-xs text-center">
                        <div className="rounded bg-bear/10 p-1">
                          <span className="text-[9px] text-bear block font-bold">R2</span>
                          <span className="text-[11px]">{indicators.pivots.r2}</span>
                        </div>
                        <div className="rounded bg-bear/5 p-1">
                          <span className="text-[9px] text-bear block font-bold">R1</span>
                          <span className="text-[11px]">{indicators.pivots.r1}</span>
                        </div>
                        <div className="rounded bg-secondary p-1">
                          <span className="text-[9px] text-muted-foreground block font-bold">P</span>
                          <span className="text-[11px] font-bold">{indicators.pivots.pivot}</span>
                        </div>
                        <div className="rounded bg-bull/5 p-1">
                          <span className="text-[9px] text-bull block font-bold">S1</span>
                          <span className="text-[11px]">{indicators.pivots.s1}</span>
                        </div>
                        <div className="rounded bg-bull/10 p-1">
                          <span className="text-[9px] text-bull block font-bold">S2</span>
                          <span className="text-[11px]">{indicators.pivots.s2}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Calculated on previous period close.</p>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Tab 2: Week-by-Week High / Low Breakdown */}
              <TabsContent value="weeks" className="mt-3">
                <div className="rounded-lg border overflow-x-auto custom-scrollbar">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-secondary/60 text-muted-foreground uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2 text-left">Period / Date</th>
                        <th className="px-3 py-2 text-right">High ₹</th>
                        <th className="px-3 py-2 text-right">Low ₹</th>
                        <th className="px-3 py-2 text-right">Open ₹</th>
                        <th className="px-3 py-2 text-right">Close ₹</th>
                        <th className="px-3 py-2 text-right">Range (H - L)</th>
                        <th className="px-3 py-2 text-right">Change %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {indicators.recentWeeks.map((w, idx) => (
                        <tr key={w.t} className={idx === 0 ? "bg-primary/5 font-semibold" : "hover:bg-secondary/20"}>
                          <td className="px-3 py-2 text-left text-foreground">
                            {periodLabel(w.t, timeframe)} {idx === 0 && <span className="text-[10px] text-primary ml-1">(Current)</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-foreground">{money(w.high)}</td>
                          <td className="px-3 py-2 text-right text-foreground">{money(w.low)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{money(w.open)}</td>
                          <td className="px-3 py-2 text-right text-foreground">{money(w.close)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            ₹{w.range.toFixed(2)} ({w.rangePct.toFixed(1)}%)
                          </td>
                          <td className={`px-3 py-2 text-right font-bold ${w.isGreen ? "text-bull" : "text-bear"}`}>
                            {w.changePct >= 0 ? "+" : ""}{w.changePct.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* Tab 3: Candle Colours Strip */}
              <TabsContent value="candles" className="mt-3">
                {cells.length > 0 ? (
                  <div className="rounded-lg border bg-card p-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Recent {timeframe} candle colour blocks ({cells.length} periods)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {cells.map((cell) => (
                        <Tooltip key={cell.t}>
                          <TooltipTrigger asChild>
                            <div className={`h-7 w-9 cursor-default rounded-sm ${colourMap[cell.colour] ?? "bg-nodata"} ${
                              cell === cells[cells.length - 1] ? "ring-2 ring-primary ring-offset-1" : ""
                            }`} />
                          </TooltipTrigger>
                          <TooltipContent className="font-mono text-xs">
                            <div className="font-semibold">{periodLabel(cell.t, timeframe)}</div>
                            {cell.colour !== "nodata" ? (
                              <>
                                <div>O {cell.bar.o?.toFixed(2)} H {cell.bar.h?.toFixed(2)}</div>
                                <div>L {cell.bar.l?.toFixed(2)} C {cell.bar.c?.toFixed(2)}</div>
                              </>
                            ) : <div>No data</div>}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="p-4 text-xs text-muted-foreground">No candle cells available.</p>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column: Portfolio edit panel */}
          <div className="p-5 flex flex-col justify-between">
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">My Investment</p>

              {/* Editable fields */}
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">No. of Shares</label>
                  <Input
                    type="number" min="0" step="any"
                    placeholder="e.g. 100"
                    value={sharesVal}
                    onChange={(e) => setSharesVal(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Avg Buying Price (₹)</label>
                  <Input
                    type="number" min="0" step="any"
                    placeholder="e.g. 1250.50"
                    value={buyPriceVal}
                    onChange={(e) => setBuyPriceVal(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="rounded-lg border bg-card/50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current Price (closing)</p>
                  <p className="mt-1 font-mono text-lg font-semibold">
                    {previewClose ? money(previewClose) : <span className="text-sm text-muted-foreground">Refresh for price</span>}
                  </p>
                </div>
              </div>

              {/* Live P&L preview */}
              <div className="mt-5 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Calculated</p>
                {([
                  { label: "Total Invested", value: money(previewInvested) },
                  { label: "Current Value", value: money(previewValue) },
                ]).map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-medium">{value}</span>
                  </div>
                ))}
                {/* P&L highlight box */}
                <div className={`flex items-center justify-between rounded-lg border px-3 py-3 ${
                  plPos ? "border-bull/30 bg-bull/5" : plNeg ? "border-bear/30 bg-bear/5" : "border-border bg-secondary/40"
                }`}>
                  <div>
                    <p className="text-xs text-muted-foreground">Unrealised P&amp;L</p>
                    <p className={`mt-0.5 font-mono text-lg font-bold ${
                      plPos ? "text-bull" : plNeg ? "text-bear" : "text-foreground"
                    }`}>
                      {previewPL === null ? "—" : `${previewPL >= 0 ? "+" : ""}${money(previewPL)}`}
                    </p>
                  </div>
                  {previewPLPct !== null && (
                    <span className={`rounded-full px-3 py-1 text-sm font-bold ${
                      plPos ? "bg-bull/15 text-bull" : plNeg ? "bg-bear/15 text-bear" : "bg-secondary text-foreground"
                    }`}>
                      {previewPLPct >= 0 ? "+" : ""}{previewPLPct.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Save button */}
              <Button
                className="mt-5 w-full"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save Investment Details"}
              </Button>
            </div>

            <p className="mt-6 text-center text-[11px] text-muted-foreground">
              Prices update on Refresh — not live quotes.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
// index of the newest period within displayed order
function board_last(ordered: number[], _i: number) {
  return (ordered[0] ?? 0) > (ordered[ordered.length - 1] ?? 0) ? 0 : ordered.length - 1;
}

function CompanyMaster({ board, companies }: { board: Board; companies: Company[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bulk, setBulk] = useState("");
  const [form, setForm] = useState({ name: "", symbol: "", exchange: "NSE", sector: "", quantity: "", averageBuyPrice: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["companies", board.id] });
  const existing = useMemo(() => new Set(companies.map((c) => `${c.exchange}:${c.symbol}`)), [companies]);

  async function insertMany(items: StockHit[]) {
    const fresh = items.filter((i) => !existing.has(`${i.exchange}:${i.symbol}`));
    if (!fresh.length) { toast.info("Already on this board"); return; }
    const { error } = await supabase.from("companies").insert(
      fresh.map((h) => ({ board_id: board.id, name: h.name, symbol: h.symbol, exchange: h.exchange, sector: h.sector })),
    );
    if (error) { toast.error(error.message); return; }
    toast.success(fresh.length === 1 ? `${fresh[0]!.symbol} added` : `${fresh.length} companies added`);
    refresh();
  }

  async function addBulk() {
    const syms = [...new Set(bulk.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 100);
    await insertMany(syms.map((s) => {
      const n = NIFTY50.find((x) => x.symbol === s);
      return { symbol: s, exchange: "NSE", name: n?.name ?? s, sector: n?.sector ?? null };
    }));
    setBulk(""); setOpen(false);
  }

  async function add() {
    if (!form.symbol.trim() || !form.name.trim()) { toast.error("Name and symbol are required"); return; }
    const { error } = await supabase.from("companies").insert({
      board_id: board.id, name: form.name.trim(), symbol: form.symbol.trim().toUpperCase(), exchange: form.exchange,
      sector: form.sector || null, quantity: form.quantity ? Number(form.quantity) : null,
      average_buy_price: form.averageBuyPrice ? Number(form.averageBuyPrice) : null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`${form.symbol.toUpperCase()} added`);
    setForm({ name: "", symbol: "", exchange: "NSE", sector: "", quantity: "", averageBuyPrice: "" });
    refresh();
  }
  const update = async (id: string, patch: Partial<Company>) => {
    const { error } = await supabase.from("companies").update(patch).eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };
  const remove = async (id: string) => {
    if (!confirm("Remove this company?")) return;
    await supabase.from("companies").delete().eq("id", id); refresh();
  };
  async function deleteBoard() {
    if (!confirm(`Delete board "${board.name}" and all its companies?`)) return;
    await supabase.from("boards").delete().eq("id", board.id);
    qc.invalidateQueries({ queryKey: ["boards"] });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-full max-w-xl">
          <StockSearch existing={existing} onAdd={(h) => insertMany([h])} />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><ListPlus className="h-4 w-4" />Bulk / manual add</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add several companies</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Paste NSE symbols separated by commas, spaces or new lines.</p>
            <Textarea rows={4} className="font-mono" placeholder="RELIANCE, TCS, INFY, HDFCBANK" value={bulk} onChange={(e) => setBulk(e.target.value)} />
            <Button onClick={addBulk} disabled={!bulk.trim()}>Add symbols</Button>
            <div className="border-t pt-3">
              <Button variant="secondary" className="w-full" onClick={() => insertMany(NIFTY50.map((n) => ({ ...n, exchange: "NSE" })))}>Import all Nifty 50 companies</Button>
            </div>
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">Manual entry</p>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input placeholder="Symbol (e.g. RELIANCE)" className="font-mono" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
                <Select value={form.exchange} onValueChange={(v) => setForm({ ...form, exchange: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="NSE">NSE</SelectItem><SelectItem value="BSE">BSE</SelectItem></SelectContent>
                </Select>
                <Input placeholder="Sector (optional)" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
                <Input placeholder="Share count (optional)" type="number" min="0" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                <Input placeholder="Average buy price ₹ (optional)" type="number" min="0" step="any" value={form.averageBuyPrice} onChange={(e) => setForm({ ...form, averageBuyPrice: e.target.value })} />
              </div>
              <Button onClick={add} className="w-full">Add to {board.name}</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={deleteBoard}><Trash2 className="h-4 w-4" />Delete board</Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-card text-left"><tr>{["Company", "Symbol", "Exchange", "Sector", "Shares", "Average buy price", "Active", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-1"><Input className="h-8" defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && update(c.id, { name: e.target.value })} /></td>
                <td className="px-3 py-1"><Input className="h-8 w-32 font-mono" defaultValue={c.symbol} onBlur={(e) => e.target.value.toUpperCase() !== c.symbol && update(c.id, { symbol: e.target.value.toUpperCase() })} /></td>
                <td className="px-3 py-1">
                  <Select value={c.exchange} onValueChange={(v) => update(c.id, { exchange: v })}>
                    <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="NSE">NSE</SelectItem><SelectItem value="BSE">BSE</SelectItem></SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-1"><Input className="h-8" defaultValue={c.sector ?? ""} onBlur={(e) => update(c.id, { sector: e.target.value || null })} /></td>
                <td className="px-3 py-1"><Input aria-label={`${c.symbol} share count`} className="h-8 w-24" type="number" min="0" step="any" placeholder="Shares" defaultValue={c.quantity ?? ""} onBlur={(e) => update(c.id, { quantity: e.target.value ? Number(e.target.value) : null })} /></td>
                <td className="px-3 py-1"><Input aria-label={`${c.symbol} average buy price`} className="h-8 w-32" type="number" min="0" step="any" placeholder="Buy price ₹" defaultValue={c.average_buy_price ?? ""} onBlur={(e) => update(c.id, { average_buy_price: e.target.value ? Number(e.target.value) : null })} /></td>
                <td className="px-3 py-1"><Switch checked={c.active} onCheckedChange={(v) => update(c.id, { active: v })} /></td>
                <td className="px-3 py-1 text-right">
                  <a href={`https://www.tradingview.com/chart/?symbol=${c.exchange}:${c.symbol}`} target="_blank" rel="noreferrer" className="mr-2 inline-flex text-muted-foreground hover:text-foreground" title="Open in TradingView"><ExternalLink className="h-4 w-4" /></a>
                  <button onClick={() => remove(c.id)} className="text-muted-foreground hover:text-destructive" title="Remove"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {!companies.length && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No companies yet — click "Add company".</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ErrorLog({ boardId }: { boardId: string }) {
  const log = useQuery({
    queryKey: ["log", boardId],
    queryFn: async () => {
      const { data, error } = await supabase.from("refresh_log").select("*").eq("board_id", boardId).order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data;
    },
  });
  const lastOk = log.data?.find((l) => l.status === "ok");
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Last successful update: <span className="font-mono text-foreground">{lastOk ? new Date(lastOk.created_at).toLocaleString("en-IN") : "—"}</span></p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-card text-left"><tr>{["Time", "Symbol", "Status", "Message"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {log.data?.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-3 py-1 font-mono text-xs">{new Date(l.created_at).toLocaleString("en-IN")}</td>
                <td className="px-3 py-1 font-mono">{l.symbol}</td>
                <td className={`px-3 py-1 ${l.status === "ok" ? "text-bull" : "text-bear"}`}>{l.status}</td>
                <td className="px-3 py-1 text-muted-foreground">{l.message}</td>
              </tr>
            ))}
            {!log.data?.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No refreshes yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
