import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const phone = (user.user_metadata?.['phone'] as string | undefined) ?? user.email?.split("@")[0];
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="flex h-12 min-w-0 items-center gap-2 overflow-x-auto px-3 sm:gap-4 sm:px-4">
            <Link to="/dashboard" className="flex shrink-0 items-center gap-1.5 font-display font-bold text-sm sm:text-base sm:gap-2">
              <span className="flex gap-0.5"><span className="h-4 w-2 rounded-sm bg-bull" /><span className="h-4 w-2 rounded-sm bg-bear" /></span>
              Candle Tracker
            </Link>
            <nav className="flex shrink-0 gap-3 text-sm sm:gap-4">
              <Link to="/dashboard" className="text-muted-foreground hover:text-foreground whitespace-nowrap" activeProps={{ className: "text-foreground" }}>Boards</Link>
              <Link to="/charts" search={{ symbols: "" }} className="text-muted-foreground hover:text-foreground whitespace-nowrap" activeProps={{ className: "text-foreground" }}>Charts</Link>
            </nav>
            <div className="ml-auto flex min-w-0 shrink items-center gap-2 text-sm">
              <span className="hidden truncate font-mono text-muted-foreground sm:inline">+{phone}</span>
              <Button size="sm" variant="outline" className="shrink-0" onClick={signOut}>Sign out</Button>
            </div>
          </div>
        </header>
      <Outlet />
    </div>
  );
}
