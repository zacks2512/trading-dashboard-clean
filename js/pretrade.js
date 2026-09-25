// Pre-Trade Check tab: describe a planned trade and check it against your own history and rules.
var PT_TYPES = [
    "Buy Call",
    "Buy Put",
    "Bull Call",
    "Bear Put",
    "Sell Call",
    "Sell Put",
  ],
  PT_CHECKLIST = [
    { id: "confirm", l: "Setup is confirmed — I'm not anticipating it" },
    { id: "exit", l: "Profit target and exit / stop are defined" },
    { id: "news", l: "Checked news and the earnings date" },
    { id: "playbook", l: "This setup is in my playbook" },
  ],
  ptEmos = [];

function uniq(a) {
  return a.filter(function (v, i) {
    return v && a.indexOf(v) === i;
  });
}
function fillSelect(id, values, first) {
  var el = document.getElementById(id),
    cur = el.value;
  el.innerHTML =
    '<option value="">' +
    first +
    "</option>" +
    values
      .map(function (v) {
        return '<option value="' + esc(v) + '">' + esc(v) + "</option>";
      })
      .join("");
  if (values.indexOf(cur) >= 0) el.value = cur;
}

function renderPretrade() {
  fillSelect(
    "pt-type",
    uniq(
      PT_TYPES.concat(
        trades.map(function (t) {
          return t.type;
        }),
      ),
    ).filter(function (v) {
      return v !== "—";
    }),
    "Select…",
  );
  fillSelect(
    "pt-strategy",
    uniq(
      trades.map(function (t) {
        return t.strategy;
      }),
    ).filter(function (v) {
      return v !== "—";
    }),
    "Select…",
  );
  document.getElementById("pt-syms").innerHTML = uniq(
    trades.map(function (t) {
      return t.symbol;
    }),
  )
    .sort()
    .map(function (s) {
      return '<option value="' + esc(s) + '">';
    })
    .join("");
  var emos = uniq(
    BAD.concat(GOOD).concat(
      [].concat.apply(
        [],
        trades.map(function (t) {
          return semo(t.entry);
        }),
      ),
    ),
  );
  document.getElementById("pt-emos").innerHTML = emos
    .map(function (e) {
      var cls = BAD.indexOf(e) >= 0 ? "bd" : GOOD.indexOf(e) >= 0 ? "gd" : "nu";
      return (
        '<button type="button" class="pt-emo ' +
        cls +
        (ptEmos.indexOf(e) >= 0 ? " on" : "") +
        '" data-emo="' +
        esc(e) +
        '" onclick="togglePtEmo(this)">' +
        esc(e) +
        "</button>"
      );
    })
    .join("");
  if (!document.getElementById("pt-checklist").children.length)
    document.getElementById("pt-checklist").innerHTML = PT_CHECKLIST.map(
      function (c) {
        return (
          '<label class="pt-check"><input type="checkbox" id="pt-c-' +
          c.id +
          '" onchange="evalPretrade()"> ' +
          c.l +
          "</label>"
        );
      },
    ).join("");
  evalPretrade();
}

function togglePtEmo(el) {
  var e = el.getAttribute("data-emo"),
    i = ptEmos.indexOf(e);
  if (i >= 0) ptEmos.splice(i, 1);
  else ptEmos.push(e);
  el.classList.toggle("on", i < 0);
  evalPretrade();
}

function resetPretrade() {
  [
    "pt-symbol",
    "pt-type",
    "pt-strategy",
    "pt-risk",
    "pt-dte",
    "pt-conf",
  ].forEach(function (id) {
    document.getElementById(id).value = "";
  });
  PT_CHECKLIST.forEach(function (c) {
    document.getElementById("pt-c-" + c.id).checked = false;
  });
  ptEmos = [];
  renderPretrade();
}

function ptVal(id) {
  return document.getElementById(id).value.trim();
}

