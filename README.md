# TradeDesk

A calm, glass-style trading journal and toolkit for retail traders. Journal trades, read your stats, see your month as a P&L heatmap, size positions properly and study from a curated video library — with a deep, instant theme system.

**Everything stays in your browser.** Settings and trades live in `localStorage`; uploaded backgrounds and screenshots live in IndexedDB. There is no backend and no sign-in.

> Educational tool, not financial advice.

## Features

- **Dashboard**: total P&L (hideable), win-rate ring, average winning R, profit factor, average win and loss, expectancy, max drawdown, current streak, an equity curve and a this-week summary.
- **Journal**: list, grid, daily and weekly views. A full "Log trade" drawer with live P&L, R and RR, plus a 4-field Quick Log. Search, filters, CSV import and export, and duplicate merging.
- **Calendar**: monthly P&L heatmap with weekly totals. Click a day to see its trades, write a markdown note, set a mood and tick a rules checklist.
- **Calculators**: position size, P&L, RR and break-even, risk of ruin with a drawdown recovery table, compounding, a session clock and time converter (Tashkent, London, New York), and an editable symbol-specs table.
- **Study**: 36 verified YouTube lessons in 8 categories, with search, favourites, watched progress, a privacy-friendly player (youtube-nocookie) and "paste a link to add".
- **Strategy sidebar**: a pre-market plan (markdown), a daily checklist, a session-rules tracker with 7-day history, and recent trades.
- **Themes**: 8 presets, accent/profit/loss colours, your own image or video background, 10 generated backgrounds, glass controls, cursor and button styles, type scale and density, saved profiles, and JSON import/export.
- **Polish**: spring page transitions, count-ups, keyboard shortcuts, PWA install and offline use, a contrast guard for bright backgrounds, and respect for `prefers-reduced-motion`.

## Automatic MetaTrader 5 sync

With an account, TradeDesk syncs closed trades, balance and equity from MetaTrader 5. You trade, and the Dashboard, Journal and Calendar update by themselves within seconds. You can still add notes, tags, emotions, a rating, rules and screenshots afterwards. Manual logging still works for other brokers.

```
MT5 terminal ──(EA: TradeDeskSync, read-only)──HTTPS──▶ /api/mt5/sync, /api/mt5/heartbeat (Vercel)
                                                              │ service role, zod-validated
                                                              ▼
                     Browser ◀──Realtime──── Supabase Postgres (RLS) ── deals_raw → trades, accounts
```

- **EA** (`mt5/TradeDeskSync.mq5`): reads deal history and account info, converts XM server time (GMT+2/+3) to UTC, and queues deals on disk. It sends batches with retry and backoff, and sends a heartbeat every 30 s. It contains no trading functions. See [`mt5/README.md`](mt5/README.md).
- **API** (`api/`, logic in `server/`): authenticates the sync key, stores every raw deal (idempotent per ticket), rebuilds trades for the affected positions, and updates the account snapshot.
- **Trade building** (`src/lib/mt5/buildTrades.ts`): deals are grouped by `POSITION_ID`.
  - It handles partial closes, scale-ins, close-by, hedging and netting.
  - On netting accounts, a reversal (`DEAL_ENTRY_INOUT`) splits one position into two legs.
  - Open price is the volume-weighted average of entries; close price is the volume-weighted average of exits.
  - Net P&L is the sum of profit, commission, swap and fee across the position's deals.
  - R uses the initial SL. Trades without a stop are marked "R unknown" and left out of average R.
- **Balance**: deposits, withdrawals and credit are recorded but never counted as P&L. Return % is trading P&L ÷ (starting balance + deposits − withdrawals).
- **Days**: timestamps are stored in UTC. The calendar puts each trade on the day it closed in your timezone (default `Asia/Tashkent`, set in Settings → Data & time).
- **Symbols**: XM names such as `GOLD`, `US100Cash` and `EURUSDm#` map to standard names and groups (Gold, Nasdaq, FX, Indices, Crypto). You can override them in Settings → Symbols.

### Setting up the backend

