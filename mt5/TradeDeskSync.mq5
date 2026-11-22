//+------------------------------------------------------------------+
//| TradeDeskSync.mq5                                                |
//| Read-only trade sync from MetaTrader 5 to TradeDesk.             |
//|                                                                  |
//| This EA only READS history and account info and sends it over    |
//| HTTPS. It contains no trading functions: it never opens, changes |
//| or closes anything. No passwords are read or sent; the only      |
//| credential that leaves the terminal is your TradeDesk sync key.  |
//+------------------------------------------------------------------+
#property copyright "TradeDesk"
#property link      "https://tradezdesk.vercel.app"
#property version   "1.00"
#property description "Sends closed deals, balance and equity to TradeDesk. Read-only: never trades."

#define EA_VERSION "1.0.0"

enum ENUM_SERVER_TZ
  {
   TZ_US_DST = 0,        // GMT+2 winter / GMT+3 summer, US DST dates (XM, most brokers)
   TZ_EU_DST = 1,        // GMT+2 winter / GMT+3 summer, EU DST dates
   TZ_MEASURED = 2,      // Current measured server offset for all deals
   TZ_FIXED = 3          // Fixed offset (FixedOffsetHours)
  };

input string         ApiUrl             = "https://tradezdesk.vercel.app"; // TradeDesk URL (https)
input string         SyncKey            = "";                              // Sync key from TradeDesk (tdk_...)
input int            HistoryDaysOnStart = 90;                              // Days of history to backfill
input int            BatchSize          = 200;                             // Deals per request (max 500)
input int            HeartbeatSeconds   = 30;                              // Heartbeat interval (seconds)
input bool           EnableLog          = true;                            // Verbose Experts log
input ENUM_SERVER_TZ ServerTimeZone     = TZ_US_DST;                       // Broker server time zone rule
input int            FixedOffsetHours   = 2;                               // Used only with "Fixed offset"

//--- state
string   g_queue[];          // pending deal JSON objects
long     g_queueTickets[];   // their tickets, for de-duplication
long     g_lastQueued = 0;   // highest deal ticket already queued
datetime g_lastSyncLocal = 0;
datetime g_nextSendAt = 0;
datetime g_nextHeartbeatAt = 0;
datetime g_nextScanAt = 0;
int      g_backoff = 0;
bool     g_initPending = true;
bool     g_keyRejected = false;
bool     g_scanRequested = false;
string   g_lastError = "";
string   g_endpointSync, g_endpointHeartbeat;
string   g_gvName, g_queueFile;
const string LABEL = "TradeDeskSync_status";

//+------------------------------------------------------------------+
//| Logging                                                          |
//+------------------------------------------------------------------+
void Log(const string msg)
  {
   if(EnableLog)
      Print("TradeDesk: ", msg);
  }

//+------------------------------------------------------------------+
//| Server time -> UTC                                               |
//+------------------------------------------------------------------+
datetime MakeDate(const int year, const int mon, const int day)
  {
   MqlDateTime s;
   ZeroMemory(s);
   s.year = year;
   s.mon = mon;
   s.day = day;
   return StructToTime(s);
  }

datetime NthSunday(const int year, const int mon, const int n)
  {
   datetime first = MakeDate(year, mon, 1);
   MqlDateTime t;
   TimeToStruct(first, t);
   int offset = (7 - t.day_of_week) % 7;
   return first + (offset + (n - 1) * 7) * 86400;
  }

datetime LastSunday(const int year, const int mon)
  {
   datetime next = (mon == 12) ? MakeDate(year + 1, 1, 1) : MakeDate(year, mon + 1, 1);
   datetime last = next - 86400;
   MqlDateTime t;
   TimeToStruct(last, t);
   return last - t.day_of_week * 86400;
  }

bool IsUsDst(const datetime utc)
  {
   MqlDateTime t;
   TimeToStruct(utc, t);
   datetime start = NthSunday(t.year, 3, 2) + 7 * 3600;  // 02:00 EST
   datetime end   = NthSunday(t.year, 11, 1) + 6 * 3600; // 02:00 EDT
   return utc >= start && utc < end;
  }

bool IsEuDst(const datetime utc)
  {
   MqlDateTime t;
   TimeToStruct(utc, t);
   datetime start = LastSunday(t.year, 3) + 3600;
   datetime end   = LastSunday(t.year, 10) + 3600;
   return utc >= start && utc < end;
  }

int MeasuredOffsetSeconds()
  {
   long diff = (long)(TimeTradeServer() - TimeGMT());
   return (int)(MathRound(diff / 1800.0) * 1800); // nearest 30 minutes
  }

