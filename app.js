/* Star Map Studio — page logic.
 * Loads data/stars.json, computes the sky for the chosen moment & place
 * with astro.js (the same code covered by test/astro.test.js), and paints
 * the poster on canvas. Preview = 1000x1250 + watermark. HD = 2400x3000,
 * unlocked by a license key (see verifyLicense below).
 */
"use strict";

/* ---------------- i18n ---------------- */
var I18N = {
  en: {
    tagline: "REAL SKY · REAL MATH · INSTANT",
    secMoment: "1 · THE MOMENT", date: "Date", time: "Time (local)", quick: "Quick places",
    lat: "Latitude °", lon: "Longitude °", offset: "UTC offset",
    offsetNote: "Presets use standard time; daylight saving is not applied. For a summer date, add +1 to the offset if your city was on daylight time.",
    placeName: "Place name (printed on the poster)", message: "Your line (printed on the poster)",
    secStyle: "2 · STYLE", optLines: "Constellation lines", optLabels: "Star names", optMW: "Milky Way",
    render: "Generate my star map",
    secBuy: "3 · GET THE HD POSTER", priceNote: "Black Friday · one-time",
    buyNote: "The preview above is free. Pay once to unlock the full-resolution 2400 × 3000 print file — no watermark, ready for any print shop.",
    buy: "Buy & unlock HD — $9.99",
    keyLabel: "Already bought? Paste your license key",
    unlock: "Unlock HD download", download: "Download HD PNG (2400 × 3000)",
    honest: "Every star on this poster is placed by real astronomy: 772 bright stars from a professional catalogue (SIMBAD positions), converted to the sky over your place at your moment, in your browser. Nothing is pasted in.",
    footer: "Star Map Studio · Computed locally in your browser · Star data: Swiss Ephemeris fixed-star catalogue (SIMBAD, ICRS/J2000), magnitudes ≤ 4.85 · Milky Way band follows the true galactic plane; its glow is artistic.",
    statStars: "stars above the horizon", statBrightest: "brightest", statLST: "local sidereal time",
    keyOk: "Unlocked — your HD file is ready below.",
    keyBad: "That key did not check out. Use the key from your Gumroad receipt.",
    custom: "Custom"
  },
  zh: {
    tagline: "真实星空 · 真实计算 · 即时生成",
    secMoment: "1 · 那个时刻", date: "日期", time: "时间（当地）", quick: "快捷地点",
    lat: "纬度 °", lon: "经度 °", offset: "UTC 时差",
    offsetNote: "预设城市按标准时间计算，不含夏令时；若日期在夏令时期间，请把时差 +1。",
    placeName: "地点名（印在海报上）", message: "纪念文案（印在海报上）",
    secStyle: "2 · 样式", optLines: "星座连线", optLabels: "星名标注", optMW: "银河",
    render: "生成我的星空图",
    secBuy: "3 · 获取高清海报", priceNote: "黑五价 · 一次性",
    buyNote: "上方预览免费。一次付费解锁 2400 × 3000 全分辨率印刷文件，无水印，可直接送印。",
    buy: "购买并解锁高清 — $9.99",
    keyLabel: "已经买了？粘贴许可证密钥",
    unlock: "解锁高清下载", download: "下载高清 PNG（2400 × 3000）",
    honest: "这张海报上的每一颗星都由真实天文计算定位：专业星表（SIMBAD 坐标）中 772 颗亮星，按你选定的时刻与地点在浏览器里实时换算。没有任何贴图造假。",
    footer: "Star Map Studio · 全部计算在本地浏览器完成 · 星表：Swiss Ephemeris 定星表（SIMBAD，ICRS/J2000），星等 ≤ 4.85 · 银河带按真实银道面位置绘制，光晕为美术渲染。",
    statStars: "颗星在地平线以上", statBrightest: "最亮", statLST: "当地恒星时",
    keyOk: "已解锁——高清文件可从下方下载。",
    keyBad: "密钥校验未通过，请使用 Gumroad 收据里的密钥。",
    custom: "自定义"
  }
};
var lang = "en";
function t(k) { return I18N[lang][k] || I18N.en[k] || k; }

