import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { searchSymbols } from "@/lib/market.functions";
import { NIFTY50 } from "@/lib/nifty";
import { Input } from "@/components/ui/input";

export type StockHit = { symbol: string; exchange: string; name: string; sector: string | null };

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** Type-ahead stock search: instant local Nifty matches + live NSE/BSE results. */
export function StockSearch({ existing, onAdd, placeholder = "Type a company or symbol, e.g. hdfc, tata, infy", autoFocus }: {
  existing: Set<string>; onAdd: (hit: StockHit) => void | Promise<void>; placeholder?: string; autoFocus?: boolean;
}) {
  const search = useServerFn(searchSymbols);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const dq = useDebounced(q.trim(), 250);

  const remote = useQuery({
    queryKey: ["symbol-search", dq.toLowerCase()],
    enabled: dq.length >= 2,
    staleTime: 5 * 60_000,
    queryFn: () => search({ data: { q: dq } }),
  });

  const hits = useMemo<StockHit[]>(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const local = NIFTY50.filter((n) => n.symbol.toLowerCase().includes(t) || n.name.toLowerCase().includes(t))
      .sort((a, b) => Number(!a.symbol.toLowerCase().startsWith(t)) - Number(!b.symbol.toLowerCase().startsWith(t)))
      .map((n) => ({ ...n, exchange: "NSE" }));
    const seen = new Set(local.map((l) => `NSE:${l.symbol}`));
    const extra = (remote.data ?? []).filter((r) => !seen.has(`${r.exchange}:${r.symbol}`))
      // prefer NSE listing over duplicate BSE
      .filter((r, _i, arr) => r.exchange === "NSE" || !(seen.has(`NSE:${r.symbol}`) || arr.some((x) => x.exchange === "NSE" && x.symbol === r.symbol)));
    return [...local, ...extra].slice(0, 12);
  }, [q, remote.data]);

  useEffect(() => setHi(0), [q]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pick = async (h: StockHit) => {
    if (existing.has(`${h.exchange}:${h.symbol}`)) return;
    await onAdd(h);
  };

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        autoFocus={autoFocus}
        className="pl-8"
        placeholder={placeholder}
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(i + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && hits[hi]) { e.preventDefault(); void pick(hits[hi]!); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {remote.isFetching && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
      {open && q.trim() && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
          {hits.map((h, i) => {
            const added = existing.has(`${h.exchange}:${h.symbol}`);
            return (
              <button type="button" key={h.exchange + h.symbol}
                onMouseEnter={() => setHi(i)} onClick={() => pick(h)} disabled={added}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${i === hi ? "bg-secondary" : ""} ${added ? "opacity-60" : ""}`}>
                <span className="w-28 shrink-0 font-mono text-xs font-semibold">{h.symbol}</span>
                <span className="min-w-0 flex-1 truncate">{h.name}{h.sector && <span className="ml-2 text-xs text-muted-foreground">{h.sector}</span>}</span>
                <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{h.exchange}</span>
                {added ? <Check className="h-4 w-4 text-bull" /> : <Plus className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
          {!hits.length && (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              {remote.isFetching || dq !== q.trim() ? "Searching…" : "No matching NSE/BSE stocks"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