int RuleOffsetHours(const datetime utc)
  {
   if(ServerTimeZone == TZ_FIXED)
      return FixedOffsetHours;
   bool dst = (ServerTimeZone == TZ_EU_DST) ? IsEuDst(utc) : IsUsDst(utc);
   return dst ? 3 : 2;
  }

// Broker server milliseconds -> UTC milliseconds.
long ServerMscToUtcMsc(const long serverMsc)
  {
   if(ServerTimeZone == TZ_MEASURED)
      return serverMsc - (long)MeasuredOffsetSeconds() * 1000;
   if(ServerTimeZone == TZ_FIXED)
      return serverMsc - (long)FixedOffsetHours * 3600000;
   long summer = serverMsc - 3 * 3600000;
   if(RuleOffsetHours((datetime)(summer / 1000)) == 3)
      return summer;
   return serverMsc - 2 * 3600000;
  }

void CheckTimeZoneRule()
  {
   if(ServerTimeZone == TZ_MEASURED)
      return;
   int measured = MeasuredOffsetSeconds();
   int rule = RuleOffsetHours(TimeGMT()) * 3600;
   if(measured != rule)
      Print("TradeDesk: WARNING server offset is ", measured / 3600.0, "h but the selected rule gives ",
            rule / 3600.0, "h. Check the ServerTimeZone input (or your PC clock).");
   else
      Log(StringFormat("server time is GMT%+d, matches the selected time zone rule", measured / 3600));
  }

//+------------------------------------------------------------------+
//| JSON helpers                                                     |
//+------------------------------------------------------------------+
string JsonEscape(const string s)
  {
   string out = "";
   int n = StringLen(s);
   for(int i = 0; i < n; i++)
     {
      ushort c = StringGetCharacter(s, i);
      if(c == '"')
         out += "\\\"";
      else
         if(c == '\\')
            out += "\\\\";
         else
            if(c < 0x20)
               out += StringFormat("\\u%04x", c);
            else
               out += ShortToString(c);
     }
   return out;
  }

string Num(const double v, const int digits = 8)
  {
   if(!MathIsValidNumber(v))
      return "0";
   return DoubleToString(v, digits);
  }

string AccountJson()
  {
   return StringFormat("{\"login\":%I64d,\"server\":\"%s\",\"currency\":\"%s\",\"leverage\":%I64d,\"balance\":%s,\"equity\":%s,\"company\":\"%s\"}",
                       AccountInfoInteger(ACCOUNT_LOGIN),
                       JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
                       JsonEscape(AccountInfoString(ACCOUNT_CURRENCY)),
                       AccountInfoInteger(ACCOUNT_LEVERAGE),
                       Num(AccountInfoDouble(ACCOUNT_BALANCE), 2),
                       Num(AccountInfoDouble(ACCOUNT_EQUITY), 2),
                       JsonEscape(AccountInfoString(ACCOUNT_COMPANY)));
  }

string DealJson(const ulong ticket)
  {
   long   serverMsc = HistoryDealGetInteger(ticket, DEAL_TIME_MSC);
   long   utcMsc    = ServerMscToUtcMsc(serverMsc);
   long   order     = HistoryDealGetInteger(ticket, DEAL_ORDER);
   long   entry     = HistoryDealGetInteger(ticket, DEAL_ENTRY);
   double sl        = HistoryDealGetDouble(ticket, DEAL_SL);
   double tp        = HistoryDealGetDouble(ticket, DEAL_TP);
   // Initial stop: fall back to the opening order's SL/TP when the deal has none.
   if(entry == DEAL_ENTRY_IN && (sl == 0 || tp == 0) && order > 0 && HistoryOrderSelect((ulong)order))
     {
      if(sl == 0)
         sl = HistoryOrderGetDouble((ulong)order, ORDER_SL);
      if(tp == 0)
         tp = HistoryOrderGetDouble((ulong)order, ORDER_TP);
     }
   return StringFormat("{\"ticket\":%I64d,\"order\":%I64d,\"position_id\":%I64d,\"time\":%I64d,\"time_msc\":%I64d,\"type\":%I64d,\"entry\":%I64d,"
                       "\"symbol\":\"%s\",\"volume\":%s,\"price\":%s,\"profit\":%s,\"commission\":%s,\"swap\":%s,\"fee\":%s,"
                       "\"sl\":%s,\"tp\":%s,\"magic\":%I64d,\"comment\":\"%s\",\"reason\":%I64d}",
                       (long)ticket,
                       order,
                       HistoryDealGetInteger(ticket, DEAL_POSITION_ID),
                       utcMsc / 1000,
                       utcMsc,
                       HistoryDealGetInteger(ticket, DEAL_TYPE),
                       entry,
                       JsonEscape(HistoryDealGetString(ticket, DEAL_SYMBOL)),
                       Num(HistoryDealGetDouble(ticket, DEAL_VOLUME), 4),
                       Num(HistoryDealGetDouble(ticket, DEAL_PRICE), 8),
                       Num(HistoryDealGetDouble(ticket, DEAL_PROFIT), 2),
                       Num(HistoryDealGetDouble(ticket, DEAL_COMMISSION), 2),
                       Num(HistoryDealGetDouble(ticket, DEAL_SWAP), 2),
                       Num(HistoryDealGetDouble(ticket, DEAL_FEE), 2),
                       Num(sl, 8),
                       Num(tp, 8),
                       HistoryDealGetInteger(ticket, DEAL_MAGIC),
                       JsonEscape(HistoryDealGetString(ticket, DEAL_COMMENT)),
                       HistoryDealGetInteger(ticket, DEAL_REASON));
  }