/* ---------------- presets ---------------- */
var PRESETS = [
  { en: "London", zh: "伦敦", lat: 51.5074, lon: -0.1278, off: 0 },
  { en: "New York", zh: "纽约", lat: 40.7128, lon: -74.0060, off: -5 },
  { en: "Los Angeles", zh: "洛杉矶", lat: 34.0522, lon: -118.2437, off: -8 },
  { en: "Paris", zh: "巴黎", lat: 48.8566, lon: 2.3522, off: 1 },
  { en: "Tokyo", zh: "东京", lat: 35.6762, lon: 139.6503, off: 9 },
  { en: "Sydney", zh: "悉尼", lat: -33.8688, lon: 151.2093, off: 10 },
  { en: "Beijing", zh: "北京", lat: 39.9042, lon: 116.4074, off: 8 },
  { en: "Guangzhou", zh: "广州", lat: 23.1291, lon: 113.2644, off: 8 }
];

/* ---------------- state ---------------- */
var catalog = null;          // data/stars.json
var starById = {};
var purchased = false;       // set by verifyLicense()
var currentModel = null;

function $(id) { return document.getElementById(id); }

/* ---------------- model ---------------- */
function readForm() {
  return {
    date: $("fDate").value, time: $("fTime").value || "21:00",
    lat: parseFloat($("fLat").value), lon: parseFloat($("fLon").value),
    off: parseFloat($("fOffset").value) || 0,
    place: $("fPlace").value.trim(), msg: $("fMsg").value.trim(),
    lines: $("optLines").checked, labels: $("optLabels").checked, mw: $("optMW").checked
  };
}

function computeModel(f) {
  // local wall time -> UTC instant
  var parts = f.date.split("-").map(Number);
  var tp = f.time.split(":").map(Number);
  var utcMs = Date.UTC(parts[0], parts[1] - 1, parts[2], tp[0], tp[1] || 0) - f.off * 3600000;
  var jd = Astro.julianDay(new Date(utcMs));
  var lst = Astro.lstDeg(jd, f.lon);

  var visible = [], brightest = null;
  for (var i = 0; i < catalog.stars.length; i++) {
    var s = catalog.stars[i];
    var hz = Astro.altAz(s.ra, s.dec, lst, f.lat);
    if (hz.alt <= 0) continue;
    var p = Astro.project(hz.alt, hz.az);
    var v = { s: s, alt: hz.alt, az: hz.az, x: p.x, y: p.y, r: p.r };
    visible.push(v);
    if (!brightest || s.m < brightest.s.m) brightest = v;
  }
  var posById = {};
  visible.forEach(function (v) { posById[v.s.id] = v; });

  var lineSegs = [];
  if (f.lines) {
    catalog.lines.forEach(function (chain) {
      for (var i = 0; i + 1 < chain.p.length; i++) {
        var a = posById[chain.p[i]], b = posById[chain.p[i + 1]];
        if (a && b) lineSegs.push([a, b]);
      }
    });
  }
  var mwSegs = [];
  if (f.mw) {
    Astro.milkyWaySegments(lst, f.lat, 3).forEach(function (seg) {
      var run = [];
      seg.forEach(function (hz) {
        if (hz.alt <= 0.5) { if (run.length > 1) mwSegs.push(run); run = []; return; }
        var p = Astro.project(hz.alt, hz.az);
        if (run.length) {
          var last = run[run.length - 1];
          if (Math.hypot(p.x - last.x, p.y - last.y) > 0.45) { if (run.length > 1) mwSegs.push(run); run = []; }
        }
        run.push(p);
      });
      if (run.length > 1) mwSegs.push(run);
    });
  }
  return {
    form: f, lst: lst, visible: visible, brightest: brightest,
    lineSegs: lineSegs, mwSegs: mwSegs,
    localDate: { y: parts[0], m: parts[1], d: parts[2] }, localTime: f.time
  };
}

