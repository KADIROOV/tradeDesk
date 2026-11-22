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
