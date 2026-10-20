/* ═══════════════════════════════════════════════════════════════════════════════
   Shared render layer, v2.

   DRILL GRAMMAR: hover teaches, click descends.
   Hover and ⓘ give definitions. Click moves one level toward evidence and never
   sideways into interpretation. Anything clickable says so before it is clicked.

   Every string here obeys the meter-of-facts law: labels, units, provenance,
   definitions. No adjectives, no advice, no currency, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════════ */

const NS = "http://www.w3.org/2000/svg";
const CS = getComputedStyle(document.documentElement);
const T = k => CS.getPropertyValue("--" + k).trim();
const el = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
const h = (t, a = {}, html) => {
  const e = document.createElement(t);
  for (const k in a) { if (k === "class") e.className = a[k]; else e.setAttribute(k, a[k]); }
  if (html != null) e.innerHTML = html;
  return e;
};
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const int = n => Math.round(n).toLocaleString("en-US");
const pct = (n, d = 1) => (n * 100).toFixed(d) + "%";
const compact = n => n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n));
/* gaps read in the units an operator thinks in, never in raw ms */
const gapms = v => v < 60000 ? Math.round(v / 1000) + " s" : v < 3600000 ? (v / 60000).toFixed(v < 600000 ? 1 : 0) + " min" : (v / 3600000).toFixed(1) + " h";
const signed = n => (n > 0 ? "+" : n < 0 ? "−" : "") + int(Math.abs(n));
const holderName = hd => hd.instance + " / " + hd.dp_rank + " / g" + hd.group;
const qs = k => new URLSearchParams(location.search).get(k);

/* ── destinations. Drill pages live under parents, never in the rail. ────── */
const RAIL = [
  { grp: null, items: [
    ["index.html", "Dashboard", "≡"],
    ["reports.html", "Reports", "▤"],
    ["holders.html", "Holders", "☷"],
    ["health.html", "Health", "◑"]
  ]},
  { grp: "system", items: [
    ["declared-inputs.html", "Declared inputs", "⊟"],
    ["about.html", "About", "ⓘ"]
  ]}
];

function chipEl(state, value, provenance) {
  const PV = { fine: "measured", impaired: "measured", unexamined: "no pass", indeterminate: "no basis", unobserved: "not collected" };
  const c = h("span", { class: "chip chip--" + state });
  c.appendChild(h("span", { class: "chip__mark" }));
  c.appendChild(h("span", { class: "chip__s" }, state));
  if (value != null) c.appendChild(h("span", { class: "chip__v" }, value));
  c.appendChild(h("span", { class: "chip__pv" }, provenance || PV[state]));
  return c;
}

function info(key, label) {
  const d = DEFS[key];
  if (!d) return h("span");
  const w = h("span", { class: "info" });
  const b = h("button", { class: "info__btn", type: "button", "aria-label": "Definition: " + (label || key) }, "i");
  const card = h("div", { class: "info__card", role: "tooltip" });
  card.innerHTML = "<dl><dt>measures</dt><dd>" + d.measures + "</dd><dt>computed</dt><dd>" + d.computed +
    "</dd><dt>basis</dt><dd>" + d.basis + "</dd><dt>bound</dt><dd>" + d.bound + "</dd></dl>";
  w.appendChild(b); w.appendChild(card);
  return w;
}

function stampHTML(extra) {
  return "window <b>" + CTX.window.start + "→" + CTX.window.end + "</b> · pass <b>" +
    CTX.pass.at + "</b> · <b>" + CTX.pass.semantics + "</b>" + (extra ? " · " + extra : "");
}

/* Section heads take the serif display tier, and carry a stamp ONLY when they
   deviate from the document's canonical one. Conformity is silent so deviation is
   visible; during fill, per-section stamps reappearing IS the progress indicator. */
function secHead(title, defKey, deviation, chip, tier) {
  const head = h("div", { class: "sec__head" });
  const t = h("div", { class: "sec__title" });
  /* tier 1 leads, tier 2 is serif at reduced scale, tier 3 is the quiet mono
     register. Progressive density so the page has one lead, not six features. */
  t.appendChild(h("h2", { class: tier === 3 ? "plate__t" : tier === 2 ? "sec__h sec__h--2" : "sec__h" }, title));
  if (defKey) t.appendChild(info(defKey, title));
  if (chip) t.appendChild(chip);
  head.appendChild(t);
  if (deviation) head.appendChild(h("p", { class: "stamp stamp--dev" }, deviation));
  return head;
}

/* the document's canonical stamp, declared once under the title */
function canonStamp(extra) {
  const p = h("p", { class: "canon" });
  p.innerHTML = "this document: " + stampHTML(extra);
  return p;
}