//+------------------------------------------------------------------+
//| Disk-backed queue                                                |
//+------------------------------------------------------------------+
void SaveQueue()
  {
   int h = FileOpen(g_queueFile, FILE_WRITE | FILE_TXT | FILE_UNICODE);
   if(h == INVALID_HANDLE)
     {
      Print("TradeDesk: cannot write queue file, error ", GetLastError());
      return;
     }
   for(int i = 0; i < ArraySize(g_queue); i++)
      FileWriteString(h, IntegerToString(g_queueTickets[i]) + "\t" + g_queue[i] + "\r\n");
   FileClose(h);
  }

void LoadQueue()
  {
   ArrayResize(g_queue, 0);
   ArrayResize(g_queueTickets, 0);
   if(!FileIsExist(g_queueFile))
      return;
   int h = FileOpen(g_queueFile, FILE_READ | FILE_TXT | FILE_UNICODE);
   if(h == INVALID_HANDLE)
      return;
   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      int tab = StringFind(line, "\t");
      if(tab <= 0)
         continue;
      long t = StringToInteger(StringSubstr(line, 0, tab));
      Enqueue(t, StringSubstr(line, tab + 1), false);
     }
   FileClose(h);
   if(ArraySize(g_queue) > 0)
      Log(StringFormat("restored %d queued deal(s) from disk", ArraySize(g_queue)));
  }

bool InQueue(const long ticket)
  {
   for(int i = 0; i < ArraySize(g_queueTickets); i++)
      if(g_queueTickets[i] == ticket)
         return true;
   return false;
  }

void Enqueue(const long ticket, const string json, const bool persist)
  {
   if(InQueue(ticket))
      return;
   int n = ArraySize(g_queue);
   ArrayResize(g_queue, n + 1, 256);
   ArrayResize(g_queueTickets, n + 1, 256);
   g_queue[n] = json;
   g_queueTickets[n] = ticket;
   if(persist)
      SaveQueue();
  }

void DropFirst(const int count)
  {
   int n = ArraySize(g_queue);
   int k = MathMin(count, n);
   for(int i = k; i < n; i++)
     {
      g_queue[i - k] = g_queue[i];
      g_queueTickets[i - k] = g_queueTickets[i];
     }
   ArrayResize(g_queue, n - k);
   ArrayResize(g_queueTickets, n - k);
   SaveQueue();
  }

//+------------------------------------------------------------------+
//| History scan                                                     |
//+------------------------------------------------------------------+
void SaveCheckpoint()
  {
   GlobalVariableSet(g_gvName, (double)g_lastQueued);
  }

void ScanHistory(const bool full)
  {
   datetime to = TimeCurrent() + 86400;
   datetime from = full ? TimeCurrent() - (datetime)HistoryDaysOnStart * 86400 : TimeCurrent() - 14 * 86400;
   if(!HistorySelect(from, to))
     {
      Log("HistorySelect failed, will retry");
      return;
     }
   int total = HistoryDealsTotal();
   long maxTicket = g_lastQueued;
   int added = 0;
   for(int i = 0; i < total; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0 || (long)ticket <= g_lastQueued)
         continue;
      Enqueue((long)ticket, DealJson(ticket), false);
      added++;
      if((long)ticket > maxTicket)
         maxTicket = (long)ticket;
     }
   if(added > 0)
     {
      SaveQueue();                // persist the deals first...
      g_lastQueued = maxTicket;   // ...then move the checkpoint, so nothing is lost on a crash
      SaveCheckpoint();
      Log(StringFormat("queued %d new deal(s)%s", added, full ? " from history backfill" : ""));
     }
  }

