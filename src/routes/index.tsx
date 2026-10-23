import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Candle Colour Tracker — NSE weekly & monthly trends at a glance" },
      { name: "description", content: "Scan 25+ NSE companies in under a minute: one row per company, one green or red cell per week or month." },
      { property: "og:title", content: "Candle Colour Tracker" },
      { property: "og:description", content: "Weekly and monthly candle colours for your NSE portfolio on one screen." },
    ],
  }),
  component: Index,
});

const demo = ["gggrgggg", "rrgrrrrg", "ggnggrrr", "grgrgggg", "rrrrrggg"];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <p className="font-mono text-sm text-primary">NSE · WEEKLY · MONTHLY</p>
        <h1 className="mt-4 max-w-3xl font-display text-5xl font-bold leading-tight tracking-tight">Your whole portfolio's candles, on one screen.</h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">Stop opening chart after chart. Each company is a row, each week or month a coloured cell — spot trend changes in under a minute.</p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/auth">Sign in with mobile</Link></Button>
        </div>
        <div className="mt-16 inline-block rounded-lg border bg-card p-5">
          {demo.map((row, i) => (
            <div key={i} className="mb-1.5 flex items-center gap-1">
              <span className="mr-3 w-24 font-mono text-xs text-muted-foreground">{["RELIANCE", "TCS", "INFY", "HDFCBANK", "ITC"][i]}</span>
              {row.split("").map((c, j) => <span key={j} className={`h-6 w-7 rounded-[3px] ${c === "g" ? "bg-bull" : c === "r" ? "bg-bear" : "bg-neutral-candle"}`} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
