import { useMemo, useEffect, useState, useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  X,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart2,
  Gauge,
  Minimize2,
} from "lucide-react";
import CandleChart from "@/components/CandleChart";
import type { Bar } from "@/lib/candles";
import type { SymbolData } from "@/lib/market.functions";
import type { StockIndicators } from "@/lib/indicators";
import type { Tables } from "@/integrations/supabase/types";

type Company = Tables<"companies">;

export type FullScreenChartDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  co: Company | null;
  bars: Bar[];
  quote?: SymbolData | null;
  indicators?: StockIndicators | null;
  money: (v: number | null | undefined) => string;
  portRow?: {
    shares: number;
    averageBuyPrice: number | null;
    latestClose: number | null;
    invested: number | null;
    currentValue: number | null;
    profitLoss: number | null;
    profitLossPercent: number | null;
  } | null;
};

export function FullScreenChartDialog({
  open,
  onOpenChange,
  co,
  bars,
  quote,
  indicators,
  money,
  portRow,
}: FullScreenChartDialogProps) {
  if (!co) return null;

  const currentPrice = portRow?.latestClose ?? indicators?.currentPrice ?? quote?.latestClose ?? null;
  const plPos = portRow?.profitLoss !== null && portRow?.profitLoss !== undefined && portRow.profitLoss > 0;
  const plNeg = portRow?.profitLoss !== null && portRow?.profitLoss !== undefined && portRow.profitLoss < 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md animate-in fade-in-0 duration-150" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[100] flex h-screen w-screen max-h-screen max-w-none flex-col overflow-hidden bg-[#090d12] text-foreground p-0 gap-0 select-none animate-in fade-in-0 duration-150 outline-none"
        >
          <DialogTitle className="sr-only">{co.name} Full Screen Stock Chart</DialogTitle>

          {/* ─── Top Control & Stock Info Bar ─── */}
          <div className="flex-none flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-[#0f1419] px-4 py-2.5 shadow-sm">
            {/* Left: Symbol, Name, Exchange, Sector & Price */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-primary/20 border border-primary/30 px-2.5 py-0.5 font-mono text-base font-bold text-primary tracking-wide">
                  {co.symbol}
                </span>
                <span className="font-display text-base font-bold text-foreground">
                  {co.name}
                </span>
                <span className="rounded bg-secondary/80 px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                  {co.exchange || "NSE"}
                </span>
                {co.sector && (
                  <span className="hidden sm:inline-block rounded bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                    {co.sector}
                  </span>
                )}
              </div>

              {/* Price & Change Badge */}
              <div className="flex items-center gap-2 pl-3 border-l border-border/50">
                <span className="font-mono text-xl font-extrabold text-foreground tracking-tight">
                  {currentPrice ? money(currentPrice) : "—"}
                </span>
                {indicators?.currentWeek?.changePct != null && (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      indicators.currentWeek.changePct >= 0
                        ? "bg-bull/15 text-bull border border-bull/20"
                        : "bg-bear/15 text-bear border border-bear/20"
                    }`}
                  >
                    {indicators.currentWeek.changePct >= 0 ? "+" : ""}
                    {indicators.currentWeek.changePct.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>

            {/* Center: Key Technical Indicator Badges */}
            <div className="hidden xl:flex items-center gap-3 text-xs font-mono">
              {/* 52W Range */}
              {indicators?.high52 != null && indicators?.low52 != null && (
                <div className="flex items-center gap-2 bg-secondary/40 border border-border/40 rounded-lg px-2.5 py-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">52W:</span>
                  <span className="text-muted-foreground">{money(indicators.low52)}</span>
                  <div className="relative h-1.5 w-14 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full w-full bg-gradient-to-r from-bear/40 via-amber-500/30 to-bull/40" />
                    {indicators.range52PositionPct != null && (
                      <div
                        className="absolute top-0 bottom-0 w-1.5 -ml-0.5 rounded-full bg-primary shadow-sm"
                        style={{ left: `${indicators.range52PositionPct}%` }}
                      />
                    )}
                  </div>
                  <span className="text-muted-foreground">{money(indicators.high52)}</span>
                  {indicators.range52PositionPct != null && (
                    <span className="text-primary font-bold">({indicators.range52PositionPct}%)</span>
                  )}
                </div>
              )}

              {/* Week High / Low */}
              {indicators?.currentWeek?.high != null && indicators?.currentWeek?.low != null && (
                <div className="flex items-center gap-2 bg-secondary/40 border border-border/40 rounded-lg px-2.5 py-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Week:</span>
                  <span className="text-foreground">H {money(indicators.currentWeek.high)}</span>
                  <span className="text-muted-foreground/40">/</span>
                  <span className="text-foreground">L {money(indicators.currentWeek.low)}</span>
                </div>
              )}

              {/* RSI */}
              {indicators?.rsi14 != null && (
                <div
                  className={`rounded-lg px-2.5 py-1 font-semibold border ${
                    indicators.rsiStatus === "Overbought"
                      ? "bg-bear/15 text-bear border-bear/30"
                      : indicators.rsiStatus === "Oversold"
                      ? "bg-bull/15 text-bull border-bull/30"
                      : "bg-secondary/40 text-foreground border-border/40"
                  }`}
                >
                  RSI {indicators.rsi14} ({indicators.rsiStatus})
                </div>
              )}

              {/* Portfolio Holding summary */}
              {portRow?.shares ? (
                <div className="flex items-center gap-2 border-l border-border/50 pl-3">
                  <span className="text-muted-foreground">
                    {portRow.shares} shares @ {money(portRow.averageBuyPrice)}
                  </span>
                  {portRow.profitLoss !== null && (
                    <span
                      className={`font-bold ${
                        plPos ? "text-bull" : plNeg ? "text-bear" : "text-muted-foreground"
                      }`}
                    >
                      {portRow.profitLoss >= 0 ? "+" : ""}
                      {money(portRow.profitLoss)} (
                      {portRow.profitLossPercent != null
                        ? `${portRow.profitLossPercent >= 0 ? "+" : ""}${portRow.profitLossPercent.toFixed(1)}%`
                        : ""}
                      )
                    </span>
                  )}
                </div>
              ) : null}
            </div>

            {/* Right: TradingView Link & Exit Full Screen */}
            <div className="flex items-center gap-2">
              <a
                href={`https://www.tradingview.com/chart/?symbol=${co.exchange || "NSE"}:${co.symbol}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-border/60 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                title="Open in external TradingView"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">TradingView</span>
              </a>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-8 gap-1.5 text-xs font-semibold hover:border-primary hover:text-primary"
                title="Exit Full Screen (Esc)"
              >
                <Minimize2 className="h-3.5 w-3.5 text-primary" />
                <span>Exit Fullscreen</span>
              </Button>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md border border-border/60 p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                title="Close Full Screen"
                aria-label="Close Full Screen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ─── Full Screen Chart Container (Flex-1 fills all remaining viewport) ─── */}
          <div className="flex-1 min-h-0 w-full overflow-hidden p-2.5 bg-[#090d12] flex flex-col">
            <CandleChart
              bars={bars}
              symbol={co.symbol}
              exchange={co.exchange || "NSE"}
              averageBuyPrice={co.quantity ? co.average_buy_price : null}
              high52={indicators?.high52 ?? quote?.fiftyTwoWeekHigh}
              low52={indicators?.low52 ?? quote?.fiftyTwoWeekLow}
              showToolbar={true}
              onFullScreen={() => onOpenChange(false)}
              isFullScreen={true}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