//+------------------------------------------------------------------+
//| HTTP                                                             |
//+------------------------------------------------------------------+
int Post(const string url, const string body, string &response)
  {
   char data[];
   char result[];
   string resultHeaders;
   int len = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0)
      ArrayResize(data, len - 1); // drop the terminating zero
   string headers = "Content-Type: application/json\r\nX-Sync-Key: " + SyncKey + "\r\nUser-Agent: TradeDeskSync/" + EA_VERSION + "\r\n";
   ResetLastError();
   int code = WebRequest("POST", url, headers, 7000, data, result, resultHeaders);
   response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   if(code == -1)
     {
      int err = GetLastError();
      if(err == 4014)
         g_lastError = "add " + ApiUrl + " to Tools > Options > Expert Advisors > Allow WebRequest";
      else
         g_lastError = "network error " + IntegerToString(err);
     }
   return code;
  }

void ScheduleRetry()
  {
   g_backoff = (g_backoff == 0) ? 5 : MathMin(g_backoff * 2, 300);
   g_nextSendAt = TimeLocal() + g_backoff;
  }

void HandleAuthFailure(const int code, const string response)
  {
   g_keyRejected = true;
   g_lastError = (code == 409) ? "this key belongs to another MT5 account" : "sync key rejected - create a new key in TradeDesk";
   Print("TradeDesk: ", g_lastError, " (HTTP ", code, ") ", response);
  }

void SendHeartbeat()
  {
   string body = StringFormat("{\"account\":%s,\"ea_version\":\"%s\",\"queue_size\":%d,\"last_deal_ticket\":%I64d}",
                              AccountJson(), EA_VERSION, ArraySize(g_queue), g_lastQueued);
   string response;
   int code = Post(g_endpointHeartbeat, body, response);
   if(code == 200)
     {
      g_keyRejected = false;
      g_lastError = "";
      if(StringFind(response, "\"resync\":true") >= 0)
        {
         Print("TradeDesk: re-sync requested from TradeDesk, re-sending ", HistoryDaysOnStart, " days of history");
         g_lastQueued = 0;
         SaveCheckpoint();
         ScanHistory(true);
        }
     }
   else
      if(code == 401 || code == 409)
         HandleAuthFailure(code, response);
      else
         if(code != -1)
            g_lastError = "heartbeat HTTP " + IntegerToString(code);
   g_nextHeartbeatAt = TimeLocal() + MathMax(10, HeartbeatSeconds);
  }

void SendBatch()
  {
   int n = MathMin(ArraySize(g_queue), MathMax(1, MathMin(BatchSize, 500)));
   if(n == 0)
      return;
   string deals = "";
   for(int i = 0; i < n; i++)
      deals += (i > 0 ? "," : "") + g_queue[i];
   string body = StringFormat("{\"account\":%s,\"ea_version\":\"%s\",\"deals\":[%s]}", AccountJson(), EA_VERSION, deals);
   string response;
   int code = Post(g_endpointSync, body, response);
   if(code == 200)
     {
      if(StringFind(response, "\"invalid\":0") < 0)
         Print("TradeDesk: some deals were rejected by the server: ", StringSubstr(response, 0, 500));
      DropFirst(n);
      g_backoff = 0;
      g_nextSendAt = 0;
      g_lastSyncLocal = TimeLocal();
      g_lastError = "";
      Log(StringFormat("synced %d deal(s), %d still queued", n, ArraySize(g_queue)));
     }
   else
      if(code == 401 || code == 409)
         HandleAuthFailure(code, response);
      else
         if(code == 400 || code == 413)
           {
            // A malformed batch will never succeed; drop it so the queue keeps moving.
            // Use "Re-sync from MT5" in TradeDesk to send history again after a fix.
            Print("TradeDesk: server rejected a batch (HTTP ", code, "): ", StringSubstr(response, 0, 500));
            DropFirst(n);
           }
         else
           {
            if(code != -1)
               g_lastError = "sync HTTP " + IntegerToString(code);
            ScheduleRetry();
            Log(StringFormat("send failed (%s), retrying in %ds", g_lastError, g_backoff));
           }
  }

