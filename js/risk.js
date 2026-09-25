// Risk (R) tab: directional trades measured in R-multiples, premium trades in % of max profit captured.
function riskCards(id, cards) {
  document.getElementById(id).innerHTML = cards
    .map(function (m) {
      return (
        '<div class="mc"><div class="ml">' +
        m.l +
        '</div><div class="mv ' +
        (m.c || "") +
        '">' +
        m.v +
        '</div><div class="msub">' +
        m.s +
        "</div></div>"
      );
    })
    .join("");
}

function histChart(key, canvasId, labels, counts, colors, unit) {
  dc(key);
  CX[key] = new Chart(document.getElementById(canvasId), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{ data: counts, backgroundColor: colors, borderRadius: 4 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (c) {
              return c.raw + " " + unit;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: TC, font: { size: 10 } },
          grid: { display: false },
        },
        y: { ticks: { color: TC, precision: 0 }, grid: { color: GC } },
      },
    },
  });
}

function renderRisk() {
  var debit = trades.filter(function (t) {
    return !isPremium(t) && t.risk > 0;
  });
  var prem = trades.filter(function (t) {
    return isPremium(t) && t.risk > 0;
  });

  // ── Directional buying ──
  var rs = debit.map(rMult);
  var wR = rs.filter(function (r) {
      return r > 0;
    }),
    lR = rs.filter(function (r) {
      return r <= 0;
    });
  var fl = fullLossStats();
  riskCards("r-debit-kpis", [
    {
      l: "Expectancy",
      v: fmtR(rs.length ? avg(rs) : null),
      c: avg(rs) >= 0 ? "pos" : "neg",
      s:
        "per trade · " + fmtR(sum(rs)) + " total over " + rs.length + " trades",
    },
    {
      l: "Avg Win",
      v: fmtR(wR.length ? avg(wR) : null),
      c: "pos",
      s: wR.length + " winners",
    },
    {
      l: "Avg Loss",
      v: fmtR(lR.length ? avg(lR) : null),
      c: "neg",
      s: lR.length + " losers",
    },
    {
      l: "Full-Premium Losses",
      v: Math.round(fl.fullRate * 100) + "%",
      c: fl.fullRate >= 0.5 ? "neg" : "",
      s: fl.full + " of " + fl.losers + " losers lost ≥ 90% of premium",
    },
  ]);

  var rB = [
    {
      l: "≤ −0.9R",
      t: function (r) {
        return r <= -0.9;
      },
      c: R,
    },
    {
      l: "−0.9 to −0.5R",
      t: function (r) {
        return r > -0.9 && r <= -0.5;
      },
      c: "rgba(231,76,60,.7)",
    },
    {
      l: "−0.5 to 0R",
      t: function (r) {
        return r > -0.5 && r <= 0;
      },
      c: "rgba(231,76,60,.45)",
    },
    {
      l: "0 to 0.5R",
      t: function (r) {
        return r > 0 && r <= 0.5;
      },
      c: "rgba(46,204,113,.45)",
    },
    {
      l: "0.5 to 1R",
      t: function (r) {
        return r > 0.5 && r <= 1;
      },
      c: "rgba(46,204,113,.7)",
    },
    {
      l: "1 to 2R",
      t: function (r) {
        return r > 1 && r <= 2;
      },
      c: G,
    },
    {
      l: "> 2R",
      t: function (r) {
        return r > 2;
      },
      c: G,
    },
  ];
  histChart(
    "rDist",
    "rDist",
    rB.map(function (b) {
      return b.l;
    }),
    rB.map(function (b) {
      return rs.filter(b.t).length;
    }),
    rB.map(function (b) {
      return b.c;
    }),
    "trades",
  );

  var cum = 0,
    cumR = [],
    labels = [];
  debit.forEach(function (t, i) {
    cum += rMult(t);
    cumR.push(Math.round(cum * 100) / 100);
    labels.push("#" + (trades.indexOf(t) + 1));
  });
  dc("rCum");
  CX.rCum = new Chart(document.getElementById("rCum"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          data: cumR,
          borderColor: cum >= 0 ? G : R,
          backgroundColor:
            cum >= 0 ? "rgba(46,204,113,.07)" : "rgba(231,76,60,.07)",
          fill: true,
          borderWidth: 2,
          pointRadius: 3,
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
              return items[0].label + " | " + debit[items[0].dataIndex].name;
            },
            label: function (c) {
              return (
                "Trade: " +
                fmtR(rMult(debit[c.dataIndex])) +
                "  |  Cumulative: " +
                fmtR(c.raw)
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
              return v + "R";
            },
          },
          grid: { color: GC },
        },
      },
    },
  });

  // ── Stop-loss simulation ──
  var debitNet = sum(
    debit.map(function (t) {
      return t.pnl;
    }),
  );
  document.getElementById("r-stops").innerHTML = [0.3, 0.5, 0.7]
    .map(function (s) {
      var sim = stopSim(s);
      return (
        '<div class="mc"><div class="ml">Stop at −' +
        Math.round(s * 100) +
        '% of premium</div><div class="mv pos">' +
        fmtSignedUsd(sim.saved) +
        '</div><div class="msub">' +
        sim.hit +
        " trades would have been cut · debit net " +
        fmtSignedUsd(debitNet) +
        " → " +
        fmtSignedUsd(debitNet + sim.saved) +
        "</div></div>"
      );
    })
    .join("");

  // ── Worst trades in R ──
  var worst = debit
    .slice()
    .sort(function (a, b) {
      return rMult(a) - rMult(b);
    })
    .slice(0, 6);
  document.getElementById("r-worst").innerHTML = worst
    .map(function (t) {
      return (
        '<div class="period-row"><span class="tn" style="max-width:65%">' +
        esc(t.name) +
        '</span><span><span class="np">' +
        fmtR(rMult(t)) +
        '</span> <span style="color:var(--text3);font-size:11px;">' +
        fmtUsd(t.pnl) +
        "</span></span></div>"
      );
    })
    .join("");

  // ── Premium selling ──
  var caps = prem.map(rMult);
  var pS = stats(prem);
  var held = prem
    .map(function (t) {
      return t.days;
    })
    .filter(function (d) {
      return d > 0;
    });
  riskCards("r-prem-kpis", [
    { l: "Trades", v: prem.length, s: fmtSignedUsd(pS.total) + " net", c: "" },
    {
      l: "Win Rate",
      v: Math.round(pS.wr * 100) + "%",
      c: pS.wr >= 0.7 ? "pos" : pS.wr >= 0.5 ? "" : "neg",
      s: "sellers usually need 70%+",
    },
    {
      l: "Avg Max Profit Captured",
      v: caps.length ? Math.round(avg(caps) * 100) + "%" : "—",
      c: avg(caps) >= 0.5 ? "pos" : "",
      s: "of the credit received",
    },
    {
      l: "Avg Days Held",
      v: held.length ? Math.round(avg(held)) : "—",
      c: "",
      s: "trades closed same day excluded",
    },
  ]);
  var cB = [
    {
      l: "Loss",
      t: function (c) {
        return c < 0;
      },
      c: R,
    },
    {
      l: "0–25%",
      t: function (c) {
        return c >= 0 && c < 0.25;
      },
      c: "rgba(46,204,113,.35)",
    },
    {
      l: "25–50%",
      t: function (c) {
        return c >= 0.25 && c < 0.5;
      },
      c: "rgba(46,204,113,.5)",
    },
    {
      l: "50–75%",
      t: function (c) {
        return c >= 0.5 && c < 0.75;
      },
      c: "rgba(46,204,113,.7)",
    },
    {
      l: "75–100%",
      t: function (c) {
        return c >= 0.75;
      },
      c: G,
    },
  ];
  histChart(
    "rCap",
    "rCap",
    cB.map(function (b) {
      return b.l;
    }),
    cB.map(function (b) {
      return caps.filter(b.t).length;
    }),
    cB.map(function (b) {
      return b.c;
    }),
    "trades",
  );
}
