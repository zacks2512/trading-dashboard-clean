// Shared analytics for the Coach, Risk (R) and Pre-Trade Check tabs:
// trade style, R-multiples, segment statistics, leak detection and rules.

// Segments with fewer trades than this are shown but never called an edge or a leak.
var MIN_N = 3;

// Sold options ("Sell Call", "Sell Put") are premium trades; everything else is directional buying.
function isPremium(t) {
  return /^sell\b/i.test(t.type);
}
function styleOf(t) {
  return isPremium(t) ? "Premium Selling" : "Directional Buying";
}

// For debit trades the R column is the premium paid (= max loss), so P&L / R is a true
// R-multiple. For premium trades R is the credit received (= max profit), so the same
// ratio is the share of max profit captured.
function rMult(t) {
  return t.risk > 0 ? t.pnl / t.risk : null;
}

function dteAtEntry(t) {
  if (!t.entryDate || !t.expiry) return null;
  var exp = parseDate(t.expiry);
  if (!exp) return null;
  return Math.round((exp - t.entryDate) / 86400000);
}
var DTE_BUCKETS = [
  { l: "0–7d", min: 0, max: 7 },
  { l: "8–21d", min: 8, max: 21 },
  { l: "22–45d", min: 22, max: 45 },
  { l: "46–90d", min: 46, max: 90 },
  { l: "90+d", min: 91, max: Infinity },
];
function dteBucket(d) {
  if (d === null || isNaN(d)) return null;
  for (var i = 0; i < DTE_BUCKETS.length; i++)
    if (d >= DTE_BUCKETS[i].min && d <= DTE_BUCKETS[i].max)
      return DTE_BUCKETS[i].l;
  return null;
}

function sum(a) {
  return a.reduce(function (s, v) {
    return s + v;
  }, 0);
}

function stats(list) {
  var pnls = list.map(function (t) {
    return t.pnl;
  });
  var wins = pnls.filter(function (v) {
      return v > 0;
    }),
    losses = pnls.filter(function (v) {
      return v <= 0;
    });
  var rs = list
    .filter(function (t) {
      return !isPremium(t);
    })
    .map(rMult)
    .filter(function (r) {
      return r !== null;
    });
  var total = sum(pnls);
  return {
    n: list.length,
    total: total,
    wr: list.length ? wins.length / list.length : 0,
    exp: list.length ? total / list.length : 0,
    avgWin: avg(wins),
    avgLoss: avg(losses),
    avgR: rs.length ? avg(rs) : null,
  };
}

// Edge = enough trades, positive expectancy and at least a coin-flip win rate.
// Leak = enough trades and losing money overall.
function verdict(s) {
  if (s.n < MIN_N) return "few";
  if (s.total < 0) return "leak";
  if (s.exp > 0 && s.wr >= 0.5) return "edge";
  return "neutral";
}
var VERDICT_LABEL = {
  edge: "Edge",
  leak: "Leak",
  neutral: "Neutral",
  few: "Too few trades",
};

function splitList(s) {
  return String(s || "")
    .split(",")
    .map(function (x) {
      return x.trim();
    })
    .filter(function (x) {
      return x && x !== "—";
    });
}

// Each dimension maps a trade to one or more segment keys.
var DIMS = [
  {
    id: "type",
    l: "Trade Type",
    keys: function (t) {
      return [t.type];
    },
  },
  {
    id: "strategy",
    l: "Strategy",
    keys: function (t) {
      return [t.strategy];
    },
  },
  {
    id: "style",
    l: "Style",
    keys: function (t) {
      return [styleOf(t)];
    },
  },
  {
    id: "emotion",
    l: "Entry Emotion",
    keys: function (t) {
      return semo(t.entry);
    },
  },
  {
    id: "mistake",
    l: "Mistake",
    keys: function (t) {
      return splitList(t.mistakes);
    },
  },
  {
    id: "confidence",
    l: "Confidence",
    keys: function (t) {
      return t.confidence ? ["Confidence " + t.confidence] : [];
    },
  },
  {
    id: "dte",
    l: "DTE at Entry",
    keys: function (t) {
      var b = dteBucket(dteAtEntry(t));
      return b ? [b] : [];
    },
  },
  {
    id: "symbol",
    l: "Symbol",
    keys: function (t) {
      return t.symbol ? [t.symbol] : [];
    },
  },
];
function dimById(id) {
  return DIMS.filter(function (d) {
    return d.id === id;
  })[0];
}
function tradesIn(dimId, key, list) {
  var d = dimById(dimId);
  return (list || trades).filter(function (t) {
    return d.keys(t).indexOf(key) >= 0;
  });
}
function segments(dimId, list) {
  var d = dimById(dimId),
    m = {};
  (list || trades).forEach(function (t) {
    d.keys(t).forEach(function (k) {
      (m[k] = m[k] || []).push(t);
    });
  });
  return Object.keys(m)
    .map(function (k) {
      var s = stats(m[k]);
      s.key = k;
      s.dim = dimId;
      s.verdict = verdict(s);
      return s;
    })
    .sort(function (a, b) {
      return a.total - b.total;
    });
}