//+------------------------------------------------------------------+
//| Status label                                                     |
//+------------------------------------------------------------------+
void UpdateStatus()
  {
   string text;
   color  clr;
   if(g_keyRejected)
     {
      text = "TradeDesk: " + g_lastError;
      clr = clrTomato;
     }
   else
      if(g_lastError != "")
        {
         text = "TradeDesk: offline - " + g_lastError;
         clr = clrOrange;
        }
      else
         if(g_lastSyncLocal > 0)
           {
            text = "TradeDesk: connected, last sync " + TimeToString(g_lastSyncLocal, TIME_MINUTES);
            clr = clrMediumSeaGreen;
           }
         else
           {
            text = "TradeDesk: connected, waiting for deals";
            clr = clrMediumSeaGreen;
           }
   if(ArraySize(g_queue) > 0)
      text += StringFormat(" (%d queued)", ArraySize(g_queue));
   if(ObjectFind(0, LABEL) < 0)
     {
      ObjectCreate(0, LABEL, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, LABEL, OBJPROP_CORNER, CORNER_LEFT_LOWER);
      ObjectSetInteger(0, LABEL, OBJPROP_ANCHOR, ANCHOR_LEFT_LOWER);
      ObjectSetInteger(0, LABEL, OBJPROP_XDISTANCE, 12);
      ObjectSetInteger(0, LABEL, OBJPROP_YDISTANCE, 14);
      ObjectSetInteger(0, LABEL, OBJPROP_FONTSIZE, 9);
      ObjectSetString(0, LABEL, OBJPROP_FONT, "Segoe UI");
      ObjectSetInteger(0, LABEL, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, LABEL, OBJPROP_HIDDEN, true);
     }
   ObjectSetString(0, LABEL, OBJPROP_TEXT, text);
   ObjectSetInteger(0, LABEL, OBJPROP_COLOR, clr);
   ChartRedraw(0);
  }

//+------------------------------------------------------------------+
//| Event handlers                                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   string url = ApiUrl;
   StringTrimLeft(url);
   StringTrimRight(url);
   if(StringFind(url, "https://") != 0)
     {
      Alert("TradeDesk: ApiUrl must start with https://");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(StringLen(SyncKey) != 47 || StringFind(SyncKey, "tdk_") != 0)
     {
      Alert("TradeDesk: paste the sync key from TradeDesk (it starts with tdk_)");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(HistoryDaysOnStart < 1 || HistoryDaysOnStart > 3650 || BatchSize < 1 || HeartbeatSeconds < 10)
     {
      Alert("TradeDesk: check HistoryDaysOnStart (1-3650), BatchSize (>=1) and HeartbeatSeconds (>=10)");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(StringSubstr(url, StringLen(url) - 1) == "/")
      url = StringSubstr(url, 0, StringLen(url) - 1);
   g_endpointSync = url + "/api/mt5/sync";
   g_endpointHeartbeat = url + "/api/mt5/heartbeat";

   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   g_gvName = "TradeDeskSync." + IntegerToString(login) + ".lastDeal";
   g_queueFile = "TradeDeskSync\\queue_" + IntegerToString(login) + ".txt";
   g_lastQueued = GlobalVariableCheck(g_gvName) ? (long)GlobalVariableGet(g_gvName) : 0;
   LoadQueue();
   CheckTimeZoneRule();

   g_initPending = true;
   EventSetTimer(1);
   Log(StringFormat("started v%s for account %I64d on %s (last synced deal %I64d)", EA_VERSION, login,
                    AccountInfoString(ACCOUNT_SERVER), g_lastQueued));
   UpdateStatus();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   SaveQueue();
   ObjectDelete(0, LABEL);
   ChartRedraw(0);
  }

void OnTimer()
  {
   if(g_initPending)
     {
      g_initPending = false;
      SendHeartbeat();
      ScanHistory(g_lastQueued == 0);
      g_nextScanAt = TimeLocal() + 5;
     }
   datetime now = TimeLocal();
   if(g_scanRequested || now >= g_nextScanAt)
     {
      g_scanRequested = false;
      ScanHistory(false);
      g_nextScanAt = now + 5; // fallback in case a trade event was missed
     }
   if(g_keyRejected)
     {
      if(now >= g_nextHeartbeatAt)
         SendHeartbeat(); // retried slowly until a valid key is set
     }
   else
     {
      if(ArraySize(g_queue) > 0 && now >= g_nextSendAt)
         SendBatch();
      if(now >= g_nextHeartbeatAt)
         SendHeartbeat();
     }
   UpdateStatus();
  }

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
      g_scanRequested = true; // handled on the next timer tick, never blocking the event
  }
//+------------------------------------------------------------------+
