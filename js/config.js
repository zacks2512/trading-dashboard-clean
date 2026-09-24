// Column mapping defaults, shared state and chart colours.
var DEFS = {
  name: { l: "Full Name", d: "Full name" },
  symbol: { l: "Symbol", d: "Symbol" },
  type: { l: "Trade Type", d: "trade type" },
  strategy: { l: "Strategy", d: "strategy" },
  entry_date: { l: "Entry Date", d: "Entry Date" },
  exit_date: { l: "Exit Date", d: "Exit Date" },
  expiry: { l: "Expiry Date", d: "Expiry" },
  pnl: { l: "Net P&L", d: "Net P&L" },
  pct: { l: "Net P&L (%)", d: "Net P&L (%)" },
  days: { l: "Days in Trade", d: "Days in Trade" },
  mistakes: { l: "Mistakes", d: "Mistakes" },
  emotion_entry: { l: "Entry Emotion", d: "Emotion (Entry)" },
  emotion_exit: { l: "Exit Emotion", d: "Emotion (Exite)" },
};
var COL = {};
Object.entries(DEFS).forEach(function (e) {
  COL[e[0]] = e[1].d;
});
var trades = [],
  CX = {},
  sortKey = "",
  sortDir = 1,
  perfPeriod = "monthly",
  activeTradeIdx = null,
  _currentRows = [],
  dteFilter = null,
  periodFilter = null;
var G = "#2ecc71",
  R = "#e74c3c",
  B = "#3498db",
  AM = "#f39c12",
  GC = "rgba(255,255,255,.04)",
  TC = "#5a6070";
