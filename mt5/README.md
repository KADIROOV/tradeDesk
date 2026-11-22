# TradeDeskSync: MetaTrader 5 Expert Advisor

`TradeDeskSync.mq5` sends your closed deals, balance and equity from MetaTrader 5 to TradeDesk over HTTPS. Trades then appear on the Dashboard, Journal and Calendar within seconds.

**It is read-only.** It reads your trade history and account info. It contains no trading functions, so it can never open, modify or close anything. It never reads or sends your MT5 password. The only credential that leaves the terminal is your TradeDesk sync key. An automated test fails the build if trading functions ever appear in the source.

## Install (XM MT5)

1. In TradeDesk, open **Settings → Accounts → Connect MT5**. Create the account, then **copy the sync key**. It is shown only once.
2. In MT5, open **File → Open Data Folder**, then go to `MQL5\Experts` and copy `TradeDeskSync.mq5` (or `.ex5`) into it. Then right-click **Expert Advisors** in the Navigator and choose **Refresh**.
3. Open **Tools → Options → Expert Advisors**:
   - tick **Allow algorithmic trading**. The EA does not trade, but MT5 only runs EAs when this is enabled.
   - tick **Allow WebRequest for listed URL**, and add `https://tradezdesk.vercel.app`
4. Drag **TradeDeskSync** onto **one** chart. Any symbol or timeframe works. In **Inputs**, paste your key into `SyncKey`, keep `ApiUrl` as `https://tradezdesk.vercel.app`, and press **OK**.
5. Make sure the **Algo Trading** button in the toolbar is green. The bottom-left corner of the chart shows `TradeDesk: connected, last sync 12:04`.

Attach it to only one chart per account. Leave the terminal running (or a VPS) for live sync. When the terminal restarts, the EA continues from where it stopped.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `ApiUrl` | `https://tradezdesk.vercel.app` | Your TradeDesk site |
| `SyncKey` | | Key from TradeDesk (`tdk_…`) |
| `HistoryDaysOnStart` | 90 | Days of history sent on first run, or when you click **Re-sync from MT5** |
| `BatchSize` | 200 | Deals per request (max 500) |
| `HeartbeatSeconds` | 30 | How often balance and equity are sent (drives the Connected chip) |
| `EnableLog` | true | Messages in the **Experts** tab |
| `ServerTimeZone` | US DST | How broker server time is converted to UTC (see below) |
| `FixedOffsetHours` | 2 | Only for the "Fixed offset" mode |

## How it works

- **First run:** it sends a heartbeat, then queues every deal from the last `HistoryDaysOnStart` days.
- **Live:** `OnTradeTransaction` (deal added) triggers a scan. A 5-second timer scan catches anything that event missed.
- **Reliable delivery:** deals are queued in `MQL5\Files\TradeDeskSync\queue_<login>.txt` before they are sent. The highest queued deal ticket is stored in the global variable `TradeDeskSync.<login>.lastDeal`. A crash or restart therefore neither loses nor duplicates deals, and the server ignores duplicates anyway.
- **Retries:** failed sends back off exponentially (5 s, 10 s … up to 5 min) and flush automatically after reconnecting. Each WebRequest times out after 7 seconds, so the terminal is never stuck.
- **Timestamps:** these are sent as UTC epoch seconds and milliseconds. XM server time is GMT+2 in winter and GMT+3 in summer, switching on the US DST dates (`ServerTimeZone = US DST`). On start the EA compares the rule with the live server offset and prints a warning if they differ.

## Troubleshooting

| Status or log message | Fix |
| --- | --- |
| `add https://tradezdesk.vercel.app to … Allow WebRequest` | Error 4014: the URL is not in the WebRequest list (step 3). Add it exactly, with `https://`. |
| `sync key rejected` | The key was revoked or mistyped. Create a new one in TradeDesk and paste it into the EA inputs. |
| `this key belongs to another MT5 account` | Each key is tied to one MT5 login. Create a separate TradeDesk account for each login. |
| `offline - sync HTTP 503` | The site has no sync configuration yet. |
| `WARNING server offset is …` | Your broker uses different DST dates. Set `ServerTimeZone` to **EU DST** or **Current measured offset**. Also check that your PC clock is correct. |
| Nothing happens, no label | Algo Trading is off (toolbar button), or the EA is attached to no chart. Check the **Experts** and **Journal** tabs. |
| Old trades missing | Raise `HistoryDaysOnStart`, then click **Re-sync from MT5** in TradeDesk (Settings → Accounts). |

## Build

MetaEditor → open `TradeDeskSync.mq5` → **Compile** (F7). From the command line:

```
"C:\Program Files\MetaTrader 5\MetaEditor64.exe" /compile:"<DataFolder>\MQL5\Experts\TradeDeskSync.mq5" /log
```