1. Create a Supabase project, then link and push the migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push            # applies supabase/migrations
   npx supabase config push        # auth site URL + redirect URLs from supabase/config.toml
   ```
2. Set the environment variables (see `.env.example`) in Vercel:
   ```bash
   vercel env add VITE_SUPABASE_URL production
   vercel env add VITE_SUPABASE_ANON_KEY production
   vercel env add SUPABASE_URL production
   vercel env add SUPABASE_SERVICE_ROLE_KEY production   # server only
   vercel env add SYNC_KEY_PEPPER production             # openssl rand -base64 48
   vercel env add ALLOWED_ORIGINS production             # https://tradezdesk.vercel.app
   ```
3. Deploy: `vercel --prod`. Without these variables the site keeps running fully on-device, and `/api` answers `503`.

### Data model

| Table                | Purpose                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`           | Display name, timezone, and synced settings (theme, specs, symbol map, journal notes)                                            |
| `accounts`           | One row per MT5 login: broker, server, currency, leverage, starting balance, live balance and equity, last sync and heartbeat    |
| `sync_keys`          | `key_hash` (HMAC-SHA256 with a server pepper), display prefix, last used, revoked                                                |
| `deals_raw`          | Every MT5 deal as received (`UNIQUE(account_id, deal_ticket)`), kept for audit and re-processing                                 |
| `trades`             | One row per position leg (`UNIQUE(account_id, position_id, leg)`): broker numbers plus journal fields, `source` ∈ mt5/manual/csv |
| `daily_stats` (view) | Per account and day, in the owner's timezone: net P&L, trades, wins, losses, deposits, withdrawals, balance at close             |

Row Level Security is enabled on every table. Column grants and a trigger stop the browser from changing broker numbers on MT5 trades. These rules are tested against real Postgres in `supabase/tests/rls.test.ts`.

### API

All endpoints accept `POST` with JSON only, and validate bodies with zod.

#### `POST /api/mt5/sync`

Header: `X-Sync-Key: tdk_…`. Body: an account snapshot plus up to 500 deals. Times are UTC epoch seconds.

```bash
curl -X POST https://tradezdesk.vercel.app/api/mt5/sync \
  -H "Content-Type: application/json" -H "X-Sync-Key: $SYNC_KEY" \
  -d '{"account":{"login":51234567,"server":"XMGlobal-MT5 7","currency":"USD","leverage":500,"balance":10492,"equity":10510},
       "deals":[
        {"ticket":9002,"order":2,"position_id":501,"time":1772442000,"type":0,"entry":0,"symbol":"GOLD","volume":0.5,"price":2650,"profit":0,"commission":-3.5,"swap":0,"fee":0,"sl":2640,"tp":2670,"magic":0,"comment":""},
        {"ticket":9003,"order":3,"position_id":501,"time":1772442600,"type":1,"entry":1,"symbol":"GOLD","volume":0.5,"price":2660,"profit":500,"commission":-3.5,"swap":-1,"fee":0,"sl":2640,"tp":2670,"magic":0,"comment":"[tp]"}]}'
```

```json
{
  "ok": true,
  "account_id": "…",
  "received": 2,
  "stored": 2,
  "duplicates": 0,
  "invalid": 0,
  "trades_upserted": 1,
  "closed_trades": 1,
  "results": [
    { "ticket": 9002, "status": "stored", "kind": "trade" },
    { "ticket": 9003, "status": "stored", "kind": "trade" }
  ]
}
```

Sending the same deals again returns `"status": "duplicate"` and changes nothing. A bad item is reported as `"status": "invalid"` with a reason, and the valid items in the batch are still stored.

| Status | Meaning                              |
| ------ | ------------------------------------ |
| `401`  | Unknown, malformed or revoked key    |
| `409`  | Key belongs to a different MT5 login |
| `413`  | Body too large                       |
| `429`  | Rate limited (see `Retry-After`)     |
| `503`  | Backend not configured               |

#### `POST /api/mt5/heartbeat`