// Describe one segment of history as a check: edge → pos, leak → neg, otherwise neutral.
function segCheck(dim, key, label) {
  var list = tradesIn(dim, key);
  if (!list.length)
    return {
      sev: "neu",
      title: label + ": no history",
      detail: "First trade of this kind — size small.",
    };
  var s = stats(list),
    v = verdict(s);
  var detail =
    s.n +
    " trades · " +
    Math.round(s.wr * 100) +
    "% win · " +
    fmtSignedUsd(s.total) +
    " net · " +
    fmtSignedUsd(s.exp) +
    " per trade" +
    (s.avgR !== null ? " · " + fmtR(s.avgR) + " avg" : "");
  if (v === "leak")
    return { sev: "neg", title: label + " is a leak for you", detail: detail };
  if (v === "edge")
    return { sev: "pos", title: label + " is an edge for you", detail: detail };
  if (v === "few")
    return {
      sev: "neu",
      title: label + ": too few trades to judge",
      detail: detail,
    };
  return { sev: "neu", title: label + ": no clear edge", detail: detail };
}

function evalPretrade() {
  var sym = ptVal("pt-symbol").toUpperCase(),
    type = ptVal("pt-type"),
    strat = ptVal("pt-strategy"),
    risk = parseFloat(ptVal("pt-risk")),
    dte = parseInt(ptVal("pt-dte")),
    conf = ptVal("pt-conf");
  var out = document.getElementById("pt-result");
  if (!type) {
    out.innerHTML =
      '<div class="empty" style="padding:32px">Choose at least a trade type to see how this trade compares with your history.</div>';
    return;
  }
  var premium = isPremium({ type: type });
  var checks = [];
  checks.push(segCheck("type", type, "“" + type + "”"));
  if (strat)
    checks.push(segCheck("strategy", strat, "Strategy “" + strat + "”"));
  if (sym) {
    var symT = tradesIn("symbol", sym);
    if (symT.length) {
      var ss = stats(symT);
      checks.push({
        sev: ss.n >= MIN_N && ss.total < 0 ? "neg" : "neu",
        title: sym + ": your history",
        detail:
          ss.n +
          " trades · " +
          Math.round(ss.wr * 100) +
          "% win · " +
          fmtSignedUsd(ss.total) +
          " net",
      });
    }
  }
  ptEmos.forEach(function (e) {
    if (BAD.indexOf(e) >= 0) {
      var eT = tradesIn("emotion", e),
        es = stats(eT);
      checks.push({
        sev: "neg",
        title: "Trading with " + e,
        detail:
          e +
          " is on your danger list" +
          (eT.length
            ? " · past trades: " +
              es.n +
              " · " +
              fmtSignedUsd(es.total) +
              " net"
            : "") +
          ". Wait until it passes.",
      });
    } else checks.push(segCheck("emotion", e, "Emotion “" + e + "”"));
  });
  if (conf)
    checks.push(
      segCheck("confidence", "Confidence " + conf, "Confidence " + conf),
    );
  if (!isNaN(dte)) {
    var b = dteBucket(dte);
    if (b) checks.push(segCheck("dte", b, "DTE " + b));
  }

  // Risk sizing
  if (!isNaN(risk) && risk > 0) {
    var gML = parseFloat(document.getElementById("g-max-loss").value) || 200;
    var risks = trades
      .map(function (t) {
        return t.risk;
      })
      .filter(function (r) {
        return r > 0;
      })
      .sort(function (a, b) {
        return a - b;
      });
    var med = risks.length ? risks[Math.floor(risks.length / 2)] : 0;
    if (!premium && risk > gML)
      checks.push({
        sev: "neg",
        title: "Risk " + fmtUsd(risk) + " is above your max loss",
        detail:
          "Your goal is max " +
          fmtUsd(gML) +
          " per trade (Goals tab). Cut the size.",
      });
    else if (med && risk > 2 * med)
      checks.push({
        sev: "warn",
        title: "Larger than usual",
        detail:
          fmtUsd(risk) + " is more than 2× your typical " + fmtUsd(med) + ".",
      });
    else
      checks.push({
        sev: "pos",
        title: "Size is within your limits",
        detail:
          "Typical risk " +
          fmtUsd(med) +
          " · max loss goal " +
          fmtUsd(gML) +
          ".",
      });
    if (!premium)
      checks.push({
        sev: "neu",
        title: "Plan the stop: exit at " + fmtUsd(-risk / 2),
        detail:
          "Close if the position loses 50% of the premium paid instead of riding it to zero.",
      });
    else
      checks.push({
        sev: "neu",
        title:
          "Plan the exit: take profit at " +
          fmtUsd(risk / 2) +
          ", stop at " +
          fmtUsd(-risk * 2),
        detail:
          "For sold options your credit is the max profit, not the max loss — define the stop before entry.",
      });
  }

  PT_CHECKLIST.forEach(function (c) {
    if (!document.getElementById("pt-c-" + c.id).checked)
      checks.push({ sev: "warn", title: "Not checked: " + c.l, detail: "" });
  });

  var neg = checks.filter(function (c) {
      return c.sev === "neg";
    }).length,
    warn = checks.filter(function (c) {
      return c.sev === "warn";
    }).length;
  var v =
    neg >= 2
      ? {
          c: "neg",
          t: "STOP",
          s: "Don't take this trade as planned — " + neg + " red flags.",
        }
      : neg === 1 || warn >= 2
        ? {
            c: "warn",
            t: "CAUTION",
            s: "Fix the flagged items before entering.",
          }
        : { c: "pos", t: "GO", s: "Consistent with your edge and your rules." };

  // Similar past trades: same type (and strategy if given)
  var similar = trades
    .filter(function (t) {
      return t.type === type && (!strat || t.strategy === strat);
    })
    .slice(-5)
    .reverse();

  out.innerHTML =
    '<div class="pt-verdict ' +
    v.c +
    '"><div class="pt-vt">' +
    v.t +
    '</div><div class="pt-vs">' +
    v.s +
    "</div></div>" +
    checks
      .map(function (c) {
        return (
          '<div class="ins ' +
          c.sev +
          '" style="margin-bottom:8px;"><div><b>' +
          esc(c.title) +
          "</b>" +
          (c.detail
            ? '<div class="rule-why">' + esc(c.detail) + "</div>"
            : "") +
          "</div></div>"
        );
      })
      .join("") +
    (similar.length
      ? '<div class="stt" style="margin-top:16px;">Last similar trades</div>' +
        similar
          .map(function (t) {
            return (
              '<div class="period-row"><span class="tn" style="max-width:70%">' +
              esc(t.name) +
              '</span><span class="' +
              (t.pnl >= 0 ? "pp" : "np") +
              '">' +
              fmtSignedUsd(t.pnl) +
              "</span></div>"
            );
          })
          .join("")
      : "");
}

function copyPlan() {
  var lines = [
    "PLAN — " +
      (ptVal("pt-symbol").toUpperCase() || "?") +
      " " +
      ptVal("pt-type"),
    "Strategy: " + (ptVal("pt-strategy") || "—"),
    "Risk: " +
      (ptVal("pt-risk") ? "$" + ptVal("pt-risk") : "—") +
      " · DTE: " +
      (ptVal("pt-dte") || "—") +
      " · Confidence: " +
      (ptVal("pt-conf") || "—"),
    "Emotions: " + (ptEmos.join(", ") || "—"),
    "Verdict: " +
      (document.querySelector("#pt-result .pt-vt") || { textContent: "—" })
        .textContent,
  ];
  var txt = lines.join("\n"),
    btn = document.getElementById("pt-copy");
  function done(ok) {
    btn.textContent = ok ? "✓ Copied" : "Copy failed";
    setTimeout(function () {
      btn.textContent = "📋 Copy Plan";
    }, 1500);
  }
  try {
    navigator.clipboard.writeText(txt).then(
      function () {
        done(true);
      },
      function () {
        done(false);
      },
    );
  } catch (e) {
    done(false);
  }
}
