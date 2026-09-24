// Settings tab: CSV / Google Sheets column mapping UI.
function buildColUI() {
  document.getElementById("colset").innerHTML = Object.entries(DEFS)
    .map(function (e) {
      return (
        "<div><label>" +
        e[1].l +
        '</label><input id="col-' +
        e[0] +
        '" value="' +
        COL[e[0]] +
        '"></div>'
      );
    })
    .join("");
}
function saveCols() {
  Object.keys(DEFS).forEach(function (k) {
    var el = document.getElementById("col-" + k);
    if (el) COL[k] = el.value.trim();
  });
  if (trades.length) renderAll();
  alert("Saved!");
}
function resetCols() {
  Object.entries(DEFS).forEach(function (e) {
    COL[e[0]] = e[1].d;
  });
  buildColUI();
}
