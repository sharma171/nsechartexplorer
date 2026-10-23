import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone, phoneToEmail } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Candle Colour Tracker" },
      { name: "description", content: "Sign in with your mobile number to view your NSE candle colour boards." },
      { property: "og:title", content: "Sign in — Candle Colour Tracker" },
      { property: "og:description", content: "Sign in with your mobile number to view your NSE candle colour boards." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const digits = normalizePhone(phone);
    if (digits.length < 10 || digits.length > 13) { toast.error("Enter a valid mobile number"); return; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setBusy(true);
    const email = phoneToEmail(phone);
    const { error } =
      mode === "up"
        ? await supabase.auth.signUp({ email, password, options: { data: { phone: digits } } })
        : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      const msg = error.message.includes("already registered") ? "This mobile number is already registered. Sign in instead." :
        error.message.includes("Invalid login") ? "Wrong mobile number or password" : error.message;
      toast.error(msg); return;
    }
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex gap-1">
            <span className="h-6 w-3 rounded-sm bg-bull" /><span className="h-6 w-3 rounded-sm bg-bear" /><span className="h-6 w-3 rounded-sm bg-bull" />
          </div>
          <h1 className="font-display text-xl font-bold tracking-tight">Candle Colour Tracker</h1>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-lg border bg-card p-6">
          <h2 className="font-display text-lg font-semibold">{mode === "in" ? "Sign in" : "Create account"}</h2>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Mobile number</Label>
            <Input id="phone" inputMode="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">Password</Label>
            <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}</Button>
          <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "New here? Create an account" : "Already registered? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
