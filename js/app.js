// Rendering entry point, tab switching and startup.
function renderAll() {
  ["ov0", "em0", "cf0", "pf0", "gl0", "lg0"].forEach(function (id) {
    document.getElementById(id).style.display = "none";
  });
  ["ov1", "em1", "cf1", "pf1", "gl1", "lg1"].forEach(function (id) {
    document.getElementById(id).style.display = "block";
  });
  renderOV();
  renderEM();
  renderConf();
  renderPerf();
  renderGoals();
  renderLog();
  renderStreak();
}

var TABS = [
  "overview",
  "emotions",
  "confidence",
  "perf",
  "goals",
  "log",
  "settings",
];
function sw(n) {
  document.querySelectorAll(".tab").forEach(function (t, i) {
    t.classList.toggle("active", TABS[i] === n);
  });
  document.querySelectorAll(".page").forEach(function (p) {
    p.classList.remove("active");
  });
  document.getElementById("page-" + n).classList.add("active");
}
buildColUI();
ingest(RAW_DATA, "All_Data.json");
