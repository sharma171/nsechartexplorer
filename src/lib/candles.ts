export type Bar = { t: number; o: number | null; h: number | null; l: number | null; c: number | null; v?: number | null };
export type Colour = "green" | "red" | "neutral" | "nodata";
export type Method = "standard" | "heikin-ashi";
export type Cell = { t: number; colour: Colour; bar: Bar; ha?: { o: number; c: number } };

const valid = (b: Bar) => b.o != null && b.h != null && b.l != null && b.c != null && b.o > 0;

function classify(o: number, c: number, tolerancePct: number): Colour {
  const diffPct = (Math.abs(c - o) / o) * 100;
  if (c === o || diffPct <= tolerancePct) return "neutral";
  return c > o ? "green" : "red";
}

/** Classifies every bar. Heikin-Ashi is computed over the full history so earlier bars warm it up. */
export function computeCells(bars: Bar[], method: Method, tolerancePct = 0): Cell[] {
  let prevHa: { o: number; c: number } | null = null;
  return bars.map((bar) => {
    if (!valid(bar)) return { t: bar.t, colour: "nodata" as Colour, bar };
    const { o, h, l, c } = bar as { o: number; h: number; l: number; c: number };
    if (method === "standard") return { t: bar.t, colour: classify(o, c, tolerancePct), bar };
    const haC = (o + h + l + c) / 4;
    const haO = prevHa ? (prevHa.o + prevHa.c) / 2 : (o + c) / 2;
    prevHa = { o: haO, c: haC };
    return { t: bar.t, colour: classify(haO, haC, tolerancePct), bar, ha: prevHa };
  });
}

export type Trend = "Bullish" | "Bearish" | "Mixed" | "Data pending";

export function summarise(cells: Cell[]) {
  const real = cells.filter((c) => c.colour !== "nodata");
  const last = cells[cells.length - 1];
  if (!last || last.colour === "nodata" || real.length < 3) {
    return { trend: "Data pending" as Trend, streak: 0, streakColour: null as Colour | null, freshChange: false };
  }
  const last3 = real.slice(-3).map((c) => c.colour);
  const trend: Trend = last3.every((c) => c === "green") ? "Bullish" : last3.every((c) => c === "red") ? "Bearish" : "Mixed";
  let streak = 0;
  for (let i = real.length - 1; i >= 0 && real[i]!.colour === last.colour; i--) streak++;
  const prev = real[real.length - 2];
  const freshChange = !!prev && (last.colour === "green" || last.colour === "red") && prev.colour !== last.colour && (prev.colour === "green" || prev.colour === "red");
  return { trend, streak, streakColour: last.colour, freshChange };
}

export function periodLabel(t: number, timeframe: "weekly" | "monthly") {
  const d = new Date(t * 1000);
  return timeframe === "monthly"
    ? d.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "Asia/Kolkata" })
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
}

/** Aggregates monthly or sub-yearly bars into calendar year bars */
export function aggregateBarsByYear(bars: Bar[]): Bar[] {
  const groups = new Map<number, Bar[]>();
  for (const bar of bars) {
    if (bar.o == null || bar.c == null || bar.h == null || bar.l == null) continue;
    const year = new Date(bar.t * 1000).getUTCFullYear();
    let arr = groups.get(year);
    if (!arr) {
      arr = [];
      groups.set(year, arr);
    }
    arr.push(bar);
  }
  const result: Bar[] = [];
  for (const [, yearBars] of groups) {
    if (yearBars.length === 0) continue;
    const first = yearBars[0]!;
    const last = yearBars[yearBars.length - 1]!;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const b of yearBars) {
      if (b.h != null && b.h > high) high = b.h;
      if (b.l != null && b.l < low) low = b.l;
      if (b.v != null) volume += b.v;
    }
    result.push({
      t: first.t,
      o: first.o,
      h: high === -Infinity ? first.o : high,
      l: low === Infinity ? first.o : low,
      c: last.c,
      v: volume > 0 ? volume : null,
    });
  }
  return result;
}

