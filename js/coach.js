// Coach tab: rules generated from the data, edge map by segment, and a what-if simulator.
var coachDim = "type",
  whatIfState = {},
  coachShowAll = false,
  whatIfStop = true,
  _wiRules = [];

function renderCoach() {
  var rules = buildRules();
  var all = stats(trades);

  // ── KPIs ──
  var edges = segments("type")
    .concat(segments("strategy"))
    .filter(function (s) {
      return s.verdict === "edge";
    })
    .sort(function (a, b) {
      return b.total - a.total;
    });
  var leakRules = rules.filter(function (r) {
    return r.dim === "type" || r.dim === "mistake";
  });
  var leakTrades = trades.filter(function (t) {
    return leakRules.some(function (r) {
      return dimById(r.dim).keys(t).indexOf(r.key) >= 0;
    });
  });
  var leakCost = sum(
    leakTrades.map(function (t) {
      return t.pnl;
    }),
  );
  var ratio = all.avgLoss ? Math.abs(all.avgWin / all.avgLoss) : 0;
  var kpis = [
    {
      l: "Expectancy / Trade",
      v: fmtSignedUsd(all.exp),
      c: all.exp >= 0 ? "pos" : "neg",
      s: "what an average trade earns you",
    },
    {
      l: "Avg Win ÷ Avg Loss",
      v: ratio.toFixed(2),
      c: ratio >= 1 ? "pos" : "neg",
      s:
        fmtUsd(all.avgWin) +
        " vs " +
        fmtUsd(all.avgLoss) +
        (ratio < 1 ? " — losses outweigh wins" : ""),
    },
    {
      l: "Top Edge",
      v: edges.length ? esc(edges[0].key) : "—",
      c: "pos",
      s: edges.length
        ? fmtSignedUsd(edges[0].total) + " in " + plural(edges[0].n, "trade")
        : "not enough data yet",
    },
    {
      l: "Money Lost to Leaks",
      v: fmtUsd(leakCost),
      c: leakCost < 0 ? "neg" : "",
      s:
        plural(leakTrades.length, "trade") +
        " in losing trade types or with costly mistakes",
    },
  ];
  document.getElementById("coach-kpis").innerHTML = kpis
    .map(function (m) {
      return (
        '<div class="mc"><div class="ml">' +
        m.l +
        '</div><div class="mv ' +
        m.c +
        '" style="font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
        m.v +
        '</div><div class="msub">' +
        m.s +
        "</div></div>"
      );
    })
    .join("");

  // ── Rules ──
  var TOP = 6,
    shown = coachShowAll ? rules : rules.slice(0, TOP);
  document.getElementById("coach-rules").innerHTML = rules.length
    ? shown
        .map(function (r, i) {
          return (
            '<div class="ins ' +
            r.sev +
            ' rule"><span class="rule-n">' +
            (i + 1) +
            "</span><div><b>" +
            esc(r.text) +
            '</b><div class="rule-why">' +
            esc(r.why) +
            "</div></div></div>"
          );
        })
        .join("") +
      (rules.length > TOP
        ? '<button class="btn sm" onclick="coachShowAll=!coachShowAll;renderCoach()">' +
          (coachShowAll
            ? "Show top " + TOP
            : "Show all " + rules.length + " rules") +
          "</button>"
        : "")
    : '<div class="empty" style="padding:20px">No clear leaks yet — keep logging trades.</div>';

  renderEdgeMap();
  renderWhatIf(rules);
}

function setCoachDim(id) {
  coachDim = id;
  renderEdgeMap();
}

function renderEdgeMap() {
  document.getElementById("edge-dims").innerHTML = DIMS.map(function (d) {
    return (
      '<button class="btn sm' +
      (d.id === coachDim ? " active-tog" : "") +
      '" onclick="setCoachDim(\'' +
      d.id +
      "')\">" +
      d.l +
      "</button>"
    );
  }).join("");
  var segs = segments(coachDim).sort(function (a, b) {
    return b.total - a.total;
  });
  var head =
    '<div class="edge-row edge-head"><span>' +
    dimById(coachDim).l +
    "</span><span>Trades</span><span>Win %</span><span>Net P&amp;L</span><span>Per Trade</span><span>Avg R*</span><span>Verdict</span></div>";
  document.getElementById("edge-table").innerHTML =
    head +
    segs
      .map(function (s) {
        return (
          '<div class="edge-row"><span class="tn">' +
          esc(s.key) +
          "</span><span>" +
          s.n +
          "</span><span>" +
          Math.round(s.wr * 100) +
          '%</span><span class="' +
          (s.total >= 0 ? "pp" : "np") +
          '">' +
          fmtSignedUsd(s.total) +
          '</span><span class="' +
          (s.exp >= 0 ? "pp" : "np") +
          '">' +
          fmtSignedUsd(s.exp) +
          "</span><span>" +
          fmtR(s.avgR) +
          '</span><span><span class="vtag ' +
          s.verdict +
          '">' +
          VERDICT_LABEL[s.verdict] +
          "</span></span></div>"
        );
      })
      .join("");
}