/* ── frame ──────────────────────────────────────────────────────────────── */
function frame(current, opts) {
  opts = opts || {};
  const app = document.querySelector(".app");

  /* rail */
  const rail = h("nav", { class: "rail", "aria-label": "Destinations" });
  const tog = h("button", { class: "rail__toggle", type: "button", "aria-label": "Collapse rail" }, "‹‹");
  tog.addEventListener("click", () => {
    app.classList.toggle("is-collapsed");
    tog.textContent = app.classList.contains("is-collapsed") ? "››" : "‹‹";
  });
  rail.appendChild(tog);
  RAIL.forEach(g => {
    const box = h("div", { class: "rail__grp" });
    if (g.grp) box.appendChild(h("p", { class: "rail__gl" }, g.grp));
    g.items.forEach(([href, label, glyph]) => {
      const a = h("a", { class: "rail__i", href, title: label });
      a.appendChild(h("span", { class: "rail__g", "aria-hidden": "true" }, glyph));
      a.appendChild(h("span", { class: "rail__t" }, label));
      if (label === current || (opts.parent && label === opts.parent)) a.setAttribute("aria-current", "page");
      box.appendChild(a);
    });
    rail.appendChild(box);
  });
  app.prepend(rail);

  /* top bar */
  const main = document.querySelector(".main");
  const bar = h("header", { class: "topbar" });
  const r1 = h("div", { class: "topbar__r1" });
  const f = h("div", { class: "topbar__fleet" });
  f.appendChild(h("span", { class: "topbar__mark" }, "infertap"));
  f.appendChild(h("span", { class: "topbar__f" }, CTX.fleet));
  r1.appendChild(f);
  const right = h("div", { class: "topbar__right" });
  if (opts.newdata !== false) {
    const nd = h("button", { class: "newdata", type: "button" });
    nd.appendChild(h("span", { class: "newdata__d" }));
    nd.appendChild(h("span", {}, "new data to " + CTX.pending.through));
    nd.addEventListener("click", () => {
      nd.replaceChildren(h("span", {}, "at " + CTX.pending.through));
      nd.disabled = true; nd.style.borderColor = T("rule"); nd.style.color = T("graphite");
    });
    right.appendChild(nd);
  }
  const ph = h("button", { class: "palette-hint", type: "button" });
  ph.innerHTML = "<span class='kbd'>⌘</span><span class='kbd'>K</span>";
  ph.addEventListener("click", openPalette);
  right.appendChild(ph);
  r1.appendChild(right);
  bar.appendChild(r1);
  /* ONE instrument strip on the dark chrome, and it carries only wall-clock-live
     facts: LIVE, the countdown, ingest and health. Every pass-clock accounting
     figure lives on the light canvas below. A number never crosses that line. */
  const strip = statusline(opts.status);
  const live = h("span", { class: "live" });
  live.appendChild(h("span", { class: "live__d" + (opts.idle ? " live__d--idle" : "") }));
  live.appendChild(h("span", {}, opts.idle ? "idle" : "live"));
  const clock = h("span", { class: "live__t" });
  live.appendChild(clock);
  strip.prepend(live);
  bar.appendChild(strip);
  main.prepend(bar);
  startClock(clock);
  buildPalette();
}

/* the freshness clock, the only self-moving element in the product */
let CLOCK_T = null;
function startClock(node) {
  if (CLOCK_T) clearInterval(CLOCK_T);
  let left = 236;
  const tick = () => {
    node.textContent = "next tick " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
    left = left > 0 ? left - 1 : 240;
  };
  tick();
  if (!reduced) CLOCK_T = setInterval(tick, 1000);
}

/* the status line: labeled facts, never a verdict about them */
function statusline(st) {
  const s = st || CTX.status;
  const box = h("div", { class: "statusline" });
  const items = [
    ["segment", s.last_segment == null ? "none yet" : s.last_segment + " · " + s.last_segment_at],
    ["lag", s.lag == null ? "none" : s.lag],
    ["horizon", CTX.raw_horizon_days + " d"]
  ];
  items.forEach(([k, v]) => {
    const i = h("span", { class: "statusline__i" });
    i.appendChild(h("span", { class: "statusline__k" }, k));
    i.appendChild(h("span", { class: "statusline__v" }, v));
    box.appendChild(i);
  });
  /* truncated to 8 chars, full value on hover */
  const d = h("span", { class: "statusline__i" });
  d.appendChild(h("span", { class: "statusline__k" }, "discriminator"));
  d.appendChild(h("span", { class: "statusline__v trunc", title: CTX.pass.discriminator },
    CTX.pass.discriminator.slice(0, 8) + "…"));
  box.appendChild(d);
  return box;
}

/* ── command palette: mirrors the rail, plus jump to holder ──────────────── */
let PAL;
function buildPalette() {
  PAL = h("div", { class: "pal", role: "dialog", "aria-label": "Commands" });
  const box = h("div", { class: "pal__box" });
  const input = h("input", { class: "pal__in", type: "text", placeholder: "go to a destination, or a holder by instance" });
  const list = h("ul", { class: "pal__l" });
  box.appendChild(input); box.appendChild(list);
  PAL.appendChild(box);
  document.body.appendChild(PAL);

  const dests = RAIL.flatMap(g => g.items.map(([href, label]) => ({ href, label, grp: g.grp || "destination" })));
  function draw(q) {
    const s = (q || "").toLowerCase().trim();
    const hits = dests.filter(d => d.label.toLowerCase().includes(s));
    const holders = s.length >= 2
      ? HOLDERS.filter(x => holderName(x).toLowerCase().includes(s) || x.id.includes(s)).slice(0, 6)
      : [];
    list.replaceChildren();
    hits.forEach(d => {
      const a = h("a", { class: "pal__i", href: d.href });
      a.appendChild(h("span", {}, d.label));
      a.appendChild(h("span", { class: "pal__g" }, d.grp));
      list.appendChild(a);
    });
    holders.forEach(x => {
      const a = h("a", { class: "pal__i", href: "holder.html?id=" + x.id });
      a.appendChild(h("span", {}, holderName(x)));
      a.appendChild(h("span", { class: "pal__g" }, "holder"));
      list.appendChild(a);
    });
    if (!hits.length && !holders.length) list.appendChild(h("li", { class: "pal__i" }, "no match"));
  }
  input.addEventListener("input", () => draw(input.value));
  PAL.addEventListener("click", e => { if (e.target === PAL) closePalette(); });
  addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
    if (e.key === "Escape") closePalette();
  });
  PAL._draw = draw; PAL._input = input;
  draw("");
}
function openPalette() { PAL.classList.add("is-open"); PAL._input.value = ""; PAL._draw(""); PAL._input.focus(); }
function closePalette() { PAL.classList.remove("is-open"); }