var MISTAKE_RULES = {
  "Early Entry (No Confirmation)":
    "Enter only after the setup is confirmed — no anticipating.",
  "Impulse Entry (FOMO)":
    "No impulse entries: write the plan in Pre-Trade Check first.",
  "No Valid Setup": "Trade only setups that are in your playbook.",
  "Oversized Position": "Never risk more than your max loss per trade.",
  "Misread Trend": "Confirm the trend on a higher timeframe before entry.",
  "External Event (News)": "Check news and the earnings date before entry.",
  "Execution Error (Fat Finger)":
    "Double-check strike, expiry and size before sending.",
  "Cut Winner Too Early": "Let winners run to the planned target.",
};

// Rules derived from the data. Each rule points at the segment that triggered it,
// so the Pre-Trade Check can flag a planned trade that matches.
function buildRules() {
  var rules = [];
  ["type", "strategy", "emotion"].forEach(function (dim) {
    segments(dim).forEach(function (s) {
      if (s.verdict !== "leak") return;
      rules.push({
        dim: dim,
        key: s.key,
        n: s.n,
        sev: "neg",
        // Emotion rules overlap with the trade-type and mistake rules, so the what-if starts with them off.
        on: dim !== "emotion",
        text:
          dim === "emotion"
            ? "Don't open trades while feeling “" + s.key + "”"
            : "Avoid or cut size on " +
              dimById(dim).l.toLowerCase() +
              " “" +
              s.key +
              "”",
        why:
          plural(s.n, "trade") +
          ", " +
          fmtUsd(s.total) +
          " total, " +
          Math.round(s.wr * 100) +
          "% win rate",
        cost: s.total,
      });
    });
  });
  segments("mistake").forEach(function (s) {
    if (s.key === "No Mistake" || s.total >= 0) return;
    rules.push({
      dim: "mistake",
      key: s.key,
      n: s.n,
      sev: "neg",
      on: s.n >= MIN_N,
      text: MISTAKE_RULES[s.key] || "Stop repeating: " + s.key,
      why: s.key + " cost " + fmtUsd(s.total) + " in " + plural(s.n, "trade"),
      cost: s.total,
    });
  });
  var fl = fullLossStats();
  if (fl.losers >= MIN_N && fl.fullRate >= 0.5) {
    var sim = stopSim(0.5);
    rules.push({
      dim: "stop",
      key: "debit",
      n: fl.losers,
      on: true,
      sev: "neu",
      text: "Exit debit trades at −50% of the premium paid",
      why:
        Math.round(fl.fullRate * 100) +
        "% of losing debit trades lost (almost) the full premium. A −50% stop would have saved up to " +
        fmtUsd(sim.saved),
      cost: -sim.saved,
    });
  }
  return rules.sort(function (a, b) {
    return a.cost - b.cost;
  });
}

// Losing debit trades that lost at least 90% of the premium paid.
function fullLossStats() {
  var losers = trades.filter(function (t) {
    return !isPremium(t) && t.pnl < 0 && t.risk > 0;
  });
  var full = losers.filter(function (t) {
    return rMult(t) <= -0.9;
  });
  return {
    losers: losers.length,
    full: full.length,
    fullRate: losers.length ? full.length / losers.length : 0,
  };
}
// Hindsight estimate: cap every losing debit trade at -stop × premium paid.
// Winners that dipped past the stop before recovering can't be seen in the data,
// so the saving is an upper bound.
function stopSim(stop) {
  var saved = 0,
    hit = 0;
  trades.forEach(function (t) {
    if (isPremium(t) || t.risk <= 0) return;
    var cap = -stop * t.risk;
    if (t.pnl < cap) {
      saved += cap - t.pnl;
      hit++;
    }
  });
  return { saved: saved, hit: hit };
}

function plural(n, w) {
  return n + " " + w + (n === 1 ? "" : "s");
}
function fmtUsd(v) {
  var r = Math.round(v);
  return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US");
}
function fmtSignedUsd(v) {
  return (Math.round(v) > 0 ? "+" : "") + fmtUsd(v);
}
function fmtR(v) {
  if (v === null || isNaN(v)) return "—";
  return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + "R";
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}
