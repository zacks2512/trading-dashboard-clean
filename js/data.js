// Data loading: CSV parsing, row mapping, Sheets/file loaders, export.
function parseCSV(txt) {
  var lines = txt.trim().split(/\r?\n/);
  function splitRow(line) {
    var r = [],
      cur = "",
      inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (c === "," && !inQ) {
        r.push(cur.trim());
        cur = "";
      } else cur += c;
    }
    r.push(cur.trim());
    return r;
  }
  var hdr = splitRow(lines[0]).map(function (h) {
    return h.replace(/^"|"$/g, "").trim();
  });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var vals = splitRow(lines[i]);
    if (
      vals.every(function (v) {
        return !v;
      })
    )
      continue;
    var obj = {};
    hdr.forEach(function (h, k) {
      obj[h] = (vals[k] || "").replace(/^"|"$/g, "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

function rtt(row) {
  var name = row["Full name"] || row["Full Name"] || "",
    sym = row["Symbol"] || "";
  if (!name && !sym) return null;
  var pnlVal = pm(row["Net P&L"] || "");
  if (isNaN(pnlVal)) return null;
  var entryD = parseDate(row["Entry Date"] || ""),
    exitD = parseDate(row["Exit Date"] || ""),
    expiryD = parseDate(row["Expiry"] || "");
  var timeEff = null;
  if (entryD && exitD && expiryD) {
    var mxD = (expiryD - entryD) / 864e5,
      usD = (exitD - entryD) / 864e5;
    if (mxD > 0) timeEff = Math.min(Math.round((usD / mxD) * 100), 100);
  }
  return {
    name: name || sym,
    symbol: sym,
    type: row["trade type"] || "—",
    strategy: row["strategy"] || "—",
    pnl: pnlVal,
    pct: pm(row["Net P&L (%)"] || ""),
    days: parseInt(row["Days in Trade"]) || 0,
    mistakes: row["Mistakes"] || "—",
    entry: row["Emotion (Entry)"] || "—",
    exit: row["Emotion (Exite)"] || "—",
    entryDate: entryD,
    exitDate: exitD,
    timeEff: timeEff,
    comments: row["comments"] || "",
    confidence: row["confidence level (1-5)"] || "",
    strike: row["Strike"] || "",
    entryPrice: row["Entry Price"] || "",
    exitPrice: row["Exit Price"] || "",
    grossPnl: row["Gross P&L"] || "",
    fees: row["Fees"] || "",
    contracts: row["Contracts"] || "",
    expiry: row["Expiry"] || "",
  };
}

function showStatus(msg, isErr) {
  var el = document.getElementById("loadStatus");
  el.textContent = msg;
  el.style.color = isErr ? R : G;
  el.style.display = msg ? "inline" : "none";
}
function ingest(rows, src) {
  var parsed = rows.map(rtt).filter(Boolean);
  if (!parsed.length) {
    showStatus("No trades found", true);
    return;
  }
  trades = parsed;
  document.getElementById("badge").textContent =
    "— " + src + " · " + trades.length + " trades";
  showStatus("");
  renderAll();
}
function loadSheets() {
  var url = document.getElementById("surl").value.trim();
  if (!url) {
    showStatus("Enter a URL", true);
    return;
  }
  showStatus("Loading...", false);
  var btns = document.querySelectorAll(".btn.p");
  btns.forEach(function (b) {
    b.disabled = true;
  });
  var proxies = [
    url,
    "https://corsproxy.io/?" + encodeURIComponent(url),
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
  ];
  var idx = 0;
  function tryNext() {
    if (idx >= proxies.length) {
      showStatus("CORS error", true);
      btns.forEach(function (b) {
        b.disabled = false;
      });
      return;
    }
    fetch(proxies[idx++])
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      })
      .then(function (t) {
        var rows = parseCSV(t);
        if (!rows.length) throw new Error("empty");
        ingest(rows, "Google Sheets");
        btns.forEach(function (b) {
          b.disabled = false;
        });
      })
      .catch(function () {
        tryNext();
      });
  }
  tryNext();
}
function loadFile(evt) {
  var f = evt.target.files[0];
  if (!f) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    var txt = e.target.result;
    if (f.name.endsWith(".json")) {
      try {
        var d = JSON.parse(txt);
        var arr = Array.isArray(d) ? d : d.trades || [];
        ingest(arr, f.name);
      } catch (ex) {
        showStatus("JSON error: " + ex.message, true);
      }
    } else {
      ingest(parseCSV(txt), f.name);
    }
  };
  reader.readAsText(f);
}
function exportJSON() {
  var b = new Blob([JSON.stringify(trades, null, 2)], {
    type: "application/json",
  });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = "trading_journal.json";
  a.click();
}
function loadFromJSON() {
  ingest(RAW_DATA, "All_Data.json");
}