function wiOn(r) {
  var id = r.dim + ":" + r.key;
  return id in whatIfState ? whatIfState[id] : r.on;
}
function toggleWhatIf(i) {
  var r = _wiRules[i];
  whatIfState[r.dim + ":" + r.key] = !wiOn(r);
  renderWhatIf(buildRules());
}
function toggleWhatIfStop() {
  whatIfStop = !whatIfStop;
  renderWhatIf(buildRules());
}

function renderWhatIf(rules) {
  var filters = rules.filter(function (r) {
    return r.dim !== "stop";
  });
  var hasStop = rules.some(function (r) {
    return r.dim === "stop";
  });
  _wiRules = filters;
  var chips = filters.map(function (r, i) {
    var on = wiOn(r);
    return (
      '<label class="wi-chip' +
      (on ? " on" : "") +
      '"><input type="checkbox"' +
      (on ? " checked" : "") +
      ' onchange="toggleWhatIf(' +
      i +
      ')">Skip ' +
      esc(dimById(r.dim).l.toLowerCase()) +
      " “" +
      esc(r.key) +
      "”</label>"
    );
  });
  if (hasStop)
    chips.push(
      '<label class="wi-chip' +
        (whatIfStop ? " on" : "") +
        '"><input type="checkbox"' +
        (whatIfStop ? " checked" : "") +
        ' onchange="toggleWhatIfStop()">Exit debit losers at −50%</label>',
    );
  document.getElementById("whatif-chips").innerHTML = chips.length
    ? chips.join("")
    : '<span style="font-size:12px;color:var(--text3)">No leaks to simulate.</span>';

  var active = filters.filter(wiOn);
  function skipped(t) {
    return active.some(function (r) {
      return dimById(r.dim).keys(t).indexOf(r.key) >= 0;
    });
  }
  function simPnl(t) {
    if (skipped(t)) return null;
    if (hasStop && whatIfStop && !isPremium(t) && t.risk > 0)
      return Math.max(t.pnl, -0.5 * t.risk);
    return t.pnl;
  }
  var actual = 0,
    sim = 0,
    cA = [],
    cS = [],
    labels = [],
    kept = [];
  trades.forEach(function (t, i) {
    var p = simPnl(t);
    actual += t.pnl;
    if (p !== null) {
      sim += p;
      kept.push(p);
    }
    labels.push("#" + (i + 1));
    cA.push(Math.round(actual));
    cS.push(Math.round(sim));
  });
  var keptWR = kept.length
    ? kept.filter(function (p) {
        return p > 0;
      }).length / kept.length
    : 0;
  var allWR = stats(trades).wr;
  var diff = sim - actual;
  var cards = [
    {
      l: "Actual Net P&L",
      v: fmtSignedUsd(actual),
      c: actual >= 0 ? "pos" : "neg",
      s: trades.length + " trades",
    },
    {
      l: "With Your Rules",
      v: fmtSignedUsd(sim),
      c: sim >= 0 ? "pos" : "neg",
      s: kept.length + " trades taken",
    },
    {
      l: "Difference",
      v: fmtSignedUsd(diff),
      c: diff >= 0 ? "pos" : "neg",
      s: trades.length - kept.length + " trades skipped",
    },
    {
      l: "Win Rate",
      v: Math.round(keptWR * 100) + "%",
      c: keptWR >= allWR ? "pos" : "neg",
      s: "was " + Math.round(allWR * 100) + "%",
    },
  ];
  document.getElementById("whatif-res").innerHTML = cards
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

  dc("whatif");
  CX.whatif = new Chart(document.getElementById("coachWhatIf"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Actual",
          data: cA,
          borderColor: TC,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
        },
        {
          label: "With your rules",
          data: cS,
          borderColor: G,
          backgroundColor: "rgba(46,204,113,.07)",
          fill: true,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: TC, boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            title: function (items) {
              var t = trades[items[0].dataIndex];
              return items[0].label + " | " + t.name;
            },
            label: function (c) {
              return c.dataset.label + ": " + fmtUsd(c.raw);
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
}
