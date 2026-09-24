// Goals tab.
function renderGoals() {
  var gP = parseFloat(document.getElementById("g-monthly-pnl").value) || 500,
    gWR = parseFloat(document.getElementById("g-wr").value) || 60,
    gML = parseFloat(document.getElementById("g-max-loss").value) || 200,
    gA = parseFloat(document.getElementById("g-annual-pnl").value) || 6000,
    gRR = parseFloat(document.getElementById("g-rr").value) || 1.5;
  var now = new Date(),
    curM = now.getFullYear() + "-" + (now.getMonth() + 1);
  var mT = trades.filter(function (t) {
    var d = t.exitDate || t.entryDate;
    return d && fmtMonth(d) === curM;
  });
  if (!mT.length) {
    var gm = groupByPeriod(fmtMonth);
    var gk = Object.keys(gm).sort();
    if (gk.length) {
      var lM = gk[gk.length - 1];
      mT = trades.filter(function (t) {
        var d = t.exitDate || t.entryDate;
        return d && fmtMonth(d) === lM;
      });
    }
  }
  var mPnl = mT.reduce(function (a, t) {
      return a + t.pnl;
    }, 0),
    mW = mT.filter(function (t) {
      return t.pnl > 0;
    }),
    mWR = mT.length ? Math.round((mW.length / mT.length) * 100) : 0,
    bL = mT.filter(function (t) {
      return t.pnl < -gML;
    });
  var tPnl = trades.reduce(function (a, t) {
      return a + t.pnl;
    }, 0),
    aW = trades.filter(function (t) {
      return t.pnl > 0;
    }),
    aL = trades.filter(function (t) {
      return t.pnl < 0;
    }),
    aWR = trades.length ? Math.round((aW.length / trades.length) * 100) : 0;
  var avgW = aW.length
      ? avg(
          aW.map(function (t) {
            return t.pnl;
          }),
        )
      : 0,
    avgL = aL.length
      ? avg(
          aL.map(function (t) {
            return Math.abs(t.pnl);
          }),
        )
      : 0,
    rr = avgL ? Math.round((avgW / avgL) * 100) / 100 : 0;
  function pb(val, goal, inv) {
    var pct = Math.min(Math.round((Math.abs(val) / goal) * 100), 100);
    var ok = inv ? val <= goal : val >= goal;
    return {
      pct: pct,
      cls: ok ? "green" : pct >= 70 ? "amber" : "red",
      ok: ok,
    };
  }
  function card(lbl, cur, goal, p, sub) {
    return (
      '<div class="goal-card"><div class="goal-header"><div class="goal-label">' +
      lbl +
      '</div><div class="goal-val" style="color:' +
      (p.ok ? G : R) +
      '">' +
      cur +
      " / " +
      goal +
      '</div></div><div class="pbar-wrap"><div class="pbar ' +
      p.cls +
      '" style="width:' +
      p.pct +
      '%"></div></div><div class="goal-sub">' +
      p.pct +
      "% of target" +
      (sub ? " · " + sub : "") +
      "</div></div>"
    );
  }
  document.getElementById("goalCards").innerHTML =
    card(
      "Monthly P&L",
      "$" + Math.round(mPnl),
      "$" + gP,
      pb(mPnl, gP, false),
      mT.length + " trades this month",
    ) +
    card(
      "Monthly Win Rate",
      mWR + "%",
      gWR + "%",
      pb(mWR, gWR, false),
      mW.length + "W / " + (mT.length - mW.length) + "L",
    ) +
    card(
      "Trades Exceeding Loss Limit",
      bL.length + " trades",
      "0",
      pb(bL.length, 0, true),
      "max $" + gML + " loss per trade",
    );
  document.getElementById("goalCardsAll").innerHTML =
    card(
      "Annual P&L (All Time)",
      "$" + Math.round(tPnl),
      "$" + gA,
      pb(tPnl, gA, false),
      trades.length + " total trades",
    ) +
    card(
      "Overall Win Rate",
      aWR + "%",
      gWR + "%",
      pb(aWR, gWR, false),
      aW.length + "W / " + aL.length + "L",
    ) +
    card(
      "Average R:R",
      rr,
      gRR,
      pb(rr, gRR, false),
      "avg win $" + Math.round(avgW) + " / avg loss $" + Math.round(avgL),
    );
  var MILES = [200, 2000, 7000, 20000, 70000];
  var bestWin = trades.length
    ? Math.max.apply(
        null,
        trades.map(function (t) {
          return t.pnl;
        }),
      )
    : 0;
  var nextSet = false;
  var mHtml =
    '<div class="mile-wrap">' +
    MILES.map(function (m) {
      var done = bestWin >= m;
      var isNext = !done && !nextSet;
      if (isNext) nextSet = true;
      var cls = done ? "done" : isNext ? "active" : "locked";
      var icon = done ? "✓" : isNext ? "◎" : "○";
      var col = done ? G : isNext ? B : "var(--text3)";
      var pct = done
        ? 100
        : isNext
          ? Math.min(Math.round((bestWin / m) * 100), 99)
          : 0;
      var sub = done
        ? "Best win: $" + Math.round(bestWin)
        : isNext
          ? pct + "% · Best: $" + Math.round(bestWin)
          : "Locked";
      var bar = isNext
        ? '<div class="pbar-wrap" style="margin-top:6px"><div class="pbar blue" style="width:' +
          pct +
          '%"></div></div>'
        : "";
      return (
        '<div class="mile-card ' +
        cls +
        '"><div class="mile-icon" style="color:' +
        col +
        '">' +
        icon +
        '</div><div class="mile-amt" style="color:' +
        col +
        '">$' +
        m.toLocaleString() +
        '</div><div class="mile-lbl">Single Win</div>' +
        bar +
        '<div class="mile-sub">' +
        sub +
        "</div></div>"
      );
    }).join("") +
    "</div>";
  document.getElementById("goalMilestones").innerHTML = mHtml;
}
