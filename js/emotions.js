// Emotion Analysis tab: charts, heatmap, insights, day of week.
function renderEM() {
  var eM = {},
    xM = {};
  trades.forEach(function (t) {
    semo(t.entry).forEach(function (e) {
      if (!eM[e]) eM[e] = { pnls: [], wins: 0 };
      eM[e].pnls.push(t.pnl);
      if (t.pnl > 0) eM[e].wins++;
    });
    semo(t.exit).forEach(function (e) {
      if (!xM[e]) xM[e] = { pnls: [], wins: 0 };
      xM[e].pnls.push(t.pnl);
      if (t.pnl > 0) xM[e].wins++;
    });
  });
  var cT = trades.filter(function (t) {
    return semo(t.entry).indexOf("Confidence") >= 0;
  });
  var cWR = cT.length
    ? Math.round(
        (cT.filter(function (t) {
          return t.pnl > 0;
        }).length /
          cT.length) *
          100,
      )
    : 0;
  var fT = trades.filter(function (t) {
    return semo(t.entry).indexOf("FOMO") >= 0;
  });
  var fA = fT.length
    ? Math.round(
        avg(
          fT.map(function (t) {
            return t.pnl;
          }),
        ),
      )
    : 0;
  var pT = trades.filter(function (t) {
    return semo(t.entry).indexOf("Patience") >= 0;
  });
  var pWR = pT.length
    ? Math.round(
        (pT.filter(function (t) {
          return t.pnl > 0;
        }).length /
          pT.length) *
          100,
      )
    : 0;
  var dT = trades.filter(function (t) {
    return semo(t.exit).indexOf("Discipline") >= 0;
  });
  var dWR = dT.length
    ? Math.round(
        (dT.filter(function (t) {
          return t.pnl > 0;
        }).length /
          dT.length) *
          100,
      )
    : 0;
  document.getElementById("emometrics").innerHTML = [
    { l: "Confidence WR", v: cWR + "%", c: "" },
    {
      l: "FOMO Avg P&L",
      v: (fA >= 0 ? "+" : "") + "$" + fA,
      c: fA < 0 ? "neg" : "pos",
    },
    { l: "Patience WR", v: pWR + "%", c: "" },
    { l: "Discipline Exit WR", v: dWR + "%", c: "" },
  ]
    .map(function (m) {
      return (
        '<div class="mc"><div class="ml">' +
        m.l +
        '</div><div class="mv ' +
        m.c +
        '">' +
        m.v +
        "</div></div>"
      );
    })
    .join("");
  function eavg(id, map) {
    var ent = Object.entries(map)
      .filter(function (e) {
        return e[1].pnls.length >= 2;
      })
      .sort(function (a, b) {
        return avg(b[1].pnls) - avg(a[1].pnls);
      });
    var avgs = ent.map(function (e) {
      return Math.round(avg(e[1].pnls));
    });
    dc(id);
    CX[id] = new Chart(document.getElementById(id), {
      type: "bar",
      data: {
        labels: ent.map(function (e) {
          return e[0];
        }),
        datasets: [
          { data: avgs, backgroundColor: avgs.map(bc), borderRadius: 3 },
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
                return "avg $" + c.raw;
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
  eavg("entryAvg", eM);
  eavg("exitAvg", xM);
  var wE = Object.entries(eM)
    .filter(function (e) {
      return e[1].pnls.length >= 2;
    })
    .sort(function (a, b) {
      return b[1].wins / b[1].pnls.length - a[1].wins / a[1].pnls.length;
    });
  var wrs = wE.map(function (e) {
    return Math.round((e[1].wins / e[1].pnls.length) * 100);
  });
  dc("ewr");
  CX.ewr = new Chart(document.getElementById("entryWR"), {
    type: "bar",
    data: {
      labels: wE.map(function (e) {
        return e[0] + " (" + e[1].pnls.length + ")";
      }),
      datasets: [
        {
          data: wrs,
          backgroundColor: wrs.map(function (v) {
            return v >= 60 ? G : v >= 40 ? AM : R;
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
              return c.raw + "%";
            },
          },
        },
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          ticks: {
            color: TC,
            callback: function (v) {
              return v + "%";
            },
          },
          grid: { color: GC },
        },
        y: { ticks: { color: "#8891a4", font: { size: 10 } } },
      },
    },
  });
  var NEG = [
    "FOMO",
    "Greed",
    "Stress",
    "Overconfidence",
    "Fear",
    "Impulsive",
    "Boredom",
  ];
  var nD = NEG.map(function (e) {
    var v = eM[e];
    return v
      ? Math.round(
          v.pnls.reduce(function (a, b) {
            return a + b;
          }, 0),
        )
      : 0;
  });
  var nC = NEG.map(function (e) {
    var v = eM[e];
    return v ? v.pnls.length : 0;
  });
  dc("neg");
  CX.neg = new Chart(document.getElementById("negEmo"), {
    type: "bar",
    data: {
      labels: NEG,
      datasets: [{ data: nD, backgroundColor: nD.map(bc), borderRadius: 3 }],
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
            afterLabel: function (c) {
              return "n=" + nC[c.dataIndex];
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
  buildHM(eM);
  buildIns(eM, xM);
  renderDOW();
}
function buildHM(eM) {
  var EMO = [
    "Confidence",
    "Patience",
    "Curiosity",
    "Boredom",
    "Acceptance",
    "Greed",
    "Fear",
    "Overconfidence",
    "FOMO",
    "Stress",
    "Impulsive",
  ];
  var TYP = [
    "Sell Call",
    "Sell Put",
    "Buy Call",
    "Bull Call",
    "Bear Put",
    "Buy Put",
  ];
  var mat = {};
  EMO.forEach(function (e) {
    mat[e] = {};
    TYP.forEach(function (t) {
      mat[e][t] = { sum: 0, n: 0 };
    });
  });
  trades.forEach(function (tr) {
    semo(tr.entry).forEach(function (e) {
      if (mat[e] && mat[e][tr.type] !== undefined) {
        mat[e][tr.type].sum += tr.pnl;
        mat[e][tr.type].n++;
      }
    });
  });

  // Find max absolute avg for relative scaling
  var maxAbs = 0;
  EMO.forEach(function (e) {
    TYP.forEach(function (t) {
      var c = mat[e][t];
      if (c.n) {
        var a = Math.abs(c.sum / c.n);
        if (a > maxAbs) maxAbs = a;
      }
    });
  });
  if (maxAbs === 0) maxAbs = 1;

  function cbg(s, n) {
    if (!n) return null;
    var v = s / n;
    var intensity = Math.min(Math.abs(v) / maxAbs, 1);
    // min opacity 0.25 so even small values are clearly visible
    var a = (0.25 + intensity * 0.65).toFixed(2);
    return v >= 0 ? "rgba(46,204,113," + a + ")" : "rgba(231,76,60," + a + ")";
  }
  // Always use white text for readability against colored bg
  function ctc(s, n) {
    if (!n) return null;
    return s / n >= 0 ? "#c8f5dc" : "#fdd0cc";
  }

  var h = '<table class="hm"><thead><tr><th class="rl"></th>';
  TYP.forEach(function (t) {
    h += "<th>" + t + "</th>";
  });
  h += "</tr></thead><tbody>";
  EMO.forEach(function (e) {
    h += '<tr><td class="rl">' + e + "</td>";
    TYP.forEach(function (t) {
      var c = mat[e][t];
      if (!c.n) {
        h += '<td class="cell emp"></td>';
        return;
      }
      var bg = cbg(c.sum, c.n),
        tc = ctc(c.sum, c.n),
        a = Math.round(c.sum / c.n);
      h +=
        '<td class="cell" style="background:' +
        bg +
        '"><div class="ca" style="color:' +
        tc +
        '">' +
        (a >= 0 ? "+" : "") +
        "$" +
        a +
        '</div><div class="cn" style="color:' +
        tc +
        '">n=' +
        c.n +
        "</div></td>";
    });
    h += "</tr>";
  });
  document.getElementById("heatmap").innerHTML = h + "</tbody></table>";
}
function buildIns(eM, xM) {
  var overallWR = trades.length
    ? (trades.filter(function (t) {
        return t.pnl > 0;
      }).length /
        trades.length) *
      100
    : 0;
  var overallAvg = trades.length
    ? avg(
        trades.map(function (t) {
          return t.pnl;
        }),
      )
    : 0;
  var insights = [];

  // ── 1. Best entry emotion vs baseline (min 3 trades) ──
  var emList = Object.entries(eM).filter(function (e) {
    return e[1].pnls.length >= 3;
  });
  if (emList.length) {
    var bestEmo = emList.reduce(function (b, e) {
      return e[1].wins / e[1].pnls.length > b[1].wins / b[1].pnls.length
        ? e
        : b;
    });
    var bestWR = Math.round((bestEmo[1].wins / bestEmo[1].pnls.length) * 100);
    var bestDelta = Math.round(bestWR - overallWR);
    insights.push({
      c: "pos",
      i: "↑",
      t:
        "<b>" +
        bestEmo[0] +
        "</b> is your best entry emotion — " +
        bestWR +
        "% win rate, " +
        (bestDelta >= 0 ? "+" : "") +
        bestDelta +
        "% vs your " +
        Math.round(overallWR) +
        "% average (" +
        bestEmo[1].pnls.length +
        " trades)",
    });
  }

  // ── 2. Worst entry emotion vs baseline (min 3 trades) ──
  if (emList.length) {
    var worstEmo = emList.reduce(function (b, e) {
      return e[1].wins / e[1].pnls.length < b[1].wins / b[1].pnls.length
        ? e
        : b;
    });
    var worstWR = Math.round(
      (worstEmo[1].wins / worstEmo[1].pnls.length) * 100,
    );
    var worstDelta = Math.round(worstWR - overallWR);
    insights.push({
      c: "neg",
      i: "↓",
      t:
        "<b>" +
        worstEmo[0] +
        "</b> is your worst entry emotion — " +
        worstWR +
        "% win rate, " +
        (worstDelta >= 0 ? "+" : "") +
        worstDelta +
        "% vs your average. Consider skipping trades when feeling this way",
    });
  }

  // ── 3. Most expensive mistake ──
  var mkMap = {};
  trades.forEach(function (t) {
    if (t.mistakes && t.mistakes !== "No Mistake") {
      if (!mkMap[t.mistakes]) mkMap[t.mistakes] = { total: 0, n: 0 };
      mkMap[t.mistakes].total += t.pnl;
      mkMap[t.mistakes].n++;
    }
  });
  var mkList = Object.entries(mkMap).filter(function (e) {
    return e[1].n >= 2;
  });
  if (mkList.length) {
    var worstMk = mkList.reduce(function (b, e) {
      return e[1].total < b[1].total ? e : b;
    });
    insights.push({
      c: "neg",
      i: "↓",
      t:
        "<b>" +
        worstMk[0] +
        "</b> is your most expensive mistake — $" +
        Math.round(worstMk[1].total) +
        " total P&L damage across " +
        worstMk[1].n +
        " trades (avg $" +
        Math.round(worstMk[1].total / worstMk[1].n) +
        " per occurrence)",
    });
  }

  // ── 4. Surprise insight — expected bad emotion that outperforms, or expected good that underperforms ──
  var EXPECTED_BAD = [
    "FOMO",
    "Greed",
    "Stress",
    "Overconfidence",
    "Impulsive",
    "Fear",
    "Boredom",
  ];
  var EXPECTED_GOOD = [
    "Confidence",
    "Patience",
    "Discipline",
    "Curiosity",
    "Acceptance",
  ];
  var surprises = [];
  emList.forEach(function (e) {
    var wr = (e[1].wins / e[1].pnls.length) * 100;
    var avgP = avg(e[1].pnls);
    if (EXPECTED_BAD.indexOf(e[0]) >= 0 && wr > overallWR + 10) {
      surprises.push({
        c: "neu",
        i: "→",
        t:
          "Surprise: <b>" +
          e[0] +
          "</b> (usually a bad sign) actually gives you " +
          Math.round(wr) +
          "% win rate — " +
          Math.round(wr - overallWR) +
          " pts above average. Worth investigating why",
      });
    }
    if (EXPECTED_GOOD.indexOf(e[0]) >= 0 && wr < overallWR - 10) {
      surprises.push({
        c: "neu",
        i: "→",
        t:
          "Surprise: <b>" +
          e[0] +
          "</b> (usually a good sign) is underperforming at " +
          Math.round(wr) +
          "% win rate — " +
          Math.round(overallWR - wr) +
          " pts below your average",
      });
    }
  });
  if (surprises.length) insights.push(surprises[0]);

  // ── 5. Best exit emotion ──
  var xmList = Object.entries(xM).filter(function (e) {
    return e[1].pnls.length >= 3;
  });
  if (xmList.length) {
    var bestExit = xmList.reduce(function (b, e) {
      return avg(e[1].pnls) > avg(b[1].pnls) ? e : b;
    });
    var bestExitAvg = Math.round(avg(bestExit[1].pnls));
    var worstExit = xmList.reduce(function (b, e) {
      return avg(e[1].pnls) < avg(b[1].pnls) ? e : b;
    });
    var worstExitAvg = Math.round(avg(worstExit[1].pnls));
    insights.push({
      c: "pos",
      i: "↑",
      t:
        "Best exit emotion: <b>" +
        bestExit[0] +
        "</b> (avg $" +
        (bestExitAvg >= 0 ? "+" : "") +
        bestExitAvg +
        ") vs worst: <b>" +
        worstExit[0] +
        "</b> (avg $" +
        worstExitAvg +
        "). Your exit discipline matters as much as entry",
    });
  }

  // ── 6. Volume warning — most traded emotion that's unprofitable ──
  var volumeWarning = null;
  var sortedByVolume = emList.slice().sort(function (a, b) {
    return b[1].pnls.length - a[1].pnls.length;
  });
  for (var i = 0; i < sortedByVolume.length; i++) {
    var e = sortedByVolume[i];
    var wr = (e[1].wins / e[1].pnls.length) * 100;
    var tot = e[1].pnls.reduce(function (a, b) {
      return a + b;
    }, 0);
    if (wr < overallWR && tot < 0) {
      volumeWarning = {
        c: "neg",
        i: "↓",
        t:
          "Volume alert: <b>" +
          e[0] +
          "</b> is your most common entry emotion (" +
          e[1].pnls.length +
          " trades) but is unprofitable — " +
          Math.round(wr) +
          "% WR, $" +
          Math.round(tot) +
          " total. High frequency + negative edge is a compounding problem",
      };
      break;
    }
  }
  if (volumeWarning) insights.push(volumeWarning);

  // ── Fallback if not enough data ──
  if (!insights.length) {
    insights.push({
      c: "neu",
      i: "→",
      t: "Not enough data yet for dynamic insights. Keep logging trades with emotions filled in.",
    });
  }

  document.getElementById("insights").innerHTML = insights
    .map(function (x) {
      return (
        '<div class="ins ' +
        x.c +
        '"><span style="font-weight:500;font-size:15px;line-height:1;">' +
        x.i +
        "</span>&nbsp;<span>" +
        x.t +
        "</span></div>"
      );
    })
    .join("");
}

function renderDOW() {
  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  var dow = {};
  DAYS.forEach(function (d) {
    dow[d] = { pnls: [], wins: 0, total: 0 };
  });
  trades.forEach(function (t) {
    var d = t.entryDate;
    if (!d) return;
    var dn = d.getDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat
    if (dn === 0 || dn === 6) return; // skip weekends
    var name = DAYS[dn - 1];
    dow[name].pnls.push(t.pnl);
    dow[name].total++;
    if (t.pnl > 0) dow[name].wins++;
  });

  // ── 5 metric cards ──
  document.getElementById("dow-cards").innerHTML = DAYS.map(function (day) {
    var g = dow[day];
    if (!g.total)
      return (
        '<div class="mc"><div class="ml">' +
        day +
        '</div><div class="mv" style="color:var(--text3);">—</div><div class="msub">No trades</div></div>'
      );
    var avgP = Math.round(avg(g.pnls));
    var wr = Math.round((g.wins / g.total) * 100);
    var col = avgP >= 0 ? G : R;
    var sign = avgP >= 0 ? "+" : "";
    return (
      '<div class="mc" style="border-top:3px solid ' +
      col +
      ';"><div class="ml">' +
      day +
      '</div><div class="mv" style="color:' +
      col +
      ';">' +
      sign +
      "$" +
      avgP +
      '</div><div class="msub">' +
      g.total +
      " trades · " +
      wr +
      "% WR</div></div>"
    );
  }).join("");

  // ── Avg P&L bar chart ──
  var avgPnls = DAYS.map(function (d) {
    var g = dow[d];
    return g.total ? Math.round(avg(g.pnls)) : null;
  });
  dc("dowPnl");
  CX.dowPnl = new Chart(document.getElementById("dowPnl"), {
    type: "bar",
    data: {
      labels: DAYS,
      datasets: [
        {
          data: avgPnls,
          backgroundColor: avgPnls.map(function (v) {
            return v === null ? "rgba(255,255,255,.05)" : bc(v);
          }),
          borderRadius: 5,
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
              return c.raw === null
                ? "No trades"
                : "Avg P&L: " + (c.raw >= 0 ? "+" : "") + "$" + c.raw;
            },
            afterLabel: function (c) {
              var g = dow[DAYS[c.dataIndex]];
              return g.total
                ? g.total +
                    " trades · " +
                    Math.round((g.wins / g.total) * 100) +
                    "% WR"
                : "";
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: TC } },
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

  // ── Trade Count bar chart ──
  var counts = DAYS.map(function (d) {
    return dow[d].total;
  });
  var countColors = DAYS.map(function (d) {
    var g = dow[d];
    return g.total && avg(g.pnls) < 0
      ? "rgba(231,76,60,.5)"
      : "rgba(52,152,219,.6)";
  });
  dc("dowCount");
  CX.dowCount = new Chart(document.getElementById("dowCount"), {
    type: "bar",
    data: {
      labels: DAYS,
      datasets: [
        { data: counts, backgroundColor: countColors, borderRadius: 5 },
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
              return c.raw + " trades";
            },
            afterLabel: function (c) {
              var g = dow[DAYS[c.dataIndex]];
              return g.total
                ? "Avg P&L: " +
                    (avg(g.pnls) >= 0 ? "+" : "") +
                    "$" +
                    Math.round(avg(g.pnls)) +
                    "  ·  " +
                    Math.round((g.wins / g.total) * 100) +
                    "% WR"
                : "";
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: TC } },
        y: { ticks: { color: TC }, grid: { color: GC } },
      },
    },
  });
}