/* ── breadcrumbs. Every drill page names its parent section. ─────────────── */
function crumbs(trail, level) {
  const c = h("nav", { class: "crumbs", "aria-label": "Breadcrumb" });
  trail.forEach((t, i) => {
    if (i) c.appendChild(h("span", { class: "crumbs__s" }, "›"));
    if (t.href) c.appendChild(h("a", { href: t.href }, t.label));
    else c.appendChild(h("span", { style: "color:var(--ink)" }, t.label));
  });
  if (level != null) c.appendChild(h("span", { class: "level" }, "level " + level));
  return c;
}

/* ── trend. Appears exactly ONCE in the product, on the document. ─────────── */
function trend(mount, o) {
  const pts = o.points, seams = o.seams || [], thr = o.threshold;
  const W = 1000, H = o.height || 250;
  /* the live edge reserves a gutter for the current figure, set at the now end of
     its own history rather than floating above it as an isolated numeral */
  const edge = o.liveEdge || null;
  const padT = 26, padR = edge ? 214 : 76, ribbonH = 14, gap = 8, axisH = 24;
  const plotH = H - padT - axisH - ribbonH - gap, plotW = W - padR;
  const yMax = Math.max(thr * 1.3, ...pts.map(p => p.value)) * 1.1;
  const X = i => (i / (pts.length - 1)) * plotW;
  const Y = v => padT + plotH - (v / yMax) * plotH;
  const ribY = padT + plotH + gap;

  const svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img" });
  const ttl = el("title"); ttl.textContent = o.title; svg.appendChild(ttl);

  const defs = el("defs");
  const p = el("pattern", { id: o.id + "-h", width: "6", height: "6", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  p.appendChild(el("rect", { width: "6", height: "6", fill: T("paper-2") }));
  p.appendChild(el("line", { x1: "0", y1: "0", x2: "0", y2: "6", stroke: T("graphite"), "stroke-width": "1.6", opacity: "0.45" }));
  defs.appendChild(p); svg.appendChild(defs);

  /* unexamined regions hatch. They are never rendered as zero. */
  let run = null;
  const runs = [];
  pts.forEach((q, i) => {
    if (!q.examined && run === null) run = i;
    if ((q.examined || i === pts.length - 1) && run !== null) { runs.push([run, q.examined ? i - 1 : i]); run = null; }
  });
  runs.forEach(([a, b], i) => {
    const x0 = X(a), x1 = X(Math.min(b + 1, pts.length - 1));
    svg.appendChild(el("rect", { x: String(x0), y: String(padT), width: String(Math.max(2, x1 - x0)), height: String(plotH + gap + ribbonH), fill: "url(#" + o.id + "-h)" }));
    if (i === 0 && (x1 - x0) > 90) {
      const t = el("text", { x: String(x0 + 6), y: String(padT + 12), fill: T("graphite"), "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.3" });
      t.textContent = "UNEXAMINED";
      svg.appendChild(t);
    }
  });

  /* the series, split at breaking seams */
  const ex = pts.filter(q => q.examined);
  const breaks = seams.filter(s => s.breaks).map(s => s.day).sort((a, b) => a - b);
  const segs = []; let start = ex.length ? ex[0].day : 0;
  breaks.forEach(b => { segs.push(ex.filter(q => q.day >= start && q.day <= b)); start = b + 1; });
  segs.push(ex.filter(q => q.day >= start));
  segs.forEach(seg => {
    if (seg.length < 2) return;
    const d = seg.map((q, i) => (i ? "L" : "M") + X(q.day) + " " + Y(q.value)).join(" ");
    const a = X(seg[0].day), b = X(seg[seg.length - 1].day);
    svg.appendChild(el("path", { d: d + " L " + b + " " + (padT + plotH) + " L " + a + " " + (padT + plotH) + " Z", fill: T("petrol"), opacity: "0.88" }));
    svg.appendChild(el("path", { d, fill: "none", stroke: T("ink"), "stroke-width": "1.4" }));
  });

  /* their declared threshold, drawn as their thin labeled rule */
  const ty = Y(thr);
  svg.appendChild(el("line", { x1: "0", y1: String(ty), x2: String(plotW), y2: String(ty), stroke: T("ink"), "stroke-width": "1", "stroke-dasharray": "1 3" }));
  const l1 = el("text", { x: String(edge ? plotW - 4 : plotW + 6), y: String(ty - 5),
    fill: T("ink"), "text-anchor": edge ? "end" : "start", "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.2" });
  l1.textContent = "YOUR " + pct(thr, 2) + " DECLARED"; svg.appendChild(l1);

  /* coverage rides as a quiet ribbon under the series, never a second line */
  svg.appendChild(el("rect", { x: "0", y: String(ribY), width: String(plotW), height: String(ribbonH), fill: T("paper-2") }));
  const bw = plotW / pts.length;
  pts.forEach(q => {
    if (!q.examined) return;
    svg.appendChild(el("rect", { x: String(Math.max(0, X(q.day) - bw / 2)), y: String(ribY), width: String(bw + 0.6), height: String(ribbonH),
      fill: q.coverage < 0.75 ? T("crimson") : T("seq-4"), opacity: String(0.22 + q.coverage * 0.66) }));
  });
  const rl = el("text", { x: String(edge ? plotW + 8 : plotW + 6), y: String(ribY + 10), fill: T("graphite"), "font-family": "var(--mono)", "font-size": "8", "letter-spacing": "1.1" });
  rl.textContent = "COVERAGE"; svg.appendChild(rl);

  /* ── the live edge ─────────────────────────────────────────────────────────
     A dot on the last observed point, a hairline leader out to the gutter, and the
     current value set large exactly at that point's height. The figure is the
     endpoint of the series, so it is drawn as one. */
  if (edge) {
    const last = [...pts].reverse().find(q => q.examined);
    if (last) {
      const ex = X(last.day), ey = Y(last.value);
      svg.appendChild(el("line", { x1: String(ex), y1: String(ey), x2: String(plotW + 16), y2: String(ey),
        stroke: T("ink"), "stroke-width": "1", "stroke-dasharray": "1 2" }));
      svg.appendChild(el("circle", { cx: String(ex), cy: String(ey), r: "3.5", fill: T("ink") }));
      const big = el("text", { x: String(plotW + 22), y: String(ey + 15), fill: T("ink"),
        "font-family": "var(--display)", "font-size": "46", "font-weight": "600", "letter-spacing": "-1" });
      big.textContent = edge.value;
      svg.appendChild(big);
      const u1 = el("text", { x: String(plotW + 23), y: String(ey + 31), fill: T("graphite"),
        "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.2" });
      u1.textContent = edge.unit; svg.appendChild(u1);
      const u2 = el("text", { x: String(plotW + 23), y: String(ey + 44), fill: T("pencil"),
        "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.2" });
      u2.textContent = edge.sub; svg.appendChild(u2);
    }
  }

  /* seam daggers. Click descends to the marker. */
  seams.forEach(s => {
    const mx = X(s.day);
    svg.appendChild(el("line", { x1: String(mx), y1: String(padT - 10), x2: String(mx), y2: String(ribY + ribbonH),
      stroke: T("ink"), "stroke-width": s.breaks ? "1.3" : "1", "stroke-dasharray": s.breaks ? "" : "2 3" }));
    const a = el("a", { href: "marker.html?id=" + s.id });
    const g = el("text", { x: String(mx), y: String(padT - 14), fill: T("ink"), "text-anchor": "middle",
      "font-family": "var(--mono)", "font-size": "11", "font-weight": "600", style: "cursor:pointer" });
    g.textContent = s.dagger;
    const tt = el("title"); tt.textContent = s.label + ". Open marker.";
    g.appendChild(tt); a.appendChild(g); svg.appendChild(a);
  });

  [0, 30, 60, pts.length - 1].forEach(i => {
    const t = el("text", { x: String(X(i)), y: String(ribY + ribbonH + 15), fill: T("pencil"),
      "text-anchor": i === 0 ? "start" : (i === pts.length - 1 ? "end" : "middle"), "font-family": "var(--mono)", "font-size": "9" });
    t.textContent = i === pts.length - 1 ? "today" : "−" + (pts.length - 1 - i) + " d";
    svg.appendChild(t);
  });
  const yl = el("text", { x: "0", y: String(padT - 14), fill: T("graphite"), "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.2" });
  yl.textContent = "≥ FRACTION OF STORED MASS"; svg.appendChild(yl);

  /* crosshair. Hover reads the day; click descends to it. */
  const cross = el("line", { y1: String(padT - 10), y2: String(ribY + ribbonH), stroke: T("ink"), "stroke-width": "1", opacity: "0" });
  const dot = el("circle", { r: "3", fill: T("ink"), opacity: "0" });
  svg.appendChild(cross); svg.appendChild(dot);
  const hit = el("rect", { x: "0", y: "0", width: String(plotW), height: String(H), fill: "transparent", style: "cursor:pointer" });
  svg.appendChild(hit);

  const wrap = h("div", { class: "chart" });
  wrap.appendChild(svg);
  const read = h("p", { class: "stamp", style: "margin:.5rem 0 0;min-height:1.2em" });
  mount.appendChild(wrap); mount.appendChild(read);

  let cur = null;
  const dayAt = e => {
    const r = svg.getBoundingClientRect();
    const d = Math.round(((e.clientX - r.left) / r.width * W) / plotW * (pts.length - 1));
    return Math.max(0, Math.min(pts.length - 1, d));
  };
  hit.addEventListener("mousemove", e => {
    cur = dayAt(e);
    const q = pts[cur];
    cross.setAttribute("x1", String(X(cur))); cross.setAttribute("x2", String(X(cur))); cross.setAttribute("opacity", "0.5");
    if (q.examined) {
      dot.setAttribute("cx", String(X(cur))); dot.setAttribute("cy", String(Y(q.value))); dot.setAttribute("opacity", "1");
      read.innerHTML = q.date + " · <b>≥ " + pct(q.value, 3) + "</b> of stored mass · coverage <b>" +
        pct(q.coverage, 1) + "</b> token-weighted · click for the day";
    } else {
      dot.setAttribute("opacity", "0");
      read.innerHTML = q.date + " · <b>unexamined</b> · no pass has covered this day";
    }
  });
  hit.addEventListener("mouseleave", () => { cross.setAttribute("opacity", "0"); dot.setAttribute("opacity", "0"); read.innerHTML = ""; });
  hit.addEventListener("click", e => { const d = dayAt(e); if (pts[d].examined) location.href = "day.html?date=" + pts[d].date; });
}

/* ── the recovery curve ────────────────────────────────────────────────────
   x is the gap on a log axis, seconds to the attribution window; y is the share
   of classified stores whose gap was at or under x. Read it as "retain this much
   longer, recover this much".

   FOUR RULES IT INHERITS FROM THE TREND, deliberately, so it reads as the same
   instrument rather than a second one:

   - STEPS, NEVER SPLINES. The underlying data is quantiles. A smooth curve
     between them asserts a continuum nobody measured, which is the same species
     of claim as drawing across a seam.
   - THE RIGHT EDGE IS A WALL. Past w_refetch the class does not exist, so the
     plot hatches exactly as unexamined days hatch. It is not a plateau at 100%.
   - COLOUR CARRIES STATE, NOT IDENTITY. Every series is the one register hue at
     varying weight, labelled at its own end. A second hue here would mean the
     cuts differed in kind, and they do not.
   - SAMPLES RIDE WITH THE VALUES. A cut under the floor refuses in place. */
function recovery(mount, o) {
  const series = o.series, cens = o.censoredAt;
  const W = 1000, H = o.height || 300;
  const padT = 22, padR = 190, padL = 46, axisH = 30;
  const plotH = H - padT - axisH, plotW = W - padR - padL;

  /* TIME IS LOG, CAPACITY IS LINEAR, and the difference is not cosmetic. Gaps
     span seconds to a day, so only a log axis shows both ends. Capacity is a
     linear resource somebody buys, and drawing it log would flatter the far end
     of a purchase curve, which is the one distortion this axis must not have. */
  /* THE LOW BOUND FOLLOWS THE DATA. A fixed 5 s floor is right for the register
     classes, whose gaps start in seconds, and wrong for cold, whose gaps start
     at w_refetch by definition: on a fixed axis that curve spends six decades
     showing nothing and then crushes its entire shape into the last eighth. The
     axis is a reading instrument, not a constant. */
  const lo = Math.max(5000, Math.min(...series.map(s2 => s2.pts[0].x)) / 3);
  const lx = v => Math.log(Math.max(v, lo));
  const X = v => padL + (lx(v) - lx(lo)) / (lx(cens) - lx(lo)) * plotW;
  const Y = q => padT + plotH - q * plotH;

  const svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img" });
  const ttl = el("title"); ttl.textContent = o.title; svg.appendChild(ttl);

  const defs = el("defs");
  const p = el("pattern", { id: "rec-h", width: "6", height: "6", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  p.appendChild(el("rect", { width: "6", height: "6", fill: T("paper-2") }));
  p.appendChild(el("line", { x1: "0", y1: "0", x2: "0", y2: "6", stroke: T("graphite"), "stroke-width": "1.6", opacity: "0.45" }));
  defs.appendChild(p); svg.appendChild(defs);

  const ticks = [[10000, "10s"], [60000, "1m"], [600000, "10m"], [3600000, "1h"], [21600000, "6h"], [43200000, "12h"], [86400000, "24h"], [172800000, "48h"], [259200000, "72h"]];
  ticks.forEach(([v, lab]) => {
    if (v > cens || v < lo) return;
    svg.appendChild(el("line", { x1: String(X(v)), y1: String(padT), x2: String(X(v)), y2: String(padT + plotH), stroke: T("rule"), "stroke-width": "1" }));
    const t = el("text", { x: String(X(v)), y: String(padT + plotH + 16), fill: T("graphite"),
      "text-anchor": "middle", "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.1" });
    t.textContent = lab; svg.appendChild(t);
  });
  [0.25, 0.5, 0.75, 1].forEach(q => {
    svg.appendChild(el("line", { x1: String(padL), y1: String(Y(q)), x2: String(padL + plotW), y2: String(Y(q)),
      stroke: T("rule"), "stroke-width": "1", "stroke-dasharray": q === 0.5 ? "" : "1 3" }));
    const t = el("text", { x: String(padL - 8), y: String(Y(q) + 3), fill: T("graphite"),
      "text-anchor": "end", "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.1" });
    t.textContent = (q * 100) + "%"; svg.appendChild(t);
  });

  /* past the attribution window the class does not exist. Hatch, never plateau. */
  svg.appendChild(el("rect", { x: String(padL + plotW), y: String(padT), width: String(padR - 16), height: String(plotH), fill: "url(#rec-h)" }));
  const cl = el("text", { x: String(padL + plotW + 6), y: String(padT + 12), fill: T("graphite"),
    "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.2" });
  cl.textContent = "BEYOND examined_history"; svg.appendChild(cl);
  const cl2 = el("text", { x: String(padL + plotW + 6), y: String(padT + 25), fill: T("pencil"),
    "font-family": "var(--mono)", "font-size": "8", "letter-spacing": "1.1" });
  cl2.textContent = "THE PASS DID NOT LOOK"; svg.appendChild(cl2);

  /* ── w_refetch: a CLASSIFICATION boundary, not a data boundary ─────────────
     The old draft hatched here and called it the end of the data, which hid the
     region the sketch exists to expose. Gaps past w_refetch are banked, as cold,
     precisely so a WIDER attribution window can be evaluated: truncating at the
     current window would leave a distribution able to justify a narrower one and
     never a wider one. So this renders as the declared threshold does, a thin
     labelled rule across measured mass, and the plot carries on behind it. */
  if (o.wRefetch && o.wRefetch < cens) {
    const wx = X(o.wRefetch);
    svg.appendChild(el("line", { x1: String(wx), y1: String(padT), x2: String(wx), y2: String(padT + plotH),
      stroke: T("ink"), "stroke-width": "1", "stroke-dasharray": "1 3" }));
    const wl1 = el("text", { x: String(wx - 5), y: String(padT + 11), fill: T("ink"), "text-anchor": "end",
      "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.2" });
    wl1.textContent = "w_refetch"; svg.appendChild(wl1);
    const wl2 = el("text", { x: String(wx + 5), y: String(padT + plotH - 6), fill: T("graphite"),
      "font-family": "var(--mono)", "font-size": "8", "letter-spacing": "1.1" });
    wl2.textContent = "COLD BEYOND, STILL BANKED"; svg.appendChild(wl2);
  }

  /* Label rows, assigned before anything is drawn. Alternating by index is not
     enough: three cuts can land inside one decade and two would collide on the
     same row. Walk left to right and take a new row whenever the previous label
     is still within a label's width. */
  const midOf = s => s.median;
  const rowOf = (function () {
    const order = series.map((s, i) => ({ i, x: X(midOf(s)) })).sort((a, b) => a.x - b.x);
    const m = new Map();
    let row = 0, prevX = -1e9;
    order.forEach(o2 => { row = (o2.x - prevX < 104) ? row + 1 : 0; m.set(o2.i, row); prevX = o2.x; });
    return m;
  })();

  series.forEach((s, i) => {
    const emph = s.emphasis;
    const op = emph ? 1 : 0.42;
    /* ── SEGMENTS BETWEEN MEASURED POINTS, never steps ───────────────────────
       An earlier draft drew this as a staircase on the reasoning that the space
       between two quantiles is unmeasured. That was backwards: a step asserts
       the CDF is FLAT between p50 and p75, which claims no events occurred in
       that band, and that is a stronger and falser claim than a straight line.
       Steps belong to an empirical CDF over discrete observations, where the
       flats are real. Over quantiles of a continuous distribution they invent
       structure.

       So: markers are the measurement and carry full weight, segments are the
       inference and are drawn lighter. The reader sees which is which. And with
       the grid scaled to the sample count the segments are short wherever there
       was data to make them short, which is the honest resolution of the whole
       question: interpolate less by measuring more. */
    let d = "";
    s.pts.forEach((q, k) => { d += (k ? " L " : "M ") + X(q.x) + " " + Y(q.y); });
    svg.appendChild(el("path", { d, fill: "none", stroke: T("petrol"), "stroke-width": String(emph ? 1.5 : 1),
      opacity: String(op * 0.55), "stroke-linejoin": "round" }));
    /* THE MARKS ARE THE ARGUMENT. A digest samples the Y axis, so its points sit
       at chosen probabilities and land wherever the data happens to be dense. A
       histogram samples the X axis, so its points sit at chosen instants and land
       where the questions get asked. Same curve, different sampling, and the
       reader can see which one their threshold falls on. */
    s.pts.forEach(q => svg.appendChild(el("circle", { cx: String(X(q.x)), cy: String(Y(q.y)),
      r: emph ? "2.8" : "1.9", fill: T("petrol"), opacity: String(op) })));

    /* the label sits at the MEDIAN, not at the series end: ends cluster in one
       corner, medians are the quantity the reader is comparing. */
    const mx = X(midOf(s)), my = Y(0.5) - 8 - rowOf.get(i) * 24;
    svg.appendChild(el("line", { x1: String(mx), y1: String(Y(0.5)), x2: String(mx), y2: String(my + 4),
      stroke: T("rule"), "stroke-width": "1" }));
    const t = el("text", { x: String(mx + 7), y: String(my), fill: emph ? T("ink") : T("graphite"),
      "font-family": "var(--mono)", "font-size": "9", "font-weight": emph ? "600" : "400", "letter-spacing": "1.1" });
    t.textContent = s.label.toUpperCase(); svg.appendChild(t);
    const t2 = el("text", { x: String(mx + 7), y: String(my + 11), fill: T("pencil"),
      "font-family": "var(--mono)", "font-size": "8", "letter-spacing": "1.1" });
    t2.textContent = gapms(midOf(s)).toUpperCase();
    svg.appendChild(t2);

    if (emph) svg.appendChild(el("circle", { cx: String(mx), cy: String(Y(0.5)), r: "4.5", fill: "none",
      stroke: T("ink"), "stroke-width": "1.4" }));
  });
  /* ── the threshold, and what each reading can say about it ────────────────
     This is the whole comparison made legible. Drop a line at some instant and
     ask what share sits below it. On buckets the answer is EXACT wherever the
     line lands on an edge, because that is the number the pass banked. On
     quantiles it is always INTERPOLATED, because the banked points are
     probabilities and the question is in time.

     The error is not merely present in one and absent in the other: on buckets
     it is BOUNDED by the neighbouring edges and can be stated, and on a digest
     it is unknown at any particular point. A number a reader drags to and then
     acts on should be the first kind. */
  if (o.threshold) {
    const s0 = series.find(x => x.emphasis) || series[0];
    const tx = X(o.threshold);
    const read = readAt(s0.pts, o.threshold);
    svg.appendChild(el("line", { x1: String(tx), y1: String(padT), x2: String(tx), y2: String(padT + plotH),
      stroke: T("crimson"), "stroke-width": "1.2" }));
    svg.appendChild(el("circle", { cx: String(tx), cy: String(Y(read.y)), r: "4", fill: T("crimson") }));
    const box = el("text", { x: String(tx + 8), y: String(padT + plotH - 26), fill: T("ink"),
      "font-family": "var(--display)", "font-size": "19", "font-weight": "600" });
    box.textContent = pct(read.y, 1); svg.appendChild(box);
    const l1 = el("text", { x: String(tx + 8), y: String(padT + plotH - 13), fill: T("graphite"),
      "font-family": "var(--mono)", "font-size": "8", "letter-spacing": "1.1" });
    l1.textContent = "BELOW " + gapms(o.threshold).toUpperCase(); svg.appendChild(l1);
    const l2 = el("text", { x: String(tx + 8), y: String(padT + plotH - 2),
      fill: read.exact ? T("petrol") : T("crimson"),
      "font-family": "var(--mono)", "font-size": "8", "letter-spacing": "1.1" });
    l2.textContent = read.note; svg.appendChild(l2);
  }
  if (o.onThreshold) {
    const hit = el("rect", { x: String(padL), y: String(padT), width: String(plotW), height: String(plotH),
      fill: "transparent", style: "cursor:crosshair" });
    hit.addEventListener("click", e => {
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width * W;
      const frac = (px - padL) / plotW;
      o.onThreshold(Math.exp(lx(lo) + frac * (lx(cens) - lx(lo))));
    });
    svg.appendChild(hit);
  }
  mount.appendChild(svg);
}

/* What a set of sampled points can say about an arbitrary x, and how honestly. */
function readAt(pts, x) {
  const hit = pts.find(q => Math.abs(q.x - x) < Math.max(1, x * 0.001));
  if (hit) return { y: hit.y, exact: true, note: "EXACT, BANKED AT THIS EDGE" };
  if (x <= pts[0].x) return { y: pts[0].y, exact: false, note: "BELOW THE FIRST SAMPLE" };
  if (x >= pts[pts.length - 1].x) return { y: pts[pts.length - 1].y, exact: false, note: "PAST THE LAST SAMPLE" };
  let i = 0;
  while (i < pts.length - 2 && x > pts[i + 1].x) i++;
  const t = (Math.log(x) - Math.log(pts[i].x)) / (Math.log(pts[i + 1].x) - Math.log(pts[i].x));
  const y = pts[i].y + t * (pts[i + 1].y - pts[i].y);
  return { y, exact: false,
    note: "INTERPOLATED, " + pct(pts[i].y, 1) + " TO " + pct(pts[i + 1].y, 1) };
}

/* ── the instance cut: a BAND and its outliers ─────────────────────────────
   Not one dot an instance. A median has no shape, and shape picks the remedy:
   two instances at the same median, one tight and one heavy tailed, want
   opposite things, and a dot renders them identically.

   So the population draws as the band between the 10th and 90th instance at
   each quantile, and instances outside it draw as themselves. The band is what
   ordinary looks like in this fleet; a line leaving it is the finding.

   THIS IS THE CUT THAT NEEDS NO DECLARATION. Workload is declared and often
   absent, so a fleet of one model with unlabelled mixed traffic has nothing to
   decompose by. Shape needs no label: cohorts found here are handed to the
   customer to name rather than demanded from them before the panel will speak. */
function recoveryInstances(mount, o) {
  const cens = o.censoredAt, band = o.band, Q = band.map(b => b.q);
  const W = 1000, H = o.height || 300;
  const padT = 22, padR = 190, padL = 46, axisH = 30;
  const plotH = H - padT - axisH, plotW = W - padR - padL;
  const lo = Math.max(5000, Math.min(...band.map(b => b.lo)) / 3);
  const lx = v => Math.log(Math.max(v, lo));
  const X = v => padL + (lx(v) - lx(lo)) / (lx(cens) - lx(lo)) * plotW;
  const Y = q => padT + plotH - q * plotH;

  const svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img" });
  const ttl = el("title"); ttl.textContent = o.title; svg.appendChild(ttl);
  const defs = el("defs");
  const p = el("pattern", { id: "reci-h", width: "6", height: "6", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  p.appendChild(el("rect", { width: "6", height: "6", fill: T("paper-2") }));
  p.appendChild(el("line", { x1: "0", y1: "0", x2: "0", y2: "6", stroke: T("graphite"), "stroke-width": "1.6", opacity: "0.45" }));
  defs.appendChild(p); svg.appendChild(defs);

  const ticks = [[10000, "10s"], [60000, "1m"], [600000, "10m"], [3600000, "1h"], [21600000, "6h"], [43200000, "12h"], [86400000, "24h"], [172800000, "48h"], [259200000, "72h"]];
  ticks.forEach(([v, lab]) => {
    if (v > cens || v < lo) return;
    svg.appendChild(el("line", { x1: String(X(v)), y1: String(padT), x2: String(X(v)), y2: String(padT + plotH), stroke: T("rule"), "stroke-width": "1" }));
    const t = el("text", { x: String(X(v)), y: String(padT + plotH + 16), fill: T("graphite"),
      "text-anchor": "middle", "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.1" });
    t.textContent = lab; svg.appendChild(t);
  });
  [0.25, 0.5, 0.75].forEach(q => {
    svg.appendChild(el("line", { x1: String(padL), y1: String(Y(q)), x2: String(padL + plotW), y2: String(Y(q)),
      stroke: T("rule"), "stroke-width": "1", "stroke-dasharray": q === 0.5 ? "" : "1 3" }));
    const t = el("text", { x: String(padL - 8), y: String(Y(q) + 3), fill: T("graphite"),
      "text-anchor": "end", "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.1" });
    t.textContent = (q * 100) + "%"; svg.appendChild(t);
  });

  svg.appendChild(el("rect", { x: String(padL + plotW), y: String(padT), width: String(padR - 16), height: String(plotH), fill: "url(#reci-h)" }));
  const cl = el("text", { x: String(padL + plotW + 6), y: String(padT + 12), fill: T("graphite"),
    "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.2" });
  cl.textContent = "BEYOND examined_history"; svg.appendChild(cl);
  if (o.wRefetch && o.wRefetch < cens) {
    const wx = X(o.wRefetch);
    svg.appendChild(el("line", { x1: String(wx), y1: String(padT), x2: String(wx), y2: String(padT + plotH),
      stroke: T("ink"), "stroke-width": "1", "stroke-dasharray": "1 3" }));
    const wl1 = el("text", { x: String(wx - 5), y: String(padT + 11), fill: T("ink"), "text-anchor": "end",
      "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.2" });
    wl1.textContent = "w_refetch"; svg.appendChild(wl1);
  }

  /* the population, as one shape rather than 108 strands */
  let d = "M " + X(band[0].lo) + " " + Y(Q[0]);
  band.forEach((b, k) => { if (k) d += " L " + X(b.lo) + " " + Y(Q[k]); });
  for (let k = band.length - 1; k >= 0; k--) d += " L " + X(band[k].hi) + " " + Y(Q[k]);
  d += " Z";
  svg.appendChild(el("path", { d, fill: T("petrol"), opacity: "0.16" }));
  const mid = band.map((b, k) => ({ x: X((b.lo + b.hi) / 2), y: Y(Q[k]) }));
  svg.appendChild(el("path", { d: mid.map((m, k) => (k ? "L " : "M ") + m.x + " " + m.y).join(" "),
    fill: "none", stroke: T("petrol"), "stroke-width": "1.2", opacity: "0.5", "stroke-dasharray": "3 3" }));
  const bl = el("text", { x: String(X(band[band.length - 1].hi) + 6), y: String(Y(Q[Q.length - 1]) - 4),
    fill: T("graphite"), "font-family": "var(--mono)", "font-size": "9", "letter-spacing": "1.1" });
  bl.textContent = "80% OF INSTANCES"; svg.appendChild(bl);

  /* and the ones that leave it */
  o.outliers.forEach((s, i) => {
    let dd = "";
    s.values.forEach((v, k) => { dd += (k ? " L " : "M ") + X(v) + " " + Y(s.quantiles[k]); });
    svg.appendChild(el("path", { d: dd, fill: "none", stroke: T("crimson"), "stroke-width": "1.1", opacity: "0.62" }));
    if (i === 0) {
      const t = el("text", { x: String(X(s.values[Math.floor(s.values.length / 2)]) + 6), y: String(Y(0.5) - 10),
        fill: T("crimson"), "font-family": "var(--mono)", "font-size": "9", "font-weight": "600", "letter-spacing": "1.1" });
      t.textContent = o.outliers.length + " INSTANCES"; svg.appendChild(t);
      const t2 = el("text", { x: String(X(s.values[Math.floor(s.values.length / 2)]) + 6), y: String(Y(0.5) + 1),
        fill: T("graphite"), "font-family": "var(--mono)", "font-size": "8", "letter-spacing": "1.1" });
      t2.textContent = "OUTSIDE THE BAND"; svg.appendChild(t2);
    }
  });
  mount.appendChild(svg);
}

/* marker chips ANCHOR; footnotes carry the detail. Not both saying the same thing. */
function seamAnchors(seams) {
  const box = h("div", { class: "anchors" });
  seams.forEach(s => {
    const a = h("a", { class: "anchor", href: "marker.html?id=" + s.id,
      title: s.provenance + " · " + s.kind + " · " + s.label + " · " +
        (s.breaks ? "series breaks, rows either side are not one quantity" : "fleet change, series continues") });
    a.innerHTML = "<b>" + s.dagger + "</b> " + s.at + " · " + s.label;
    box.appendChild(a);
  });
  return box;
}
function seamFootnotes(seams) {
  const ul = h("ul", { class: "footnotes" });
  seams.forEach(s => {
    const li = h("li", { class: "footnote" });
    li.appendChild(h("span", { class: "footnote__d" }, s.dagger));
    li.appendChild(h("span", {}, s.provenance + " · " + s.kind + " · " + s.label + " · " +
      (s.breaks ? "series breaks, rows either side are not one quantity" : "fleet change, series continues")));
    ul.appendChild(li);
  });
  return ul;
}

/* ── evidence: level 2, terminal, raw-window-bounded ─────────────────────── */
function evidence(mount, records, note) {
  const box = h("section", { class: "evidence" });
  const head = h("div", { class: "evidence__h" });
  head.appendChild(h("span", {}, "records behind this"));
  head.appendChild(h("span", {}, "level 2 · terminal"));
  box.appendChild(head);
  const wrap = h("div", { class: "tbl-wrap", style: "border:0" });
  const tbl = h("table", { class: "tbl", style: "min-width:38rem" });
  tbl.innerHTML = "<thead><tr><th>observed at</th><th>block</th><th class='n'>n_tokens</th><th>class</th>" +
    "<th class='n'>gap since close</th><th class='n'>epoch</th><th>segment</th></tr></thead>";
  const tb = h("tbody");
  records.forEach(r => {
    const tr = h("tr");
    [r.at, r.block, int(r.n_tokens), r.cls, (r.gap_ms / 3600000).toFixed(1) + " h", String(r.epoch), r.segment]
      .forEach((v, i) => tr.appendChild(h("td", { class: (i === 2 || i === 4 || i === 5) ? "n" : "" }, v)));
    tb.appendChild(tr);
  });
  tbl.appendChild(tb); wrap.appendChild(tbl); box.appendChild(wrap);
  box.appendChild(h("p", { class: "evidence__f" },
    (note || "") + " Raw-window-bounded: evidence is retained about " + CTX.raw_horizon_days +
    " days, so a drill past that horizon returns nothing and says so. There is no level beneath this one."));
  mount.appendChild(box);
}

/* ── section index, docked into the rail as indented children of Document.
   One rail carries destinations and the current page's outline, the docs-site
   pattern, so the content column keeps its width and two navigation systems stop
   competing to highlight on scroll. ─────────────────────────────────────────── */
function sectionNav(_ignored, sections) {
  const parent = document.querySelector('.rail__i[href="index.html"]');
  if (!parent) return;
  let ul = document.querySelector(".secnav");
  if (ul) ul.remove();
  ul = h("ul", { class: "secnav", "aria-label": "Sections" });
  sections.forEach(s => {
    const li = h("li");
    const a = h("a", { class: "secnav__a", href: "#" + s.id, title: s.label + (s.state ? " · " + s.state : "") });
    a.appendChild(h("span", {}, s.label));
    if (s.state) a.appendChild(h("span", { class: "secnav__st" }, s.state));
    li.appendChild(a); ul.appendChild(li);
  });
  parent.after(ul);

  const links = [...ul.querySelectorAll("a")];
  const obs = new IntersectionObserver(es => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(a => a.removeAttribute("aria-current"));
      const a = links.find(x => x.getAttribute("href") === "#" + e.target.id);
      if (a) a.setAttribute("aria-current", "true");
    });
  }, { rootMargin: "-20% 0px -70% 0px" });
  sections.forEach(s => { const n = document.getElementById(s.id); if (n) obs.observe(n); });
}

/* ── mock banner. Scaffolding lives here, never in a content band. ───────── */
function mockbar(ages, current, onPick) {
  const bar = h("div", { class: "mockbar" });
  bar.appendChild(h("span", { class: "mockbar__l" }, "static mockup · synthetic data"));
  if (ages) {
    const box = h("span", { class: "ages" });
    box.appendChild(h("span", { class: "mockbar__l" }, "age"));
    ages.forEach(a => {
      const b = h("button", { class: "ages__b", type: "button" }, a.label);
      b.setAttribute("aria-pressed", String(a.key === current));
      b.addEventListener("click", () => {
        box.querySelectorAll(".ages__b").forEach((x, i) => x.setAttribute("aria-pressed", String(ages[i].key === a.key)));
        onPick(a);
      });
      box.appendChild(b);
    });
    bar.appendChild(box);
  }
  document.body.prepend(bar);
}
