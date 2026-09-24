// Trade Log tab: search, sort, filters and trade detail panel.
var BAD = ["FOMO", "Greed", "Stress", "Overconfidence", "Impulsive"],
  GOOD = ["Confidence", "Patience", "Discipline"];
function etag(e) {
  var c = BAD.indexOf(e) >= 0 ? "bd" : GOOD.indexOf(e) >= 0 ? "gd" : "nu";
  return '<span class="et ' + c + '">' + e + "</span>";
}
function stars(n) {
  var s = parseInt(n) || 0;
  if (!s) return '<span style="color:var(--text3)">—</span>';
  var o = "";
  for (var i = 0; i < 5; i++)
    o += '<span style="color:' + (i < s ? AM : "var(--border2)") + '">★</span>';
  return o;
}
function showDetail(t) {
  var p = t.pnl >= 0,
    pC = p ? G : R,
    pS = p ? "+" : "";
  var eE = semo(t.entry),
    xE = semo(t.exit);
  function df(l, v) {
    return (
      '<div class="dfield"><div class="dflabel">' +
      l +
      '</div><div class="dfval">' +
      v +
      "</div></div>"
    );
  }
  document.getElementById("detail-panel").innerHTML =
    '<div class="detail-panel"><div class="detail-header"><div><div class="detail-title">' +
    t.name +
    '</div><div style="font-size:11px;color:var(--text3);margin-top:3px;">' +
    t.strategy +
    " · " +
    t.type +
    '</div></div><div style="display:flex;align-items:center;gap:12px;"><div class="detail-pnl" style="color:' +
    pC +
    ';">' +
    pS +
    "$" +
    t.pnl +
    '</div><button class="detail-close" onclick="closeDetail()">✕</button></div></div><div class="detail-body"><div class="dg6">' +
    df("Symbol", t.symbol) +
    df("Entry Date", fmtDate(t.entryDate)) +
    df("Exit Date", fmtDate(t.exitDate)) +
    df("Expiry", t.expiry || "—") +
    df("Days Held", t.days + "d") +
    df("Contracts", t.contracts || "—") +
    '</div><div class="dg4">' +
    df("Entry Price", t.entryPrice || "—") +
    df("Exit Price", t.exitPrice || "—") +
    df("Gross P&L", t.grossPnl || "—") +
    df("Fees", t.fees || "—") +
    '</div><div class="dg3">' +
    df("Mistake", t.mistakes) +
    df("Strike", t.strike || "—") +
    '<div class="dfield"><div class="dflabel">Confidence</div><div class="dfval">' +
    stars(t.confidence) +
    '</div></div></div><div class="emo-row"><div class="emo-group"><div class="emo-label">Entry Emotions</div><div class="emo-tags">' +
    (eE.length
      ? eE.map(etag).join("")
      : '<span style="color:var(--text3);font-size:11px;">—</span>') +
    '</div></div><div class="emo-group"><div class="emo-label">Exit Emotions</div><div class="emo-tags">' +
    (xE.length
      ? xE.map(etag).join("")
      : '<span style="color:var(--text3);font-size:11px;">—</span>') +
    '</div></div></div><div class="detail-notes"><div class="detail-notes-label">📝 Trade Notes</div><div class="detail-notes-text">' +
    (t.comments && t.comments.trim()
      ? t.comments
      : '<span style="color:var(--text3);font-style:italic;">No notes for this trade.</span>') +
    "</div></div></div></div>";
  document
    .getElementById("detail-panel")
    .scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function closeDetail() {
  activeTradeIdx = null;
  document.getElementById("detail-panel").innerHTML = "";
  document.querySelectorAll(".trow").forEach(function (r) {
    r.classList.remove("active-row");
  });
}
function onRowClick(i) {
  var t = _currentRows[i];
  if (activeTradeIdx === i) {
    closeDetail();
    return;
  }
  activeTradeIdx = i;
  document.querySelectorAll(".trow").forEach(function (r) {
    r.classList.remove("active-row");
  });
  var el = document.getElementById("trow-" + i);
  if (el) el.classList.add("active-row");
  showDetail(t);
}
function renderLog() {
  var syms = [
      ...new Set(
        trades.map(function (t) {
          return t.symbol;
        }),
      ),
    ].sort(),
    strats = [
      ...new Set(
        trades.map(function (t) {
          return t.strategy;
        }),
      ),
    ].sort(),
    emos = [
      ...new Set(
        trades.reduce(function (a, t) {
          return a.concat(semo(t.entry));
        }, []),
      ),
    ].sort();
  var ss = document.getElementById("srch-sym"),
    cs = ss.value;
  ss.innerHTML =
    '<option value="">All Symbols</option>' +
    syms
      .map(function (s) {
        return "<option>" + s + "</option>";
      })
      .join("");
  if (cs) ss.value = cs;
  var st = document.getElementById("srch-strat"),
    cst = st.value;
  st.innerHTML =
    '<option value="">All Strategies</option>' +
    strats
      .map(function (s) {
        return "<option>" + s + "</option>";
      })
      .join("");
  if (cst) st.value = cst;
  var se = document.getElementById("srch-emo"),
    ce = se.value;
  se.innerHTML =
    '<option value="">All Emotions</option>' +
    emos
      .map(function (e) {
        return "<option>" + e + "</option>";
      })
      .join("");
  if (ce) se.value = ce;
  renderLogT();
}
function clearDteFilter() {
  dteFilter = null;
  document.getElementById("dte-chip").style.display = "none";
  renderLogT();
}
function clearPeriodFilter() {
  periodFilter = null;
  document.getElementById("period-chip").style.display = "none";
  renderLogT();
}
function clearSearch() {
  dteFilter = null;
  periodFilter = null;
  document.getElementById("dte-chip").style.display = "none";
  document.getElementById("period-chip").style.display = "none";
  document.getElementById("srch-text").value = "";
  document.getElementById("srch-sym").value = "";
  document.getElementById("srch-strat").value = "";
  document.getElementById("srch-result").value = "";
  document.getElementById("srch-emo").value = "";
  sortKey = "";
  sortDir = 1;
  closeDetail();
  renderLogT();
}
function sortLog(key) {
  if (sortKey === key) sortDir *= -1;
  else {
    sortKey = key;
    sortDir = 1;
  }
  renderLogT();
}
function renderLogT() {
  var txt = (document.getElementById("srch-text").value || "").toLowerCase(),
    sym = document.getElementById("srch-sym").value,
    strat = document.getElementById("srch-strat").value,
    res = document.getElementById("srch-result").value,
    emo = document.getElementById("srch-emo").value;
  var rows = trades.filter(function (t) {
    if (
      txt &&
      !(
        t.name.toLowerCase().includes(txt) ||
        t.symbol.toLowerCase().includes(txt) ||
        t.strategy.toLowerCase().includes(txt) ||
        t.mistakes.toLowerCase().includes(txt)
      )
    )
      return false;
    if (sym && t.symbol !== sym) return false;
    if (strat && t.strategy !== strat) return false;
    if (res === "win" && t.pnl <= 0) return false;
    if (res === "loss" && t.pnl > 0) return false;
    if (emo && !semo(t.entry).includes(emo)) return false;
    if (dteFilter) {
      var exp = parseDate(t.expiry);
      if (!exp || !t.entryDate) return false;
      var dte = Math.round((exp - t.entryDate) / 86400000);
      if (dte < dteFilter.min || dte > dteFilter.max) return false;
    }
    if (periodFilter) {
      var pd = t.exitDate || t.entryDate;
      if (!pd) return false;
      var pfn = periodFilter.type === "monthly" ? fmtMonth : fmtWeek;
      if (pfn(pd) !== periodFilter.key) return false;
    }
    return true;
  });
  var chip = document.getElementById("dte-chip");
  if (dteFilter) {
    chip.style.display = "block";
    chip.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:6px;background:var(--bdim);border:1px solid var(--blue);border-radius:12px;padding:3px 10px;font-size:11px;color:var(--blue);font-family:var(--m);">DTE: ' +
      dteFilter.label +
      ' <span onclick="clearDteFilter()" style="cursor:pointer;opacity:.7;margin-left:2px;">✕</span></span>';
  } else {
    chip.style.display = "none";
  }
  var pchip = document.getElementById("period-chip");
  if (periodFilter) {
    pchip.style.display = "block";
    pchip.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:6px;background:var(--bdim);border:1px solid var(--blue);border-radius:12px;padding:3px 10px;font-size:11px;color:var(--blue);font-family:var(--m);">Period: ' +
      periodFilter.label +
      ' <span onclick="clearPeriodFilter()" style="cursor:pointer;opacity:.7;margin-left:2px;">✕</span></span>';
  } else {
    pchip.style.display = "none";
  }
  if (sortKey) {
    rows = rows.slice().sort(function (a, b) {
      var av = a[sortKey] || 0,
        bv = b[sortKey] || 0;
      if (typeof av === "string") return av.localeCompare(bv) * sortDir;
      return (av - bv) * sortDir;
    });
  }
  _currentRows = rows;
  var sum = rows.reduce(function (a, t) {
      return a + t.pnl;
    }, 0),
    sPos = sum >= 0,
    wC = rows.filter(function (t) {
      return t.pnl > 0;
    }).length,
    lC = rows.filter(function (t) {
      return t.pnl <= 0;
    }).length;
  document.getElementById("srch-count").textContent =
    "Showing " + rows.length + " of " + trades.length + " trades";
  var foot = document.getElementById("tfoot");
  if (rows.length) {
    foot.style.display = "grid";
    foot.innerHTML =
      '<div style="color:var(--text3);font-size:11px;font-family:var(--f);font-weight:400;">' +
      rows.length +
      " trades · " +
      wC +
      "W / " +
      lC +
      'L</div><div></div><div></div><div></div><div></div><div style="color:' +
      (sPos ? G : R) +
      ';">' +
      (sPos ? "+" : "") +
      "$" +
      Math.round(sum) +
      "</div><div></div>";
  } else {
    foot.style.display = "none";
  }
  document.getElementById("tlog").innerHTML = rows
    .map(function (t, i) {
      var p = t.pnl >= 0,
        hasNote = t.comments && t.comments.trim(),
        te =
          t.timeEff !== null
            ? '<div class="ts">⏱ ' + t.timeEff + "% time used</div>"
            : "",
        ni = hasNote
          ? '<span style="font-size:9px;color:var(--blue);margin-left:4px;" title="Has notes">💬</span>'
          : "";
      return (
        '<div class="trow" onclick="onRowClick(' +
        i +
        ')" id="trow-' +
        i +
        '"><div><div class="tn">' +
        t.name +
        ni +
        '</div><div class="ts">' +
        t.strategy +
        " · " +
        t.mistakes +
        "</div>" +
        te +
        '</div><div style="color:var(--text2);font-size:11px">' +
        t.strategy +
        "</div><div>" +
        semo(t.entry).map(etag).join("") +
        "</div><div>" +
        semo(t.exit).map(etag).join("") +
        '</div><div style="color:var(--text3)">' +
        t.days +
        'd</div><div class="' +
        (p ? "pp" : "np") +
        '">' +
        (p ? "+" : "") +
        "$" +
        t.pnl +
        '</div><div class="' +
        (p ? "pp" : "np") +
        '">' +
        t.pct.toFixed(1) +
        "%</div></div>"
      );
    })
    .join("");
}
