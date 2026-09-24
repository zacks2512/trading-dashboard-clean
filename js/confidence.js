// Confidence Analysis tab.
function renderConf() {
  var groups = {};
  trades.forEach(function (t) {
    var c = parseInt(t.confidence);
    if (!c || c < 1 || c > 5) return;
    if (!groups[c]) groups[c] = { pnls: [], wins: 0, total: 0 };
    groups[c].pnls.push(t.pnl);
    groups[c].total++;
    if (t.pnl > 0) groups[c].wins++;
  });
  var levels = [1, 2, 3, 4, 5];
  var sL = function (l) {
    return "★".repeat(l) + "☆".repeat(5 - l);
  };
  var labels = levels.map(sL);
  var avgPnls = levels.map(function (l) {
    var g = groups[l];
    return g && g.pnls.length ? Math.round(avg(g.pnls)) : null;
  });
  var wrs = levels.map(function (l) {
    var g = groups[l];
    return g ? Math.round((g.wins / g.total) * 100) : null;
  });
  var counts = levels.map(function (l) {
    var g = groups[l];
    return g ? g.total : 0;
  });
  var hi45 = trades.filter(function (t) {
    var c = parseInt(t.confidence);
    return c >= 4 && c <= 5;
  });
  var lo12 = trades.filter(function (t) {
    var c = parseInt(t.confidence);
    return c >= 1 && c <= 2;
  });
  var hiWR = hi45.length
    ? Math.round(
        (hi45.filter(function (t) {
          return t.pnl > 0;
        }).length /
          hi45.length) *
          100,
      )
    : null;
  var loWR = lo12.length
    ? Math.round(
        (lo12.filter(function (t) {
          return t.pnl > 0;
        }).length /
          lo12.length) *
          100,
      )
    : null;
  var correlation = "";
  if (hiWR !== null && loWR !== null) {
    if (hiWR > loWR + 10) correlation = "well";
    else if (hiWR < loWR - 10) correlation = "inverse";
    else correlation = "none";
  }
  var cBg, cBorder, cColor, cIcon, cTitle, cDesc;
  if (correlation === "well") {
    cBg = "rgba(46,204,113,.06)";
    cBorder = "rgba(46,204,113,.35)";
    cColor = G;
    cIcon = "✅";
    cTitle = "Well Calibrated";
    cDesc =
      "High confidence (4-5★) trades win " +
      hiWR +
      "% vs " +
      loWR +
      "% for low confidence. Your gut is trustworthy — when you feel confident, you perform better.";
  } else if (correlation === "inverse") {
    cBg = "rgba(231,76,60,.06)";
    cBorder = "rgba(231,76,60,.35)";
    cColor = R;
    cIcon = "⚠️";
    cTitle = "Inverse Calibration";
    cDesc =
      "Low confidence trades win " +
      loWR +
      "% vs only " +
      hiWR +
      "% for high confidence. Overconfidence may be masking poor setups.";
  } else if (correlation === "none") {
    cBg = "rgba(52,152,219,.06)";
    cBorder = "rgba(52,152,219,.35)";
    cColor = B;
    cIcon = "🔍";
    cTitle = "No Clear Correlation";
    cDesc =
      "Confidence level does not predict win rate (" +
      loWR +
      "% low vs " +
      hiWR +
      "% high). Keep tracking to find a pattern.";
  }
  if (correlation) {
    document.getElementById("calib-card").innerHTML =
      '<div style="background:' +
      cBg +
      ";border:1px solid " +
      cBorder +
      ';border-radius:var(--r);padding:14px 20px;margin-bottom:20px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;"><div><div style="font-size:11px;color:var(--text3);font-family:var(--m);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Calibration Verdict</div><div style="font-size:20px;font-weight:500;font-family:var(--m);color:' +
      cColor +
      ';margin-bottom:6px;">' +
      cIcon +
      " " +
      cTitle +
      '</div><div style="font-size:12px;color:var(--text2);max-width:600px;line-height:1.6;">' +
      cDesc +
      '</div></div><div style="display:flex;gap:20px;flex-wrap:wrap;">' +
      (hiWR !== null
        ? '<div style="text-align:center;"><div style="font-size:10px;color:var(--text3);font-family:var(--m);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">4-5★ Win Rate</div><div style="font-size:22px;font-weight:500;font-family:var(--m);color:' +
          G +
          ';">' +
          hiWR +
          '%</div><div style="font-size:10px;color:var(--text3);">' +
          hi45.length +
          " trades</div></div>"
        : "") +
      (loWR !== null
        ? '<div style="text-align:center;"><div style="font-size:10px;color:var(--text3);font-family:var(--m);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">1-2★ Win Rate</div><div style="font-size:22px;font-weight:500;font-family:var(--m);color:' +
          AM +
          ';">' +
          loWR +
          '%</div><div style="font-size:10px;color:var(--text3);">' +
          lo12.length +
          " trades</div></div>"
        : "") +
      "</div></div>";
  } else {
    document.getElementById("calib-card").innerHTML = "";
  }
  var ratedT = trades.filter(function (t) {
    var c = parseInt(t.confidence);
    return c >= 1 && c <= 5;
  });
  var avgC = ratedT.length
    ? Math.round(
        (ratedT.reduce(function (a, t) {
          return a + parseInt(t.confidence);
        }, 0) /
          ratedT.length) *
          10,
      ) / 10
    : 0;
  var bestL = 0;
  levels.forEach(function (l) {
    var g = groups[l];
    if (!g || !g.pnls.length) return;
    var bg = groups[bestL];
    if (!bestL || !bg || !bg.pnls.length || avg(g.pnls) > avg(bg.pnls))
      bestL = l;
  });
  document.getElementById("conf-metrics").innerHTML = [
    {
      l: "Avg Confidence",
      v: avgC > 0 ? avgC + "★" : "—",
      c: "",
      s: ratedT.length + " rated trades",
    },
    {
      l: "Best Level",
      v: bestL > 0 ? "★".repeat(bestL) : "—",
      c: "pos",
      s: bestL > 0 ? "avg $" + Math.round(avg(groups[bestL].pnls)) : "—",
    },
    {
      l: "High Conf WR (4-5★)",
      v: hiWR !== null ? hiWR + "%" : "—",
      c: "",
      s: hi45.length + " trades",
    },
    {
      l: "Low Conf WR (1-2★)",
      v: loWR !== null ? loWR + "%" : "—",
      c: "",
      s: lo12.length + " trades",
    },
  ]
    .map(function (m) {
      return (
        '<div class="mc"><div class="ml">' +
        m.l +
        '</div><div class="mv ' +
        m.c +
        '">' +
        m.v +
        '</div><div class="msub">' +
        m.s +
        "</div></div>"
      );
    })
    .join("");
  dc("confPnl");
  CX.confPnl = new Chart(document.getElementById("confPnl"), {
    type: "bar",
    data: {
      labels: labels,
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
              return c.raw === null ? "No data" : "Avg P&L: $" + c.raw;
            },
            afterLabel: function (c) {
              var g = groups[c.dataIndex + 1];
              return g ? "(" + g.total + " trades)" : "";
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: TC, font: { size: 13 } } },
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
  dc("confWR");
  CX.confWR = new Chart(document.getElementById("confWR"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          data: wrs,
          backgroundColor: wrs.map(function (v) {
            return v === null
              ? "rgba(255,255,255,.05)"
              : v >= 60
                ? G
                : v >= 40
                  ? AM
                  : R;
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
              return c.raw === null ? "No data" : "Win Rate: " + c.raw + "%";
            },
            afterLabel: function (c) {
              var g = groups[c.dataIndex + 1];
              return g ? "(" + g.total + " trades)" : "";
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: TC, font: { size: 13 } } },
        y: {
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
      },
    },
  });
  dc("confCount");
  CX.confCount = new Chart(document.getElementById("confCount"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          data: counts,
          backgroundColor: "rgba(52,152,219,.5)",
          borderRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: TC, font: { size: 13 } } },
        y: { ticks: { color: TC }, grid: { color: GC } },
      },
    },
  });
  var scData = trades
    .filter(function (t) {
      return parseInt(t.confidence) >= 1 && parseInt(t.confidence) <= 5;
    })
    .map(function (t) {
      return { x: parseInt(t.confidence), y: t.pnl, label: t.name };
    });
  dc("confScatter");
  if (scData.length) {
    CX.confScatter = new Chart(document.getElementById("confScatter"), {
      type: "scatter",
      data: {
        datasets: [
          {
            data: scData,
            backgroundColor: scData.map(function (p) {
              return p.y >= 0 ? "rgba(46,204,113,.7)" : "rgba(231,76,60,.7)";
            }),
            pointRadius: 6,
            pointHoverRadius: 9,
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
                return c.raw.label;
              },
              afterLabel: function (c) {
                return (
                  "Confidence: " + "★".repeat(c.raw.x) + "  |  P&L: $" + c.raw.y
                );
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "Confidence Level", color: TC },
            min: 0.5,
            max: 5.5,
            ticks: {
              color: TC,
              stepSize: 1,
              callback: function (v) {
                return Number.isInteger(v) ? "★".repeat(v) : "";
              },
            },
            grid: { color: GC },
          },
          y: {
            title: { display: true, text: "Net P&L ($)", color: TC },
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
  }
}