This updates balance, equity and last-seen, which drive the **Connected / Waiting / Offline** chip. The response's `resync: true` tells the EA to re-send its history (set by **Re-sync from MT5** in the app).

```bash
curl -X POST https://tradezdesk.vercel.app/api/mt5/heartbeat \
  -H "Content-Type: application/json" -H "X-Sync-Key: $SYNC_KEY" \
  -d '{"account":{"login":51234567,"server":"XMGlobal-MT5 7","currency":"USD","balance":10492,"equity":10530},"ea_version":"1.0.0","queue_size":0}'
```

#### `POST /api/accounts/keys`

Needs a signed-in session: `Authorization: Bearer <Supabase access token>`. Creates or revokes a sync key. The plain key is returned only once.

```bash
curl -X POST https://tradezdesk.vercel.app/api/accounts/keys -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"create","account_id":"<uuid>","label":"MT5 EA","revoke_others":true}'
curl -X POST https://tradezdesk.vercel.app/api/accounts/keys -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"revoke","key_id":"<uuid>"}'
```

#### `POST /api/accounts/recalculate`

Needs a session. Rebuilds every MT5 trade of an account from `deals_raw`, applying the current symbol mapping. Journal fields are kept.

```bash
curl -X POST https://tradezdesk.vercel.app/api/accounts/recalculate -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"account_id":"<uuid>"}'
```

### Testing the sync without trading

- `npm run dev:api` starts an in-memory sync API on `http://localhost:3000` and prints a key.
- `npm run test:sync -- --url <site> --key <test key>` runs the live integration test. It posts a batch, re-posts it with duplicates, and checks idempotency and totals.
- `npm run sim:mt5 -- --url <site> --key <test key> --trades 10 --every 5` streams simulated trades like the EA does.
- In the app, **Settings → Data & time → Simulate MT5 trades** sends 6 trades through the real API into a separate "Simulator" account.

Use keys from a test account for these tools. The first sync binds a key to the MT5 login it sees.

### Threat model (short)

- **MT5 credentials never leave the terminal.** The EA reads only history and account info (login, server, currency, balance, equity), never passwords. It contains no trading functions, and a test fails the build if any appear.
- **Sync keys** are 256-bit random values, stored as HMAC-SHA256 with a server-side pepper and shown once. They can be revoked, and are tied to one account and, after the first sync, to one MT5 login. A leaked key can only add deals to that account. It cannot read data, and it cannot touch other users.
- **The server never trusts the client** for identity. The account and user come from the key. Bodies are validated with zod, capped at 500 deals and 1.5 MB, and string fields are length-limited and stripped of control characters.
- **Database:** RLS is on every table, anonymous access is revoked, and the key hash is not readable. MT5 numbers are read-only for users (column grants plus a trigger). The service role key exists only in Vercel server env vars, never in the browser bundle.
- **Browser calls:** CORS allows only `ALLOWED_ORIGINS`, and keys and recalculate need a valid Supabase session. Security headers are set in `vercel.json`.
- **Known limits:** the rate limit is per serverless instance (best effort, not global). Someone with access to your MT5 terminal could read the key from the EA inputs; revoke it in Settings → Accounts if that happens.

## Setup

