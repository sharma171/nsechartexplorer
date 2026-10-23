<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Market data comes from Yahoo Finance chart API via an auth-protected server function (src/lib/market.functions.ts); NSE has no reliable official API reachable from servers.
- Phone login maps the number to a synthetic email (<digits>@phone.local) with auto-confirm; never send email to these addresses.
- Candle colour logic lives in the pure module src/lib/candles.ts (tested); UI must not duplicate it.
- Portfolio valuation formulas live in the pure, tested src/lib/portfolio.ts module; the dashboard uses the latest fetched candle close as an estimate, not a live quote.
