// Win/loss streak tracker shown on the Overview tab.
function renderStreak() {
  if (!trades.length) return;
  var results = trades.map(function (t) {
    return t.pnl > 0 ? "W" : "L";
  });
  var curType = results[results.length - 1],
    curLen = 0;
  for (var i = results.length - 1; i >= 0; i--) {
    if (results[i] === curType) curLen++;
    else break;
  }
  var maxW = 0,
    runW = 0;
  results.forEach(function (r) {
    if (r === "W") {
      runW++;
      maxW = Math.max(maxW, runW);
    } else runW = 0;
  });
  var maxL = 0,
    runL = 0;
  results.forEach(function (r) {
    if (r === "L") {
      runL++;
      maxL = Math.max(maxL, runL);
    } else runL = 0;
  });
  var wStreaks = [],
    lStreaks = [],
    wRun = 0,
    lRun = 0;
  results.forEach(function (r) {
    if (r === "W") {
      wRun++;
      if (lRun > 0) {
        lStreaks.push(lRun);
        lRun = 0;
      }
    } else {
      lRun++;
      if (wRun > 0) {
        wStreaks.push(wRun);
        wRun = 0;
      }
    }
  });
  if (wRun > 0) wStreaks.push(wRun);
  if (lRun > 0) lStreaks.push(lRun);
  var avgWS = wStreaks.length
    ? Math.round(
        (wStreaks.reduce(function (a, b) {
          return a + b;
        }, 0) /
          wStreaks.length) *
          10,
      ) / 10
    : 0;
  var avgLS = lStreaks.length
    ? Math.round(
        (lStreaks.reduce(function (a, b) {
          return a + b;
        }, 0) /
          lStreaks.length) *
          10,
      ) / 10
    : 0;
  var curColor = curType === "W" ? G : R,
    curLabel = curType === "W" ? "🔥 Win Streak" : "❄️ Loss Streak";
  var tiles = results
    .map(function (r, i) {
      var t = trades[i];
      var col = r === "W" ? G : R;
      return (
        '<div class="streak-tile" style="background:' +
        col +
        ";opacity:" +
        (r === "W" ? "0.85" : "0.7") +
        '" title="' +
        t.name +
        " | " +
        (t.pnl >= 0 ? "+" : "") +
        "$" +
        t.pnl +
        '"></div>'
      );
    })
    .join("");
  document.getElementById("streak-section").innerHTML =
    '<div class="streak-wrap"><div class="streak-title">Streak Tracker</div><div class="streak-cards"><div class="streak-card" style="border-left:3px solid ' +
    curColor +
    ';"><div class="streak-card-label">Current Streak</div><div class="streak-card-val" style="color:' +
    curColor +
    ';">' +
    curLen +
    (curType === "W" ? "W" : "L") +
    '</div><div class="streak-card-sub">' +
    curLabel +
    '</div></div><div class="streak-card" style="border-left:3px solid ' +
    G +
    ';"><div class="streak-card-label">Longest Win Streak</div><div class="streak-card-val" style="color:' +
    G +
    ';">' +
    maxW +
    'W</div><div class="streak-card-sub">avg ' +
    avgWS +
    ' per run</div></div><div class="streak-card" style="border-left:3px solid ' +
    R +
    ';"><div class="streak-card-label">Longest Loss Streak</div><div class="streak-card-val" style="color:' +
    R +
    ';">' +
    maxL +
    'L</div><div class="streak-card-sub">avg ' +
    avgLS +
    ' per run</div></div><div class="streak-card" style="border-left:3px solid ' +
    B +
    ';"><div class="streak-card-label">Win / Loss Runs</div><div class="streak-card-val" style="color:' +
    B +
    ';">' +
    wStreaks.length +
    " / " +
    lStreaks.length +
    '</div><div class="streak-card-sub">total streaks</div></div></div><div class="streak-bar-wrap"><div class="streak-bar-label">Trade sequence — hover for details</div><div class="streak-tiles">' +
    tiles +
    "</div></div></div>";
}
