// Performance tab: period charts, time efficiency, DTE, comparison.
function groupByPeriod(fn) {
  var m = {};
  trades.forEach(function (t) {
    var d = t.exitDate || t.entryDate;
    if (!d) return;
    var k = fn(d);
    if (!m[k]) m[k] = { pnl: 0, wins: 0, total: 0 };
    m[k].pnl += t.pnl;
    m[k].total++;
    if (t.pnl > 0) m[k].wins++;
  });
  return m;
}
function setPeriod(p) {
  perfPeriod = p;
  document.getElementById("tog-monthly").className =
    "btn sm" + (p === "monthly" ? " active-tog" : "");
  document.getElementById("tog-weekly").className =
    "btn sm" + (p === "weekly" ? " active-tog" : "");
  renderPerf();
}
function renderPerf() {
  var fn = perfPeriod === "monthly" ? fmtMonth : fmtWeek;
  var m = groupByPeriod(fn);
  var keys = Object.keys(m).sort();
  if (!keys.length) return;
  var isW = perfPeriod === "weekly";
  function dK(k) {
    return isW ? weekLabel(k) : k;
  }
  var cA = document.getElementById("cmp-a"),
    cB = document.getElementById("cmp-b"),
    pA = cA.value,
    pB = cB.value;
  cA.innerHTML = keys
    .map(function (k) {
      return '<option value="' + k + '">' + dK(k) + "</option>";
    })
    .join("");
  cB.innerHTML = keys
    .map(function (k) {
      return '<option value="' + k + '">' + dK(k) + "</option>";
    })
    .join("");
  if (keys.length >= 2) {
    cA.value = pA && m[pA] ? pA : keys[keys.length - 2];
    cB.value = pB && m[pB] ? pB : keys[keys.length - 1];
  }
  var labels = keys.map(dK),
    pnls = keys.map(function (k) {
      return Math.round(m[k].pnl);
    }),
    wrs = keys.map(function (k) {
      return m[k].total ? Math.round((m[k].wins / m[k].total) * 100) : 0;
    }),
    counts = keys.map(function (k) {
      return m[k].total;
    });
  dc("perfPnl");
  CX.perfPnl = new Chart(document.getElementById("perfPnl"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        { data: pnls, backgroundColor: pnls.map(bc), borderRadius: 4 },
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
  dc("perfWR");
  CX.perfWR = new Chart(document.getElementById("perfWR"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          data: wrs,
          borderColor: B,
          backgroundColor: "rgba(52,152,219,.08)",
          fill: true,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: B,
          tension: 0.3,
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
              return c.raw + "%";
            },
            afterLabel: function (c) {
              return counts[c.dataIndex] + " trades";
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: TC, font: { size: 10 } } },
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
  dc("perfCount");
  CX.perfCount = new Chart(document.getElementById("perfCount"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          data: counts,
          backgroundColor: "rgba(52,152,219,.6)",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: function (evt, els) {
        if (els.length) {
          var idx = els[0].index;
          periodFilter = {
            key: keys[idx],
            label: dK(keys[idx]),
            type: perfPeriod,
          };
          sw("log");
          renderLogT();
        }
      },
      onHover: function (evt, els) {
        evt.native.target.style.cursor = els.length ? "pointer" : "default";
      },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: TC, font: { size: 10 } } },
        y: { ticks: { color: TC }, grid: { color: GC } },
      },
    },
  });

  // ── Strategy Mix by Period ──
  var allStrats = [
    ...new Set(
      trades.map(function (t) {
        return t.strategy === "no strategy" ? "Fat Finger Mistake" : t.strategy;
      }),
    ),
  ].sort();
  var stratPalette = [
    "#3498db",
    "#f39c12",
    "#9b59b6",
    "#2ecc71",
    "#e67e22",
    "#1abc9c",
    "#e74c3c",
    "#00bcd4",
    "#8bc34a",
    "#ff5722",
  ];
  var stratColorMap = {};
  allStrats.forEach(function (s, i) {
    stratColorMap[s] = stratPalette[i % stratPalette.length];
  });
  var mixDatasets = allStrats.map(function (s) {
    return {
      label: s,
      data: keys.map(function (k) {
        return trades.filter(function (t) {
          var d = t.exitDate || t.entryDate;
          var ts =
            t.strategy === "no strategy" ? "Fat Finger Mistake" : t.strategy;
          return d && fn(d) === k && ts === s;
        }).length;
      }),
      backgroundColor: stratColorMap[s] + "cc",
      borderColor: stratColorMap[s],
      borderWidth: 0,
      borderRadius: 2,
    };
  });
  dc("stratMix");
  CX.stratMix = new Chart(document.getElementById("stratMix"), {
    type: "bar",
    data: { labels: labels, datasets: mixDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (c) {
              return (
                c.dataset.label +
                ": " +
                c.raw +
                (c.raw === 1 ? " trade" : " trades")
              );
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: TC, font: { size: 10 } },
          grid: { color: GC },
        },
        y: {
          stacked: true,
          ticks: { color: TC, precision: 0 },
          grid: { color: GC },
        },
      },
    },
  });
  // ── Time Efficiency — enhanced ──
  var teData = trades.filter(function (t) {
    return t.timeEff !== null;
  });
  if (teData.length) {
    // Metric cards
    var teWins = teData.filter(function (t) {
      return t.pnl > 0;
    });
    var teLosses = teData.filter(function (t) {
      return t.pnl <= 0;
    });
    var avgTeWin = teWins.length
      ? Math.round(
          teWins.reduce(function (a, t) {
            return a + t.timeEff;
          }, 0) / teWins.length,
        )
      : 0;
    var avgTeLoss = teLosses.length
      ? Math.round(
          teLosses.reduce(function (a, t) {
            return a + t.timeEff;
          }, 0) / teLosses.length,
        )
      : 0;
    var avgTeAll = Math.round(
      teData.reduce(function (a, t) {
        return a + t.timeEff;
      }, 0) / teData.length,
    );
    var fastWins = teData.filter(function (t) {
      return t.pnl > 0 && t.timeEff <= 50;
    });
    var slowLoss = teData.filter(function (t) {
      return t.pnl <= 0 && t.timeEff > 50;
    });
    document.getElementById("te-cards").innerHTML = [
      {
        l: "Avg Time — Winners",
        v: avgTeWin + "%",
        c: "pos",
        s: teWins.length + " trades",
        note: "exit early on wins",
      },
      {
        l: "Avg Time — Losers",
        v: avgTeLoss + "%",
        c: "neg",
        s: teLosses.length + " trades",
        note: "exit late on losses",
      },
      {
        l: "Fast Wins (≤50%)",
        v: fastWins.length,
        c: "pos",
        s:
          Math.round((fastWins.length / teData.length) * 100) +
          "% of all trades",
        note: "sweet spot",
      },
      {
        l: "Slow Losses (>50%)",
        v: slowLoss.length,
        c: "neg",
        s:
          Math.round((slowLoss.length / teData.length) * 100) +
          "% of all trades",
        note: "hope trades",
      },
    ]
      .map(function (m) {
        var col = m.c === "pos" ? G : R;
        return (
          '<div class="mc" style="border-top:3px solid ' +
          col +
          ';"><div class="ml">' +
          m.l +
          '</div><div class="mv" style="color:' +
          col +
          ';">' +
          m.v +
          '</div><div class="msub">' +
          m.s +
          "</div></div>"
        );
      })
      .join("");

    // Strategy color palette
    var strats = [
      ...new Set(
        teData.map(function (t) {
          return t.strategy;
        }),
      ),
    ];
    var palette = [
      "#3498db",
      "#f39c12",
      "#9b59b6",
      "#1abc9c",
      "#e67e22",
      "#e91e63",
      "#00bcd4",
      "#8bc34a",
    ];
    var stratColor = {};
    strats.forEach(function (s, i) {
      stratColor[s] = palette[i % palette.length];
    });

    // Legend
    document.getElementById("te-legend").innerHTML = strats
      .map(function (s) {
        return (
          '<span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:' +
          stratColor[s] +
          ';display:inline-block;"></span>' +
          s +
          "</span>"
        );
      })
      .join("");

    // Build datasets per strategy
    var datasets = strats.map(function (s) {
      var pts = teData
        .filter(function (t) {
          return t.strategy === s;
        })
        .map(function (t) {
          return {
            x: t.timeEff,
            y: t.pnl,
            label: t.name,
            strategy: t.strategy,
            days: t.days,
            sym: t.symbol,
          };
        });
      var base = stratColor[s];
      return {
        label: s,
        data: pts,
        backgroundColor: pts.map(function (p) {
          return p.y >= 0 ? base + "cc" : base + "66";
        }),
        pointRadius: 7,
        pointHoverRadius: 10,
        borderColor: pts.map(function (p) {
          return p.y >= 0 ? base : "rgba(231,76,60,.8)";
        }),
        borderWidth: pts.map(function (p) {
          return p.y >= 0 ? 0 : 1.5;
        }),
      };
    });

    // Quadrant lines via annotation plugin fallback — use afterDraw plugin
    var avgPnlAll = avg(
      teData.map(function (t) {
        return t.pnl;
      }),
    );
    dc("perfScatter");
    CX.perfScatter = new Chart(document.getElementById("perfScatter"), {
      type: "scatter",
      data: { datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) {
                return c.raw.sym + " — " + c.raw.strategy;
              },
              afterLabel: function (c) {
                return (
                  c.raw.label +
                  "\n" +
                  c.raw.x +
                  "% time used  |  " +
                  c.raw.days +
                  "d held  |  $" +
                  c.raw.y
                );
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "% of Available Time Used",
              color: TC,
            },
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
      plugins: [
        {
          id: "quadrants",
          afterDraw: function (chart) {
            var ctx = chart.ctx,
              xA = chart.scales.x,
              yA = chart.scales.y;
            var x50 = xA.getPixelForValue(50),
              y0 = yA.getPixelForValue(0);
            var left = xA.left,
              right = xA.right,
              top = yA.top,
              bottom = yA.bottom;
            ctx.save();
            // quadrant fills
            var quads = [
              {
                x: left,
                y: top,
                w: x50 - left,
                h: y0 - top,
                col: "rgba(46,204,113,.04)",
                label: "Fast Wins",
                lx: left + 8,
                ly: top + 14,
              },
              {
                x: x50,
                y: top,
                w: right - x50,
                h: y0 - top,
                col: "rgba(52,152,219,.04)",
                label: "Patient Wins",
                lx: x50 + 8,
                ly: top + 14,
              },
              {
                x: left,
                y: y0,
                w: x50 - left,
                h: bottom - y0,
                col: "rgba(243,156,18,.04)",
                label: "Fast Losses",
                lx: left + 8,
                ly: bottom - 8,
              },
              {
                x: x50,
                y: y0,
                w: right - x50,
                h: bottom - y0,
                col: "rgba(231,76,60,.05)",
                label: "Slow Losses ⚠️",
                lx: x50 + 8,
                ly: bottom - 8,
              },
            ];
            quads.forEach(function (q) {
              ctx.fillStyle = q.col;
              ctx.fillRect(q.x, q.y, q.w, q.h);
              ctx.fillStyle = "rgba(255,255,255,.18)";
              ctx.font = "10px IBM Plex Mono, monospace";
              ctx.fillText(q.label, q.lx, q.ly);
            });
            // divider lines
            ctx.strokeStyle = "rgba(255,255,255,.12)";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x50, top);
            ctx.lineTo(x50, bottom);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(left, y0);
            ctx.lineTo(right, y0);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          },
        },
      ],
    });
  }
  // ── DTE Analysis ──
  var dteBuckets = [
    { l: "0–7d", min: 0, max: 7 },
    { l: "8–21d", min: 8, max: 21 },
    { l: "22–45d", min: 22, max: 45 },
    { l: "46–90d", min: 46, max: 90 },
    { l: "90+d", min: 91, max: Infinity },
  ];
  var dteGroups = dteBuckets.map(function (b) {
    var ts = trades.filter(function (t) {
      if (!t.entryDate || !t.expiry) return false;
      var exp = parseDate(t.expiry);
      if (!exp) return false;
      var dte = Math.round((exp - t.entryDate) / 86400000);
      return dte >= b.min && dte <= b.max;
    });
    var wins = ts.filter(function (t) {
      return t.pnl > 0;
    });
    return {
      l: b.l,
      n: ts.length,
      wr: ts.length ? Math.round((wins.length / ts.length) * 100) : null,
      ap: ts.length
        ? Math.round(
            ts.reduce(function (a, t) {
              return a + t.pnl;
            }, 0) / ts.length,
          )
        : null,
    };
  });
  var dteLabels = dteGroups.map(function (g) {
    return g.l;
  });
  var dteWRs = dteGroups.map(function (g) {
    return g.wr;
  });
  var dteAPs = dteGroups.map(function (g) {
    return g.ap;
  });
  var dteCounts = dteGroups.map(function (g) {
    return g.n;
  });
  function onDteClick(evt, els) {
    if (els.length) {
      var b = dteBuckets[els[0].index];
      dteFilter = { min: b.min, max: b.max, label: b.l };
      sw("log");
      renderLogT();
    }
  }
  function onDteHover(evt, els) {
    evt.native.target.style.cursor = els.length ? "pointer" : "default";
  }
  dc("dteWR");
  CX.dteWR = new Chart(document.getElementById("dteWR"), {
    type: "bar",
    data: {
      labels: dteLabels,
      datasets: [
        {
          data: dteWRs,
          backgroundColor: "rgba(52,152,219,.7)",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: onDteClick,
      onHover: onDteHover,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (c) {
              return c.raw !== null ? c.raw + "%" : "No data";
            },
            afterLabel: function (c) {
              return dteCounts[c.dataIndex] + " trades";
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: TC, font: { size: 10 } } },
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
  dc("dtePnl");
  CX.dtePnl = new Chart(document.getElementById("dtePnl"), {
    type: "bar",
    data: {
      labels: dteLabels,
      datasets: [
        {
          data: dteAPs,
          backgroundColor: dteAPs.map(function (v) {
            return v === null
              ? "rgba(255,255,255,.1)"
              : v >= 0
                ? "rgba(46,204,113,.7)"
                : "rgba(231,76,60,.7)";
          }),
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: onDteClick,
      onHover: onDteHover,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (c) {
              return c.raw !== null ? "$" + c.raw : "No data";
            },
            afterLabel: function (c) {
              return dteCounts[c.dataIndex] + " trades";
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: TC, font: { size: 10 } } },
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
  renderComparison(m, keys, dK);
}
function renderComparison(m, keys, dK) {
  var cA = document.getElementById("cmp-a").value,
    cB = document.getElementById("cmp-b").value;
  if (!cA || !cB || !m[cA] || !m[cB]) return;
  var a = m[cA],
    b = m[cB],
    aWR = a.total ? Math.round((a.wins / a.total) * 100) : 0,
    bWR = b.total ? Math.round((b.wins / b.total) * 100) : 0;
  function delta(bv, av, pref) {
    var d = bv - av;
    var cls = d > 0 ? "pos" : d < 0 ? "neg" : "neu";
    return (
      '<span class="delta-badge ' +
      cls +
      '">' +
      (d >= 0 ? "+" : "") +
      pref +
      Math.round(d) +
      "</span>"
    );
  }
  var rows = [
    {
      l: "Net P&L",
      a: "$" + Math.round(a.pnl),
      b: "$" + Math.round(b.pnl),
      d: delta(b.pnl, a.pnl, "$"),
    },
    { l: "Win Rate", a: aWR + "%", b: bWR + "%", d: delta(bWR, aWR, "") + "%" },
    {
      l: "Trade Count",
      a: a.total,
      b: b.total,
      d: delta(b.total, a.total, ""),
    },
    {
      l: "Avg P&L / Trade",
      a: "$" + Math.round(a.pnl / a.total),
      b: "$" + Math.round(b.pnl / b.total),
      d: delta(b.pnl / b.total, a.pnl / a.total, "$"),
    },
  ];
  document.getElementById("compCards").innerHTML =
    '<div class="comp-card"><div class="comp-title">' +
    dK(cA) +
    "</div>" +
    rows
      .map(function (r) {
        return (
          '<div class="period-row"><span style="color:var(--text3)">' +
          r.l +
          '</span><span style="font-family:var(--m)">' +
          r.a +
          "</span></div>"
        );
      })
      .join("") +
    '</div><div class="comp-card"><div class="comp-title">' +
    dK(cB) +
    "</div>" +
    rows
      .map(function (r) {
        return (
          '<div class="period-row"><span style="color:var(--text3)">' +
          r.l +
          '</span><div style="display:flex;align-items:center;gap:8px;font-family:var(--m)">' +
          r.b +
          " " +
          r.d +
          "</div></div>"
        );
      })
      .join("") +
    "</div>";
}
document.addEventListener("change", function (e) {
  if (e.target.id === "cmp-a" || e.target.id === "cmp-b") {
    var fn = perfPeriod === "monthly" ? fmtMonth : fmtWeek;
    var m = groupByPeriod(fn);
    var keys = Object.keys(m).sort();
    var isW = perfPeriod === "weekly";
    renderComparison(m, keys, function (k) {
      return isW ? weekLabel(k) : k;
    });
  }
});