/* ---------------- poster painting ---------------- */
var MONTHS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
function fmtCoord(lat, lon) {
  return Math.abs(lat).toFixed(4) + "° " + (lat >= 0 ? "N" : "S") + ", " +
         Math.abs(lon).toFixed(4) + "° " + (lon >= 0 ? "E" : "W");
}
function sparkle(ctx, x, y, s, color) {
  ctx.save(); ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill(); ctx.restore();
}

function paint(ctx, W, H, model, watermark) {
  var s = W / 1000;                       // scale unit (preview W=1000)
  var cx = W / 2, cy = H * 0.395, R = W * 0.395;

  /* sky background */
  var bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#05081f"); bg.addColorStop(0.45, "#0b123c"); bg.addColorStop(1, "#141d55");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  var glow = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.25);
  glow.addColorStop(0, "rgba(88,110,220,0.20)"); glow.addColorStop(1, "rgba(88,110,220,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();

  /* nebula tint (artistic colour wash, not fake stars) */
  var neb1 = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.3, 10, cx - R * 0.4, cy - R * 0.3, R * 0.9);
  neb1.addColorStop(0, "rgba(120,90,200,0.10)"); neb1.addColorStop(1, "rgba(120,90,200,0)");
  ctx.fillStyle = neb1; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  var neb2 = ctx.createRadialGradient(cx + R * 0.5, cy + R * 0.45, 10, cx + R * 0.5, cy + R * 0.45, R * 0.8);
  neb2.addColorStop(0, "rgba(60,140,200,0.09)"); neb2.addColorStop(1, "rgba(60,140,200,0)");
  ctx.fillStyle = neb2; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  /* altitude circles */
  ctx.strokeStyle = "rgba(230,225,200,0.10)"; ctx.lineWidth = 1 * s;
  [1 / 3, 2 / 3].forEach(function (f) {
    ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, Math.PI * 2); ctx.stroke();
  });

  /* Milky Way — true galactic plane, artistic glow */
  if (model.mwSegs.length) {
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    var passes = [
      [R * 0.17, "rgba(180,198,255,0.045)"],
      [R * 0.09, "rgba(196,214,255,0.060)"],
      [R * 0.035, "rgba(232,240,255,0.085)"]
    ];
    passes.forEach(function (pass) {
      ctx.strokeStyle = pass[1]; ctx.lineWidth = pass[0];
      model.mwSegs.forEach(function (seg) {
        ctx.beginPath();
        seg.forEach(function (p, i) {
          var x = cx + p.x * R, y = cy + p.y * R;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
    });
  }

  /* constellation lines */
  if (model.lineSegs.length) {
    ctx.strokeStyle = "rgba(216,182,80,0.50)"; ctx.lineWidth = 1.3 * s;
    ctx.beginPath();
    model.lineSegs.forEach(function (seg) {
      ctx.moveTo(cx + seg[0].x * R, cy + seg[0].y * R);
      ctx.lineTo(cx + seg[1].x * R, cy + seg[1].y * R);
    });
    ctx.stroke();
  }

  /* stars */
  model.visible.forEach(function (v) {
    var x = cx + v.x * R, y = cy + v.y * R;
    var r = Astro.starSize(v.s.m) * s * 1.15;
    if (v.s.m < 1.3) {
      var halo = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
      halo.addColorStop(0, "rgba(255,250,225,0.20)"); halo.addColorStop(1, "rgba(255,250,225,0)");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = Astro.starAlpha(v.s.m);
    ctx.fillStyle = "#f7f3e2";
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, r), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });

  /* star name labels (brightest only) — poster text stays English:
     the poster is the export product, UI language does not alter it. */
  if (model.form.labels) {
    ctx.font = "600 " + (12.5 * s) + "px 'Avenir Next','Segoe UI',sans-serif";
    ctx.fillStyle = "rgba(238,229,196,0.88)";
    model.visible.forEach(function (v) {
      if (!v.s.n || v.s.m > 1.7 || v.alt < 8 || v.r > 0.92) return;
      ctx.fillText(v.s.n, cx + v.x * R + 7 * s, cy + v.y * R - 5 * s);
    });
  }
  ctx.restore();

  /* rings + cardinals */
  ctx.strokeStyle = "rgba(212,175,55,0.9)"; ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.arc(cx, cy, R + 9 * s, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "rgba(212,175,55,0.45)"; ctx.lineWidth = 1 * s;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R + 17 * s, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(212,175,55,0.22)"; ctx.stroke();
  ctx.fillStyle = "rgba(216,192,106,0.95)";
  ctx.font = "600 " + (15 * s) + "px 'Avenir Next','Segoe UI',sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("N", cx, cy - R - 30 * s);
  ctx.fillText("S", cx, cy + R + 30 * s);
  ctx.fillText("E", cx + R + 30 * s, cy);
  ctx.fillText("W", cx - R - 30 * s, cy);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";

  /* corner ornaments */
  [[40, 44], [1000 - 40, 44], [40, 1250 - 40], [1000 - 40, 1250 - 40]].forEach(function (c) {
    sparkle(ctx, c[0] * s, c[1] * s, 9 * s, "rgba(212,175,55,0.75)");
  });

  /* bottom text block */
  var f = model.form, d = model.localDate;
  var ty = H * 0.848;
  ctx.strokeStyle = "rgba(212,175,55,0.6)"; ctx.lineWidth = 1 * s;
  ctx.beginPath(); ctx.moveTo(W * 0.30, ty); ctx.lineTo(W * 0.465, ty); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W * 0.535, ty); ctx.lineTo(W * 0.70, ty); ctx.stroke();
  ctx.save(); ctx.translate(cx, ty); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "rgba(212,175,55,0.9)"; ctx.fillRect(-4.5 * s, -4.5 * s, 9 * s, 9 * s); ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "#f0ead6";
  ctx.font = "italic 600 " + (43 * s) + "px Georgia,'Times New Roman',serif";
  ctx.fillText(f.msg || "The Night Sky", cx, H * 0.905);
  ctx.fillStyle = "#d8c690";
  ctx.font = "600 " + (19 * s) + "px 'Avenir Next','Segoe UI',sans-serif";
  var dateLine = d.d + " " + MONTHS[d.m - 1] + " " + d.y + "  ·  " + model.localTime;
  ctx.fillText(spaced(dateLine), cx, H * 0.938);
  ctx.fillStyle = "rgba(233,230,218,0.75)";
  ctx.font = (16 * s) + "px 'Avenir Next','Segoe UI',sans-serif";
  var placeLine = (f.place ? f.place.toUpperCase() + "  ·  " : "") + fmtCoord(f.lat, f.lon);
  ctx.fillText(spaced(placeLine), cx, H * 0.962);
  ctx.fillStyle = "rgba(233,230,218,0.4)";
  ctx.font = (10.5 * s) + "px 'Avenir Next','Segoe UI',sans-serif";
  ctx.fillText(spaced("STAR MAP STUDIO"), cx, H * 0.982);
  ctx.textAlign = "left";

  /* preview watermark */
  if (watermark) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-0.42);
    ctx.font = "700 " + (44 * s) + "px 'Avenir Next','Segoe UI',sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.textAlign = "center";
    for (var yy = -R; yy <= R; yy += 120 * s) ctx.fillText("P R E V I E W", 0, yy);
    ctx.restore();
    ctx.save();
    ctx.translate(W / 2, H * 0.9); ctx.rotate(-0.42);
    ctx.font = "700 " + (30 * s) + "px 'Avenir Next','Segoe UI',sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.textAlign = "center";
    ctx.fillText("P R E V I E W", 0, 0);
    ctx.restore();
  }
}
function spaced(str) { return str.split("").join("  "); }

/* ---------------- render / stats ---------------- */
function render() {
  if (!catalog) return;
  var f = readForm();
  if (isNaN(f.lat) || isNaN(f.lon)) return;
  currentModel = computeModel(f);
  var cv = $("poster");
  paint(cv.getContext("2d"), cv.width, cv.height, currentModel, !purchased);
  var b = currentModel.brightest;
  $("stats").innerHTML =
    "<span class='stat'><b>" + currentModel.visible.length + "</b> " + t("statStars") + "</span>" +
    (b && b.s.n ? "<span class='stat'>" + t("statBrightest") + ": <b>" + b.s.n + "</b></span>" : "") +
    "<span class='stat'>" + t("statLST") + ": <b>" + (currentModel.lst / 15).toFixed(2) + "h</b></span>";
}

/* ---------------- license / HD ----------------
 * LICENSE CHECK — production wiring (2026-11-08).
 * Calls Gumroad's license verify endpoint directly from the browser:
 * POST https://api.gumroad.com/v2/licenses/verify with
 * product_permalink=ttogyv + license_key. The endpoint needs no token
 * and answers with Access-Control-Allow-Origin: * (verified by curl),
 * so no proxy and no secret in browser code. increment_uses_count=false
 * so checking a key never burns a use. On {success:true} the caller sets
 * purchased = true, enables #btnDownload, re-renders without watermark.
 */
function verifyLicense(key) {
  key = (key || "").trim().toUpperCase();
  if (!key) return Promise.resolve(false);
  var body = "product_permalink=ttogyv" +
    "&license_key=" + encodeURIComponent(key) +
    "&increment_uses_count=false";
  return fetch("https://api.gumroad.com/v2/licenses/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body
  }).then(function (r) { return r.json(); })
    .then(function (j) { return !!(j && j.success); })
    .catch(function () { return false; });
}

