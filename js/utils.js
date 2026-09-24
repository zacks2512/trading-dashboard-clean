// Generic helpers: number parsing, averages, emotion splitting, dates.
function pm(s) {
  var str = String(s || "").trim();
  var neg = str.charAt(0) === "(" && str.charAt(str.length - 1) === ")";
  var n =
    parseFloat(
      str
        .replace(/[$,%\s()]/g, "")
        .replace(/,/g, "")
        .replace(/[^0-9.\-]/g, ""),
    ) || 0;
  return neg ? -Math.abs(n) : n;
}
function avg(a) {
  return a.length
    ? a.reduce(function (s, v) {
        return s + v;
      }, 0) / a.length
    : 0;
}
function semo(s) {
  return (s || "")
    .split(",")
    .map(function (x) {
      return x.trim();
    })
    .filter(function (x) {
      return x && x !== "—" && x.toLowerCase() !== "no emotion";
    });
}
function bc(v) {
  return v >= 0 ? G : R;
}
function dc(id) {
  if (CX[id]) {
    CX[id].destroy();
    delete CX[id];
  }
}
function parseDate(s) {
  if (!s) return null;
  var p = s.split("/");
  if (p.length !== 3) return null;
  var day = +p[0],
    mon = +p[1] - 1,
    yr = +p[2];
  if (yr < 100) yr += 2000;
  return new Date(yr, mon, day);
}
function fmtDate(d) {
  if (!d) return "—";
  return d.getDate() + "/" + (d.getMonth() + 1) + "/" + d.getFullYear();
}
function fmtMonth(d) {
  if (!d) return "?";
  return (
    d.getFullYear() +
    "-" +
    (d.getMonth() + 1 < 10 ? "0" : "") +
    (d.getMonth() + 1)
  );
}
function weekStart(d) {
  var s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  return s;
}
function fmtWeek(d) {
  if (!d) return "?";
  var s = weekStart(d);
  var y = s.getFullYear(),
    mo = s.getMonth() + 1,
    da = s.getDate();
  return y + "-" + (mo < 10 ? "0" : "") + mo + "-" + (da < 10 ? "0" : "") + da;
}
function weekLabel(key) {
  if (!key || key === "?") return key;
  var p = key.split("-");
  if (p.length !== 3) return key;
  return p[2] + "." + p[1];
}
