# Candle Colour Tracker — Web App

A web version of the PDF's tracker: one row per company, one coloured cell per week/month (green = up, red = down, grey = no data), for NSE stocks.

## What you get

**Login**
- Sign up / sign in with mobile number + password (no SMS). Each user's data is private.

**Boards (multiple grids)**
- Create several boards, e.g. "Portfolio", "Watchlist". Switch via tabs/sidebar.
- Each board has its own company list (20–50+ rows).

**Company Master (per board)**
- Add company: search NSE symbol (e.g. RELIANCE), name, sector, optional quantity, Active/Inactive.
- Edit, remove, activate/deactivate.

**Dashboard grid**
- Settings bar: Weekly / Monthly, number of periods (default 24 weeks / 18 months), Standard or Heikin-Ashi, oldest-to-newest or reverse, neutral tolerance %.
- Legend + short instructions always visible.
- Frozen Company/Symbol columns, horizontal scroll, date headers.
- Hover a cell: date + Open/High/Low/Close.
- Current Trend column (Bullish / Bearish / Mixed / Data pending — descriptive only, never "Sell").
- Extras: consecutive green/red streak, highlight of fresh colour change.
- Editable Action (Hold, Review, Exit Consideration, Remain Out, Wait, Monitor), Observation, Last Reviewed date — never overwritten by refresh.
- Summary strip: count of bullish / bearish / changing companies.
- "Refresh Data" button, Data Source label (Yahoo Finance – NSE), last refreshed time, active candle method.
- Export the board to Excel (.xlsx) with coloured cells.

**Detailed charts**
- Click a company to open a full candlestick chart (weekly/monthly).
- Open several charts side by side on a "Charts" page to compare companies.
- Link out to TradingView.

**Error log**
- List of symbols that failed, missing periods, error messages, last success time. One failed symbol never stops others.

## Technical details
- Lovable Cloud: auth (phone mapped to synthetic email `<phone>@phone.local`, auto-confirm), tables: profiles (phone), boards, companies, notes, settings, refresh_log — all RLS by user.
- Server function fetches Yahoo Finance chart API (`SYMBOL.NS`, interval 1wk/1mo) in parallel with per-symbol error capture; cached OHLC stored for auditability.
- Candle engine (standard + Heikin-Ashi) in a pure, tested module.
- Charts: lightweight-charts; export: xlsx library.
- Distinct dark "trading terminal" design, not generic.
- Note: password reset by SMS isn't available with phone+password login.