function downloadHD() {
  if (!purchased || !currentModel) return;
  var cv = document.createElement("canvas");
  cv.width = 2400; cv.height = 3000;
  paint(cv.getContext("2d"), cv.width, cv.height, currentModel, false);
  cv.toBlob(function (blob) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "star-map-" + currentModel.form.date + ".png";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }, "image/png");
}

/* ---------------- UI wiring ---------------- */
function buildChips() {
  var wrap = $("presetChips");
  wrap.innerHTML = "";
  PRESETS.forEach(function (p, i) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip" + (i === 0 ? " on" : "");
    b.textContent = lang === "zh" ? p.zh : p.en;
    b.addEventListener("click", function () {
      wrap.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("on"); });
      b.classList.add("on");
      $("fLat").value = p.lat; $("fLon").value = p.lon; $("fOffset").value = p.off;
      $("fPlace").value = lang === "zh" ? p.zh : p.en;
      render();
    });
    wrap.appendChild(b);
  });
  var c = document.createElement("button");
  c.type = "button"; c.className = "chip"; c.textContent = t("custom");
  c.addEventListener("click", function () {
    wrap.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("on"); });
    c.classList.add("on"); $("fLat").focus();
  });
  wrap.appendChild(c);
}

function applyLang() {
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  $("langToggle").textContent = lang === "en" ? "中文" : "EN";
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  buildChips();
  render();
}