Requires Node 20+ (developed on Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest unit tests (formulas, CSV, sessions, theme contrast)
npm run lint       # ESLint (strict typescript-eslint)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

To deploy under a sub-path (e.g. GitHub Pages at `/repo/`), build with `VITE_BASE=/repo/ npm run build`.

### Renaming the app

Edit `src/config.ts` (`name`, `tagline`, `disclaimer`). The PWA name is in `public/manifest.webmanifest` and the page title in `index.html`.

## Keyboard shortcuts

| Keys                                 | Action                                                     |
| ------------------------------------ | ---------------------------------------------------------- |
| `N`                                  | Log a new trade                                            |
| `Q`                                  | Quick log                                                  |
| `/`                                  | Search trades or lessons                                   |
| `T`                                  | Open themes                                                |
| `H`                                  | Hide / show balances                                       |
| `G` then `D` / `J` / `C` / `K` / `S` | Go to Dashboard / Journal / Calendar / Calculators / Study |
| `?`                                  | Shortcut list                                              |

## Formulas (with worked examples)

All financial math is in pure functions under `src/lib/finance/` and is covered by `*.test.ts` files. Every example below is also a unit test.

### Value of a price move

```
value per 1.0 price move per lot (USD) = tickValue / tickSize × usdPerQuote
pip value per lot = value per 1.0 move × pipSize
```

`usdPerQuote` converts the quote currency into USD using a **manual** rate (live rates are never fetched):

- JPY, CAD, CHF: enter USDJPY / USDCAD / USDCHF → `usdPerQuote = 1 / rate`
- GBP, EUR, AUD, NZD: enter GBPUSD etc. → `usdPerQuote = rate`

| Symbol               | Spec                             | Result                           |
| -------------------- | -------------------------------- | -------------------------------- |
| XAUUSD               | 100 oz, tick 0.01 = $1           | **$100 per $1 move** per 1.0 lot |
| NAS100               | tick 0.01 = $0.01                | **$1 per point** per 1.0 lot     |
| EURUSD               | 100,000 units, tick 0.00001 = $1 | **$10 per pip**                  |
| USDJPY @ 150         | tick 0.001 = ¥100                | ¥1,000 per pip = **$6.67**       |
| EURGBP @ GBPUSD 1.27 | tick 0.00001 = £1                | £10 per pip = **$12.70**         |

### Position size

```
risk $      = balance × risk% (or a fixed $ amount)
lots        = floor( risk $ ÷ (|entry − stop| × value per move per lot), 0.01 )
RR          = |target − entry| ÷ |entry − stop|
notional $  = lots × contract size × entry × usdPerQuote
margin $    = notional ÷ leverage
```

Lots always round **down**, so the actual risk never exceeds your target.

- **XAUUSD**: $10,000 balance, 1% risk ($100), entry 2000, stop 1995 → 5.00 × $100 = $500 per lot → **0.20 lots**. A target of 2015 gives **1:3** and a $300 reward. Notional is $40,000, so margin at 1:100 is **$400**.
- **EURUSD**: $10,000, 1%, entry 1.1000, stop 1.0980 (20 pips × $10 = $200 per lot) → **0.50 lots**.
- **USDJPY**: $100 risk, 20-pip stop at USDJPY 150 (20 × $6.67 = $133.33 per lot) → **0.75 lots**.
- **NAS100**: $250 risk, 50-point stop → **5.00 lots**.

### Trade P&L, R and RR

```
net P&L = (exit − entry) × direction × value per move per lot × lots − fees
R       = (exit − entry) × direction ÷ |entry − stop|
```

- XAUUSD long 0.5 lots, 2000 → 2010, $7 fees → gross **$500**, net **$493**.
- EURUSD short 1 lot, 1.1000 → 1.1025 → **−$250** (−25 pips).
- Long, entry 100, stop 95, exit 110 → **+2R**.

### Journal statistics

```
win rate       = wins ÷ (wins + losses)            (break-even trades excluded)
profit factor  = gross profit ÷ gross loss
expectancy     = net P&L ÷ number of trades
avg win R      = mean R of winning trades (trades with entry, stop and exit)
max drawdown   = largest peak-to-trough fall of cumulative equity
```

For trades of +200, −100, +300, −100 and 0: win rate is **50%**, profit factor is 500 ÷ 200 = **2.5**, and expectancy is 300 ÷ 5 = **$60** per trade.

### Break-even win rate and expectancy

```
break-even win rate = 1 ÷ (1 + RR)        1:2 → 33.3%,  1:3 → 25%
expectancy (R)      = p × RR − (1 − p)    45% at 1:2 → +0.35R
```

### Drawdown recovery

```
gain needed = d ÷ (1 − d)        10% → 11.1%,  50% → 100%
losses to reach drawdown D at fixed risk r = ln(1 − D) ÷ ln(1 − r)     1% risk → 69 losses to −50%
```

### Risk of ruin

Each trade wins +RR units with probability p, or loses 1 unit. The probability of ever losing N units is θᴺ, where θ in (0, 1) solves:

```
p·θ^(RR+1) − θ + (1 − p) = 0
```

It is solved by bisection. This is exact for 1:1, where it reduces to the classic gambler's ruin (q/p)ᴺ: 60% at 1:1 with N = 10 gives (0.4 / 0.6)¹⁰ = **1.73%**. For other RR values it is the standard estimate. With no edge (p·RR ≤ 1 − p), ruin is 100%.

### Compounding

```
balance(n) = balance(n−1) × (1 + r) + contribution
```

$10,000 at 2% for 12 periods → **$12,682.42**.

### Sessions

Session hours are defined in each market's local time: Tokyo 09:00–18:00, London 08:00–17:00 and New York 08:00–17:00. They are converted with `Intl`, so daylight saving is handled automatically. Tashkent is UTC+5 all year, so NY 09:30 is 19:30 in Tashkent during winter and 18:30 during US summer time.

## Editing symbol specs

Brokers differ. There are two places to change specs:

1. **In the app**: go to Calculators → Symbol specs. Edit contract size, tick size, tick value, pip size and the conversion rate. Changes save in the browser and feed every calculator and the journal's automatic P&L. Use **Reset** to restore the defaults.
2. **Defaults in code**: edit `src/data/symbolSpecs.ts`. `tickValue` is in the **quote currency** for 1.0 lot. For an index where your broker pays $10 per point, set `tickValue` to `0.1` with `tickSize` `0.01`.

## Editing the lesson library

Lessons live in `src/data/lessons.json`:

```json
{
  "title": "Price Action Trading For Beginners (The Ultimate Guide)",
  "channel": "Rayner Teo",
  "youtubeId": "Z6lKUPUEYJQ",
  "category": "Price Action",
  "level": "beginner",
  "notes": "Why it's worth watching."
}
```

- `category` must be one of: Beginner, Price Action, ICT/SMC, Risk Management, Psychology, Gold/XAUUSD, Nasdaq, Backtesting.
- `level` must be `beginner`, `intermediate` or `advanced`.
- Invalid rows are skipped at load time (`src/features/study/lessons.ts`).

Every bundled ID was checked against YouTube's oEmbed endpoint, and title and channel were taken from that response. Videos that refused embedding were left out. To check a new ID:

```bash
curl "https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=VIDEO_ID"
```

Users can also paste any YouTube link on the Study page. It is checked through oEmbed and saved under "My lessons".

## CSV format

Exports use these columns, and imports match them case-insensitively:

```
id,openedAt,symbol,direction,entry,stop,takeProfit,exit,lots,fees,pnl,session,setup,emotion,rulesFollowed,notes
```

Only `symbol`, `direction` (`long`/`short`/`buy`/`sell`), `openedAt` (any date `Date` can parse) and `pnl` are required.

## Project structure

```
src/
  config.ts              app name, disclaimer
  app/                   top nav, mobile tab bar, shortcuts
  components/            UI primitives (Card, Button, Modal, Drawer, controls, CountUp, toasts)
  features/
    theme/               presets, engine (CSS variables + contrast guard), backgrounds, settings modal
    dashboard/ journal/ calendar/ calculators/ study/ sidebar/
  lib/                   finance math, CSV, dedupe, sessions, colour, IndexedDB, YouTube (+ tests)
  store/                 Zustand stores (settings, trades, journal, study, ui)
  data/                  lessons.json, symbol specs, demo trade generator
```

## Theme system notes

- Every colour, blur, opacity and radius is a CSS variable written to `<html>` by `features/theme/engine.ts`, so switching is instant. Preset changes cross-fade over 300 ms using the View Transitions API.
- **Contrast guard** (on by default): the engine estimates the background's average colour (sampled from uploads). It then raises the dim overlay and card opacity just enough for text to reach WCAG AA (4.5:1). A unit test checks AA for text, muted text, profit and loss colours on every preset.
- Exported theme JSON never includes uploaded media, because that stays in your browser's IndexedDB.
