// Overview tab.
function renderOV() {
  var total = trades.reduce(function (s, t) {
    return s + t.pnl;
  }, 0);
  var wins = trades.filter(function (t) {
      return t.pnl > 0;
    }),
    losses = trades.filter(function (t) {
      return t.pnl <= 0;
    });
  var wr = trades.length ? wins.length / trades.length : 0;
  var aW = wins.length
      ? avg(
          wins.map(function (t) {
            return t.pnl;
          }),
        )
      : 0,
    aL = losses.length
      ? avg(
          losses.map(function (t) {
            return t.pnl;
          }),
        )
      : 0;
  var best = trades.length
      ? Math.max.apply(
          null,
          trades.map(function (t) {
            return t.pnl;
          }),
        )
      : 0,
    worst = trades.length
      ? Math.min.apply(
          null,
          trades.map(function (t) {
            return t.pnl;
          }),
        )
      : 0;
  var rr = aL !== 0 ? Math.abs(aW / aL).toFixed(2) : "—";
  var exp = wins.length && losses.length ? wr * aW + (1 - wr) * aL : 0,
    expR = Math.round(exp * 100) / 100;
  // ── Max Drawdown ──
  var runPeak = 0,
    maxDrawdownPct = 0,
    maxDrawdownDollar = 0,
    runCum2 = 0;
  trades.forEach(function (t) {
    runCum2 += t.pnl;
    if (runCum2 > runPeak) runPeak = runCum2;
    var dd = runPeak > 0 ? ((runCum2 - runPeak) / runPeak) * 100 : 0;
    if (dd < maxDrawdownPct) {
      maxDrawdownPct = dd;
      maxDrawdownDollar = runCum2 - runPeak;
    }
  });

  // ── Profit Factor (Gross) ──
  var grossWins = 0,
    grossLosses = 0;
  trades.forEach(function (t) {
    var g = pm(t.grossPnl);
    if (g > 0) grossWins += g;
    else if (g < 0) grossLosses += Math.abs(g);
  });
  var pf =
    grossLosses > 0
      ? Math.round((grossWins / grossLosses) * 100) / 100
      : grossWins > 0
        ? 999
        : 0;
  var pfLabel =
    pf >= 2
      ? "🔥 Excellent"
      : pf >= 1.5
        ? "✅ Good"
        : pf >= 1
          ? "⚠️ Marginal"
          : "❌ Losing";
  var pfColor = pf >= 1.5 ? G : pf >= 1 ? AM : R;

  // ── Expectancy ──
  var eC = expR >= 0 ? G : R,
    eSign = expR >= 0 ? "+" : "";
  var eLabel =
    expR >= 50
      ? "🔥 Strong edge"
      : expR >= 0
        ? "✅ Positive edge"
        : expR >= -20
          ? "⚠️ Marginal negative"
          : "❌ Negative edge";

  // ── Best & Worst trade ──
  var bestIdx = 0,
    worstIdx = 0;
  trades.forEach(function (t, i) {
    if (t.pnl > trades[bestIdx].pnl) bestIdx = i;
    if (t.pnl < trades[worstIdx].pnl) worstIdx = i;
  });
  var bestT = trades[bestIdx],
    worstT = trades[worstIdx];
  function tradeSub(t, i) {
    return "#" + (i + 1) + " | " + t.symbol + " | " + fmtDate(t.exitDate);
  }

  // ── Row 1: Performance ──
  var row1 = [
    {
      l: "Net P&L",
      v: (total >= 0 ? "+" : "") + "$" + Math.round(total),
      c: total >= 0 ? "pos" : "neg",
      s: trades.length + " trades",
    },
    {
      l: "Win Rate",
      v: (wr * 100).toFixed(1) + "%",
      c: "",
      s: wins.length + "W / " + losses.length + "L",
    },
    {
      l: "Profit Factor",
      v: pf === 999 ? "∞" : pf.toFixed(2),
      c: pf >= 1.5 ? "pos" : pf >= 1 ? "" : "neg",
      s: pfLabel,
      sc: pfColor,
    },
    {
      l: "Max Drawdown",
      v: Math.round(maxDrawdownPct) + "%",
      c: "neg",
      s: "$" + Math.round(maxDrawdownDollar) + " from peak",
    },
  ];
  // ── Row 2: Edge & Risk ──
  var row2 = [
    {
      l: "Expectancy",
      v: eSign + "$" + Math.abs(expR).toFixed(2),
      c: expR >= 0 ? "pos" : "neg",
      s: eLabel,
      sc: eC,
    },
    {
      l: "Avg Win / Avg Loss",
      v: "$" + Math.round(aW) + " / -$" + Math.round(Math.abs(aL)),
      c: "",
      s: "R:R " + rr,
    },
    {
      l: "Best Win",
      v: "+$" + bestT.pnl,
      c: "pos",
      s: tradeSub(bestT, bestIdx),
    },
    {
      l: "Worst Loss",
      v: "$" + worstT.pnl,
      c: "neg",
      s: tradeSub(worstT, worstIdx),
    },
  ];

  function mcHtml(m) {
    var valStyle = m.sc ? "color:" + m.sc + ";" : "";
    return (
      '<div class="mc"><div class="ml">' +
      m.l +
      '</div><div class="mv" style="' +
      valStyle +
      '">' +
      m.v +
      '</div><div class="msub">' +
      m.s +
      "</div></div>"
    );
  }
  document.getElementById("metrics").innerHTML =
    row1.map(mcHtml).join("") + row2.map(mcHtml).join("");
  document.getElementById("expectancy-card").innerHTML = "";
  var cum = 0,
    cLabels = [],
    cData = [],
    cNames = [],
    cNums = [];
  trades.forEach(function (t, i) {
    cum += t.pnl;
    cLabels.push("#" + (i + 1));
    cData.push(Math.round(cum));
    cNames.push(t.name);
    cNums.push(i + 1);
  });
  dc("cum");
  CX.cum = new Chart(document.getElementById("cumulChart"), {
    type: "line",
    data: {
      labels: cLabels,
      datasets: [
        {
          data: cData,
          fill: true,
          borderColor: cum >= 0 ? G : R,
          backgroundColor:
            cum >= 0 ? "rgba(46,204,113,.07)" : "rgba(231,76,60,.07)",
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 7,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function (items) {
              var idx = items[0].dataIndex;
              return "#" + cNums[idx] + " | " + cNames[idx];
            },
            label: function (c) {
              var idx = c.dataIndex;
              var t = trades[idx];
              var tp = t.pnl;
              return (
                fmtDate(t.exitDate || t.entryDate) +
                "  |  Trade P&L: " +
                (tp >= 0 ? "+" : "") +
                "$" +
                tp +
                "  |  Cumulative: $" +
                c.raw
              );
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: TC, font: { size: 10 }, maxTicksLimit: 15 },
          grid: { color: GC },
        },
        y: {
          ticks: {
            color: TC,
            callback: function (v) {
              return "$" + v;
            },
          },
          grid: { color: GC },
        },
      },
    },
  });

  // ── Drawdown chart ──
  var ddData = [],
    peak = 0;
  cData.forEach(function (v) {
    if (v > peak) peak = v;
    var dd = peak > 0 ? Math.round(((v - peak) / peak) * 100) : v - peak;
    ddData.push(dd);
  });
  var ddColors = ddData.map(function (v) {
    return v < 0 ? "rgba(231,76,60,.7)" : "rgba(46,204,113,.5)";
  });
  dc("dd");
  CX.dd = new Chart(document.getElementById("drawdownChart"), {
    type: "bar",
    data: {
      labels: cLabels,
      datasets: [
        {
          data: ddData,
          backgroundColor: ddColors,
          borderRadius: 2,
          barPercentage: 0.95,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function (items) {
              var idx = items[0].dataIndex;
              return "#" + cNums[idx] + " | " + cNames[idx];
            },
            label: function (c) {
              var t = trades[c.dataIndex];
              return (
                fmtDate(t.exitDate || t.entryDate) +
                "  |  Drawdown: " +
                c.raw +
                "%" +
                (c.raw === 0 ? " (at peak)" : "")
              );
            },
            afterLabel: function (c) {
              return "Cumulative P&L: $" + cData[c.dataIndex];
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: TC, font: { size: 10 }, maxTicksLimit: 15 },
          grid: { color: GC },
        },
        y: {
          max: 0,
          ticks: {
            color: TC,
            callback: function (v) {
              return v + "%";
            },
          },
          grid: { color: GC },
        },
      },
    },
  });

  function hbar(id, fn) {
    var m = {};
    trades.forEach(function (t) {
      var k = fn(t);
      m[k] = (m[k] || 0) + t.pnl;
    });
    var s = Object.entries(m).sort(function (a, b) {
      return b[1] - a[1];
    });
    dc(id);
    CX[id] = new Chart(document.getElementById(id), {
      type: "bar",
      data: {
        labels: s.map(function (x) {
          return x[0];
        }),
        datasets: [
          {
            data: s.map(function (x) {
              return Math.round(x[1]);
            }),
            backgroundColor: s.map(function (x) {
              return bc(x[1]);
            }),
            borderRadius: 3,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) {
                return "$" + c.raw;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: TC,
              callback: function (v) {
                return "$" + v;
              },
            },
            grid: { color: GC },
          },
          y: { ticks: { color: "#8891a4", font: { size: 10 } } },
        },
      },
    });
  }
  hbar("stratChart", function (t) {
    return t.strategy;
  });
  hbar("typeChart", function (t) {
    return t.type;
  });
  var sym = {};
  trades.forEach(function (t) {
    sym[t.symbol] = (sym[t.symbol] || 0) + t.pnl;
  });
  var ss = Object.entries(sym).sort(function (a, b) {
    return b[1] - a[1];
  });
  dc("sym");
  CX.sym = new Chart(document.getElementById("symChart"), {
    type: "bar",
    data: {
      labels: ss.map(function (x) {
        return x[0];
      }),
      datasets: [
        {
          data: ss.map(function (x) {
            return Math.round(x[1]);
          }),
          backgroundColor: ss.map(function (x) {
            return bc(x[1]);
          }),
          borderRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (c) {
              return "$" + c.raw;
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: TC, font: { size: 10 } } },
        y: {
          ticks: {
            color: "#8891a4",
            callback: function (v) {
              return "$" + v;
            },
          },
          grid: { color: GC },
        },
      },
    },
  });
  var mk = {};
  trades.forEach(function (t) {
    mk[t.mistakes] = (mk[t.mistakes] || 0) + 1;
  });
  var me = Object.entries(mk).sort(function (a, b) {
    return b[1] - a[1];
  });
  dc("mk");
  CX.mk = new Chart(document.getElementById("mistakeChart"), {
    type: "doughnut",
    data: {
      labels: me.map(function (x) {
        return x[0];
      }),
      datasets: [
        {
          data: me.map(function (x) {
            return x[1];
          }),
          backgroundColor: [
            G,
            R,
            B,
            AM,
            "#9b59b6",
            "#e67e22",
            "#1abc9c",
            "#d35400",
          ],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "60%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: "#8891a4",
            font: { size: 10 },
            boxWidth: 10,
            padding: 6,
          },
        },
      },
    },
  });
}