function init() {
  buildChips();
  ["fDate", "fTime", "fLat", "fLon", "fOffset", "fPlace", "fMsg", "optLines", "optLabels", "optMW"]
    .forEach(function (id) { $(id).addEventListener("change", render); });
  $("fMsg").addEventListener("input", render);
  $("fPlace").addEventListener("input", render);
  $("btnRender").addEventListener("click", function () {
    render();
    document.querySelector(".poster-wrap").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("langToggle").addEventListener("click", function () {
    lang = lang === "en" ? "zh" : "en";
    applyLang();
  });
  $("btnUnlock").addEventListener("click", function () {
    verifyLicense($("fKey").value).then(function (ok) {
      if (ok) {
        purchased = true;
        $("btnDownload").disabled = false;
        $("unlockMsg").textContent = t("keyOk");
        render();
      } else {
        $("unlockMsg").textContent = t("keyBad");
      }
    });
  });
  $("btnDownload").addEventListener("click", downloadHD);

  (window.__STARS ? Promise.resolve({ json: function(){ return Promise.resolve(window.__STARS); } }) : fetch("data/stars.json"))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      catalog = data;
      data.stars.forEach(function (s) { starById[s.id] = s; });
      render();
    })
    .catch(function (e) {
      $("stats").innerHTML = "<span class='stat'>Failed to load star catalogue: " + e.message + "</span>";
    });
}
document.addEventListener("DOMContentLoaded", init);
