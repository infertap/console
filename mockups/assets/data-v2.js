/* ═══════════════════════════════════════════════════════════════════════════════
   CONSOLE v2 — one coherent synthetic world.

   Every number in every page derives from here. Nothing is authored twice, because
   a platform engineer cross-checks arithmetic instinctively and the demo dies the
   moment two pages disagree.

   THREE POPULATIONS, three visibly different numbers, used consistently everywhere:
     instances      120   physical engines the taps sit beside
     holders        469   (instance, dp_rank, cache group) tuples seen
                          468 listable, 1 unexamined because no pass covered it
     producer runs  480   incarnations. A restarted instance is a new run, which is
                          why runs exceed holders. Staleness is judged per run.

   ARITHMETIC INVARIANTS, asserted at the bottom of this file:
     later + earlier          = the full window figure
     ETR + post_clear         = repeat compute, in every window
     sum of all 468 holders   = the full window figure
     each seam's DATE         = derived from its day index against today
   ═══════════════════════════════════════════════════════════════════════════════ */

const TODAY = "2026-08-03";
const TREND_DAYS = 90;

function dayDate(i) {
  const d = new Date(TODAY + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - (TREND_DAYS - 1 - i));
  return d.toISOString().slice(0, 10);
}
const dayIndex = s => TREND_DAYS - 1 - Math.round((new Date(TODAY + "T00:00:00Z") - new Date(s + "T00:00:00Z")) / 86400000);
const md = s => s.slice(5);
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const POP = { instances: 120, holders_seen: 469, holders_listable: 468, holders_unexamined: 1, runs: 480 };

const CTX = {
  fleet: "prod-usc1",
  today: TODAY,
  window: { start: "2026-07-21", end: TODAY, label: "14 d" },
  pass: { at: "14:02Z", semantics: "js-6", analyzer: "0.9.4",
          discriminator: "w86400000s1000mnx259200000" },
  raw_horizon_days: 14,
  status: { last_segment: "0442", last_segment_at: "13:58Z", next_tick: "4m", lag: "112 s" },
  pending: { through: "14:00" },
  populations: POP
};

/* ── the ledger everything derives from ───────────────────────────────────── */
const LEDGER = {
  ETR:        { later: 1596102, earlier: 1465102, cov: { later: 0.995, earlier: 0.985 }, ev: { later: 21486, earlier: 19722 } },
  post_clear: { later: 584340,  earlier: 537452,  cov: { later: 0.984, earlier: 0.971 }, ev: { later: 8258,  earlier: 7626 } }
};
const STORED = { later: 703368387, earlier: 690535862 };
const CLASSES = Object.keys(LEDGER);

const sumTokens = w => CLASSES.reduce((a, c) => a + LEDGER[c][w], 0);
const sumEvents = w => CLASSES.reduce((a, c) => a + LEDGER[c].ev[w], 0);
const covOf = w => CLASSES.reduce((a, c) => a + LEDGER[c][w] * LEDGER[c].cov[w], 0) / sumTokens(w);
const classFull = c => LEDGER[c].later + LEDGER[c].earlier;
const classCovFull = c => (LEDGER[c].later * LEDGER[c].cov.later + LEDGER[c].earlier * LEDGER[c].cov.earlier) / classFull(c);

const WASTE_FULL = sumTokens("later") + sumTokens("earlier");
const STORED_FULL = STORED.later + STORED.earlier;
const COV_FULL = CLASSES.reduce((a, c) => a + classFull(c) * classCovFull(c), 0) / WASTE_FULL;
const EVENTS_FULL = sumEvents("later") + sumEvents("earlier");

const WINDOWS = {
  later:   { start: "2026-07-28", end: TODAY,        label: "7 d" },
  earlier: { start: "2026-07-21", end: "2026-07-27", label: "7 d" }
};

/* ── seams. Date derived from day index, so the two can never disagree. ───── */
const SEAMS = [
  { id: "js-6",     day: 34, dagger: "†", provenance: "observed", label: "js-5 to js-6", breaks: true,
    kind: "semantics_version",
    from: "js-5", to: "js-6",
    ledger: "The join semantics changed. Rows either side are computed under different rules and are not one quantity." },
  { id: "w-refetch", day: 60, dagger: "‡", provenance: "recorded", label: "w_refetch 12h to 24h", breaks: true,
    kind: "classification parameter",
    from: "w43200000s1000mnx259200000", to: "w86400000s1000mnx259200000",
    ledger: "The attribution window widened, so more prior closes fall inside it and more stores classify as repeat compute. Written by the analyzer as a system annotation." },
  { id: "router-2-3", day: 85, dagger: "§", provenance: "recorded", label: "deploy router v2.3", breaks: false,
    kind: "deploy annotation",
    from: "router v2.2", to: "router v2.3",
    ledger: "A fleet change, not a measurement change. The series continues across it and rows either side are one quantity." }
].map(s => ({ ...s, at: dayDate(s.day) }));

/* ── holders. 468 rows summing EXACTLY to the full window figure. ──────────── */
const HOLDERS = (function () {
  const r = rng(31415);
  const wl = ["chat-serve", "batch-embed", "agentic-tools", "unattributed"];
  const raw = [];
  for (let i = 0; i < POP.holders_listable; i++) raw.push(Math.pow(i + 1, -0.75) * (0.92 + r() * 0.16));
  const k = WASTE_FULL / raw.reduce((a, b) => a + b, 0);
  const out = [];
  let acc = 0;
  for (let i = 0; i < POP.holders_listable; i++) {
    const tokens = i === POP.holders_listable - 1 ? WASTE_FULL - acc : Math.round(raw[i] * k);
    acc += tokens;
    const impaired = i >= 5 && i <= 16;
    const indet = i >= 22 && i <= 27;
    out.push({
      id: "h" + String(i + 1).padStart(3, "0"),
      instance: "i-" + String((i % POP.instances) + 1).padStart(3, "0"),
      dp_rank: Math.floor(i / POP.instances) % 8,
      group: Math.floor(i / 240) % 2,
      workload: wl[i % 4],
      tokens,
      etr: Math.round(tokens * (0.68 + r() * 0.14)),
      events: Math.round(tokens / (58 + r() * 26)),
      coverage: impaired ? 0.44 + r() * 0.16 : 0.94 + r() * 0.058,
      state: impaired ? "impaired" : indet ? "indeterminate" : "fine",
      model: indet ? null : "meta-llama/Llama-3.1-70B-Instruct"
    });
  }
  out.forEach(x => { x.post_clear = x.tokens - x.etr; });
  return out;
})();
const HOLDER_STATE_COUNTS = HOLDERS.reduce((a, x) => { a[x.state] = (a[x.state] || 0) + 1; return a; }, {});

const S1_THRESHOLD = 0.01;
const RESIDUAL = { value: 812400, coverage: 0.941, comparable: 1841902, total: 1993640 };

/* Preflight facts, listed by the verdict section before any pass has run. Facts,
   not reassurance: each is something the analyzer observed or was told. */
const FIRSTRUN_PREFLIGHT = [
  ["engine", "clickhouse 24.8.4.13 pinned"],
  ["data directory", "exclusive lock held"],
  ["declared GPUs", "480 of 500 envelope"],
  ["endpoints", "12 declared, 12 reachable"],
  ["deterministic hashing", "PYTHONHASHSEED fixed on 12 of 12"],
  ["observed models", "pending first subscribe"],
  ["archive lifecycle", "enabled, re-projection horizon 365 d"],
  ["semantics_version", "js-6"],
  ["raw horizon", "14 d floor"],
  ["action threshold", "1.00% declared"]
];

/* ── producer runs. Staleness is per run, which is why this is not the holder
      count: a rolling deploy makes one holder into several runs. ──────────── */
const RUNS = [
  { state: "fine",          label: "reporting",              count: 461, basis: "within its declared cadence" },
  { state: "indeterminate", label: "idle or stalled",        count: 7,   basis: "heartbeat current, engine silent" },
  { state: "impaired",      label: "silent, no stop record", count: 5,   basis: "past k_stale x median spacing" },
  { state: "unobserved",    label: "departed",               count: 6,   basis: "agent_stop observed" },
  { state: "unexamined",    label: "no basis",               count: 1,   basis: "no agent_start observed" }
];

/* ── the document's four ages. One layout, four states. ───────────────────────
   Nothing appears that was not always there. Sections resolve, they never reflow. */
const AGES = {
  t0: { key: "t0", label: "t₀ install", at: "13:04Z", passes: 0, examined_days: 0,
        segments: 0, events: 0, lag: null, note: "installed, no segment relayed" },
  t1: { key: "t1", label: "t₁ ingesting", at: "13:41Z", passes: 0, examined_days: 0,
        segments: 37, events: 18_412_992, lag: 214, note: "relaying, no pass yet" },
  t2: { key: "t2", label: "t₂ first pass", at: "14:01Z", passes: 1, examined_days: 9, pass_target: 14,
        segments: 44, events: 22_106_880, lag: 148, note: "first pass running" },
  t3: { key: "t3", label: "t₃ steady state", at: "14:02Z", passes: 612, examined_days: 88,
        segments: 4412, events: 2_147_006_144, lag: 112, note: "steady" }
};

/* trend points for an age. Days the pass has not covered hatch, never zero. */
function trendFor(age) {
  const r = rng(20260803), out = [];
  for (let i = 0; i < TREND_DAYS; i++) {
    let b = 0.0042 - i * 0.0000135;
    if (i > 34) b -= 0.0004;
    if (i > 60) b += 0.0006;
    if (i > 85) b += 0.0011;
    let cov = 0.965 + r() * 0.032;
    if (i >= 44 && i <= 51) cov = 0.41 + r() * 0.09;
    /* t2 has run one pass over part of its first 14 days. Everything before the
       install is unexamined and always will be: there is no record to classify. */
    const examined =
      age.examined_days === 0 ? false :
      age.key === "t2" ? (i >= TREND_DAYS - age.pass_target && i < TREND_DAYS - age.pass_target + age.examined_days) :
      i >= TREND_DAYS - age.examined_days;
    out.push({ day: i, date: dayDate(i), value: Math.max(0.0004, b + (r() - 0.5) * 0.0009), coverage: cov, examined });
  }
  return out;
}

/* ── level-1 detail ───────────────────────────────────────────────────────── */
function holderById(id) { return HOLDERS.find(x => x.id === id) || HOLDERS[0]; }

function holderDetail(hd) {
  const r = rng(hd.tokens);
  const intervals = [];
  let t = 0;
  for (let i = 0; i < 14; i++) {
    const open = t + r() * 3;
    const dur = 0.6 + r() * 4.2;
    intervals.push({
      block: "b" + (0x4a1 + i * 37).toString(16),
      open, close: open + dur,
      close_reason: r() > 0.62 ? "clear" : "evict",
      tokens: Math.round(1800 + r() * 9200),
      gap_ms: Math.round(r() * 86400000)
    });
    t = open + dur;
  }
  const coverage_history = Array.from({ length: 14 }, (_, i) => ({
    date: dayDate(TREND_DAYS - 14 + i),
    coverage: hd.state === "impaired" ? 0.4 + r() * 0.22 : 0.93 + r() * 0.065
  }));
  return { intervals, coverage_history };
}

function dayDetail(date) {
  const i = dayIndex(date);
  const r = rng(1000 + (i < 0 ? 0 : i));
  const pts = trendFor(AGES.t3);
  const p = pts[Math.max(0, Math.min(TREND_DAYS - 1, i))] || pts[TREND_DAYS - 1];
  const tokens = Math.round(WASTE_FULL / 14 * (0.8 + r() * 0.4));
  const etr = Math.round(tokens * 0.73);
  return {
    date, point: p, tokens, etr, post_clear: tokens - etr,
    events: Math.round(tokens / 73),
    holders: 468 - Math.round(r() * 6),
    stored: Math.round(STORED_FULL / 14 * (0.9 + r() * 0.2)),
    top: HOLDERS.slice(0, 6).map(hd => ({ ...hd, tokens: Math.round(hd.tokens / 14 * (0.7 + r() * 0.6)) }))
  };
}

/* level 2: evidence. Terminal everywhere, raw-window-bounded. */
function evidenceFor(seed, n) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < (n || 8); i++) {
    out.push({
      at: "2026-08-0" + (1 + (i % 3)) + "T" + String(9 + (i % 12)).padStart(2, "0") + ":" +
          String((i * 7) % 60).padStart(2, "0") + ":" + String((i * 13) % 60).padStart(2, "0") + "Z",
      block: "b" + (0x9f2 + i * 53).toString(16),
      n_tokens: Math.round(900 + r() * 7200),
      cls: r() > 0.3 ? "ETR" : "post_clear",
      gap_ms: Math.round(r() * 86400000),
      epoch: 3 + (i % 2),
      segment: "0" + (410 + i)
    });
  }
  return out;
}

/* ── declared inputs. Rendered, never edited. ─────────────────────────────── */
const DECLARED = [
  { name: "action threshold", value: "1.00%", subject: "fleet",
    history: [["2026-07-12", "1.00%"], ["2026-05-02", "2.00% (default)"]],
    provenance: "declared 2026-07-12 · config", change: "set action_threshold_fraction in analyzer.toml" },
  { name: "cost rate", value: "not declared", subject: "fleet", absent: true,
    history: [], provenance: "no declaration on file",
    change: "set cost_rate in analyzer.toml. Figures priced by it render in the report, never on glass." },
  { name: "workload map", value: "4 patterns", subject: "declared key, glob and all",
    history: [["2026-07-19", "4 patterns"], ["2026-06-01", "3 patterns"]],
    provenance: "declared 2026-07-19 · config",
    change: "edit workload_map in analyzer.toml. The key is stored as declared, never expanded.",
    rows: [["chat-*", "chat-serve"], ["embed-*", "batch-embed"], ["agent-*", "agentic-tools"], ["*", "unattributed"]] },
  { name: "tenant map", value: "unattributed", subject: "declared key",
    history: [["2026-05-02", "unattributed"]],
    provenance: "not yet declared · default",
    change: "edit tenant_map in analyzer.toml" },
  { name: "declared GPUs", value: "480 of 500 envelope", subject: "preflight fence",
    history: [["2026-05-02", "480"]],
    provenance: "declared 2026-05-02 · CLI --declared-gpus",
    change: "pass --declared-gpus. This is an envelope fence, not an inventory, and it is not a dashboard input." }
];

const REPORTS = ["2026-08-01", "2026-07-01", "2026-06-01", "2026-05-02"].map((d, i) => ({
  date: d, name: "rs-1-" + d + ".json",
  bytes: 184320 - i * 21000,
  window: d === "2026-08-01" ? "2026-07-18 to 2026-08-01" : "monthly",
  semantics: i < 2 ? "js-6" : "js-5"
}));

const ABOUT = {
  analyzer: "0.9.4", semantics: "js-6", engine: "clickhouse 24.8.4.13 (pinned)",
  discriminator: CTX.pass.discriminator, trust_doc: "rev 7 · 2026-07-28",
  license: { licensed: 500, declared: 480, observed: POP.instances },
  third_party: ["clickhouse-rs", "serde", "tokio", "zmq", "IBM Plex (OFL)", "Fraunces (OFL)"]
};

const S5 = {
  coverage_by_source: (function () {
    const r = rng(5150), out = [];
    for (let i = 0; i < 12; i++) {
      const low = i === 2 || i === 7;
      out.push({
        source: "i-" + String(3 + i * 11).padStart(3, "0"),
        window_time: low ? 0.38 + r() * 0.12 : 0.951 + r() * 0.047,
        token_weighted: low ? 0.52 + r() * 0.14 : 0.966 + r() * 0.032,
        state: low ? "impaired" : "fine"
      });
    }
    return out;
  })(),
  models: { observed: POP.instances - 8, unobserved: 8 },
  recovery: { backup_age_h: 6.2, restore_verify_age_d: 4, restore_verify_at: "2026-07-30" }
};

/* ── comparison rows for the window-against-window section ────────────────── */
const CMP_ROWS = [
  { metric: "repeat compute", unit: "tokens", scopable: true, cov_a: covOf("later"), cov_b: covOf("earlier") },
  ...CLASSES.map(c => ({ metric: c, unit: "tokens", scopable: true, cov_a: LEDGER[c].cov.later, cov_b: LEDGER[c].cov.earlier })),
  { metric: "classified stores", unit: "events", scopable: true, cov_a: covOf("later"), cov_b: covOf("earlier") },
  { metric: "fraction of stored mass", unit: "fraction", scopable: false,
    refuse_reason: "denominator spans the seam and is banked per discriminator",
    cov_a: covOf("later"), cov_b: covOf("earlier") }
];

const MOVERS = (function () {
  const r = rng(770231);
  const cls = ["ETR", "post_clear", "ETR", "ETR", "post_clear"];
  const wl = ["chat-serve", "batch-embed", "agentic-tools", "unattributed", "chat-serve",
              "batch-embed", "agentic-tools", "chat-serve", "unattributed", "chat-serve"];
  const out = [];
  for (let i = 0; i < 10; i++) {
    const hd = HOLDERS[i * 3];
    const a = Math.round(hd.tokens * (0.44 + r() * 0.18));
    const b = Math.round(a * (0.55 + r() * 0.7));
    out.push({ cls: cls[i % cls.length], holder: hd, workload: wl[i], a, b, coverage: hd.coverage });
  }
  return out.sort((x, y) => (y.a - y.b) - (x.a - x.b));
})();

/* ── the recovery curve. PROTOTYPE, and the decompositions do not exist yet. ──
   /v1/distributions/gap takes window and grain and nothing else, so everything
   below the `fleet` cut is a shape we are asking for rather than one we can read.
   That is the point of the prototype: decide the cut here, then go and get it.

   THREE PROPERTIES THE SHAPE HAS TO CARRY, and they are why this is not a chart
   over the existing endpoint:

   1. EVENT-DENOMINATED. `samples` counts classified stores, not tokens. Every
      other figure on this page is token mass, so this one states its denominator
      or it silently answers a different question than the hero above it.
   2. QUANTILES DO NOT AGGREGATE. The fleet p50 is NOT derivable from the four
      workload p50s, in either direction. So a cut is read from the pass or it
      does not exist; the client can never compute one from another.
   3. RIGHT-CENSORED AT w_refetch. ETR is DEFINED as a close within 24 h, so the
      population is gap-bounded by construction. This describes attributable
      repeat compute, never all of it, and the axis stops where the class does.

   The fleet row matches the three quantiles the real corpus already publishes
   (p50 30.3 min, p90 3.2 h, p99 12.0 h) so the prototype and the fixture cannot
   disagree about the one cut that is real. */
const W_REFETCH_MS = 86400000;
/* `Params::examined_history_ms`, 72 h. THE OBSERVATION BOUND, and not the same
   thing as w_refetch. The pass looks back this far, so a gap longer than this is
   not in the sketch at all and no window re-derived from it can be justified
   wider. w_refetch is where CLASSIFICATION changes; this is where SEEING stops. */
const EXAMINED_HISTORY_MS = 259200000;

const RECOVERY = (function () {
  /* Inverse normal CDF, Beasley-Springer-Moro. Here only to AUTHOR the world:
     gap distributions are heavy tailed and roughly lognormal, so laying a cut out
     as (median, sigma) and expanding it is how you get a plausible shape without
     hand typing twenty values a row. */
  const zq = function (p) {
    const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
    const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
    const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209, 0.0276438810333863,
      0.0038405729373609, 0.0003951896511919, 0.0000321767881768, 0.0000002888167364, 0.0000003960315187];
    const y = p - 0.5;
    if (Math.abs(y) < 0.42) {
      const r = y * y;
      return y * (((a[3] * r + a[2]) * r + a[1]) * r + a[0]) /
        ((((b[3] * r + b[2]) * r + b[1]) * r + b[0]) * r + 1);
    }
    let r = y > 0 ? 1 - p : p;
    r = Math.log(-Math.log(r));
    let x = c[0];
    for (let i = 1; i < 9; i++) x += c[i] * Math.pow(r, i);
    return y < 0 ? -x : x;
  };

  /* Forward normal CDF, Abramowitz-Stegun 7.1.26. Needed for the BUCKET reading:
     quantiles map probability to value, buckets map value to probability, and
     going the second way needs Phi where the first needed its inverse. */
  const phi = function (z) {
    const p = 0.3275911, s2 = z < 0 ? -1 : 1, x = Math.abs(z) / Math.SQRT2;
    const t = 1 / (1 + p * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + s2 * y);
  };

  /* ── THE TWO READINGS, AND WHY THEY ARE NOT THE SAME SHAPE ────────────────
     A t-digest samples the Y axis: you choose quantile levels and it reports the
     value at each. A histogram samples the X axis: you choose bucket edges and it
     reports the mass below each.

     Both describe one distribution and neither is more accurate in general. What
     differs is WHERE THE SAMPLES LAND relative to the question. A reader dragging
     a threshold is asking "how much sits below THIS value", which is an X-axis
     question, so a histogram answers it exactly at its edges and a digest always
     interpolates. The digest is denser where the data is dense; the histogram is
     denser where the questions are asked.

     Bucket edges are log spaced because gaps are, and they are chosen at the
     instants an operator would actually type. */
  const BUCKET_EDGES = [10000, 30000, 60000, 120000, 300000, 600000, 1800000,
    3600000, 7200000, 21600000, 43200000, 86400000, 172800000, 259200000];

  /* ── THE GRID IS A FUNCTION OF THE SAMPLE COUNT ───────────────────────────
     Not a fixed list. To place the q-th quantile you need roughly n(1-q)
     observations above it, so 21,000 samples carry 5% steps comfortably while
     180 samples support about a decile and nothing finer. Handing every cut the
     same grid would either waste the fleet's resolution or draw an instance's
     p99 from two observations.

     The consequence is the useful part: MARKER DENSITY IS THE CONFIDENCE
     DISPLAY. A densely dotted curve had a lot of data behind it and a sparse one
     did not, and the reader learns that from the chart rather than from a note
     beside it. Nothing has to say "approximate". */
  const grid = function (n) {
    const step = n >= 8000 ? 0.05 : n >= 2000 ? 0.10 : 0.10;
    const out = [];
    for (let q = step; q <= 0.9001; q += step) out.push(Math.round(q * 100) / 100);
    if (n >= 2000) out.push(0.95);
    if (n >= 8000) out.push(0.99);
    return out;
  };

  /* Anchors, hand authored, at the quantiles the real corpus publishes so the
     prototype and the fixture cannot disagree about the one cut that is real.
     Everything between them is expanded by interpolating log(gap) linearly in
     z(q), which is exact for a lognormal and passes through every anchor. */
  const ANCH = [0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99];
  const expand = function (vals, g) {
    const za = ANCH.map(zq), lv = vals.map(Math.log);
    return g.map(function (q) {
      const z = zq(q);
      let i = 0;
      while (i < za.length - 2 && z > za[i + 1]) i++;
      const t = (z - za[i]) / (za[i + 1] - za[i]);
      return Math.round(Math.exp(lv[i] + t * (lv[i + 1] - lv[i])));
    });
  };
  /* ── TWO DENOMINATIONS, BOTH BANKED ───────────────────────────────────────
     A t-digest holds centroids, never raw values, so the WEIGHT is baked in at
     write time and no read can recover the other view: once two observations
     merge into one centroid, which of them carried five thousand tokens and
     which carried fifty is gone. quantilesTDigest weights every store 1 and
     answers about EVENTS; quantilesTDigestWeighted by n_tokens answers about
     MASS. They are different distributions and neither derives from the other.

     Mass is primary, because mass is the register the rest of this page speaks
     in and it is what dashboard.md 2.3 asks for. Events ride beside it,
     labelled, the way instance-time coverage rides beside token-weighted.

     THE DIVERGENCE IS ITSELF THE FINDING, which is the whole argument for
     paying for both. Mass curve LEFT of the event curve means the large blocks
     are the near misses and a modest retention bump recovers real mass. Mass
     curve RIGHT means every near miss is a small block and recovering them
     costs a great deal of retention for very little mass. Identical event
     curves, opposite remedies.

     `massShift` is a location shift here because this is a mock. Real weighting
     moves the shape too, not only the median. */
  /* the inverse of `expand`: given a value, what share of mass sits below it.
     Same log-value against probit-probability interpolation, walked the other way. */
  const cumAt = function (vals, v) {
    const za = ANCH.map(zq), lv = vals.map(Math.log), lo = Math.log(v);
    if (lo <= lv[0]) {
      const slope = (za[1] - za[0]) / (lv[1] - lv[0]);
      return Math.max(0, phi(za[0] + (lo - lv[0]) * slope));
    }
    let i = 0;
    while (i < lv.length - 2 && lo > lv[i + 1]) i++;
    const t = (lo - lv[i]) / (lv[i + 1] - lv[i]);
    return Math.min(1, Math.max(0, phi(za[i] + t * (za[i + 1] - za[i]))));
  };

  /* Local maxima in per-bucket mass, keeping only peaks separated by a real
     trough. The floor and the trough ratio are there so a wobble is not reported
     as a second mechanism: a chip that fires on noise is one a reader learns to
     ignore, which is worse than not having it. */
  const modesOf = function (b) {
    const d = b.map(function (x, k) { return x.cum - (k ? b[k - 1].cum : 0); });
    const out = [];
    for (let i = 1; i < d.length - 1; i++) {
      if (!(d[i] > d[i - 1] && d[i] >= d[i + 1] && d[i] > 0.06)) continue;
      if (!out.length) { out.push(i); continue; }
      const prev = out[out.length - 1];
      const trough = Math.min.apply(null, d.slice(prev, i + 1));
      if (trough < 0.6 * Math.min(d[prev], d[i])) out.push(i);
      else if (d[i] > d[prev]) out[out.length - 1] = i;
    }
    return out.map(function (i) { return b[i].edge; });
  };

  const row = function (key, cls, samples, tokens, massShift, anchors) {
    const g = grid(samples);
    const shifted = anchors.map(function (v) { return v * massShift; });
    const bkts = BUCKET_EDGES.map(function (e) { return { edge: e, cum: cumAt(shifted, e) }; });
    return {
      /* the same distribution, sampled the other way */
      buckets: bkts,
      /* Where the mass piles up, and whether it piles in more than one place.
         Stated as a FACT rather than drawn as a second chart: a density render
         would make a reader spot two humps, and this product's habit is to say
         the thing it found. Only computable from buckets, because a digest banks
         positions and cannot state mass per interval. */
      modes: modesOf(bkts),
      key: key, cls: cls,
      /* both populations, because the two curves have different denominators and
         the schema's own law is that a row carries the population it is over */
      samples: samples, tokens: tokens,
      quantiles: g,
      values: expand(anchors.map(function (v) { return v * massShift; }), g),
      values_events: expand(anchors, g)
    };
  };

  /* Token totals tie to LEDGER, so the mass populations here and the mass on the
     hero are one quantity: ETR later 1,596,102 and post_clear later 584,340,
     split across the cuts and summing back exactly. */
  const cuts = {
    fleet: [
      row("fleet", "ETR", 21486, 1596102, 0.80, [42000, 260000, 1820000, 6300000, 11400000, 21600000, 43100000]),
      row("fleet", "post_clear", 8258, 584340, 0.82, [24000, 130000, 640000, 2400000, 7900000, 16200000, 38400000]),
      /* COLD, and it is why the sketch banks past w_refetch. A recompute whose
         prior close falls outside the attribution window classifies cold TODAY,
         and its gap is banked anyway: truncating at the current window would
         leave a distribution able to justify a narrower window and never a
         wider one. Everything between 24 h and 72 h on this curve is mass a
         wider w_refetch would move INTO the register. */
      row("fleet", "cold", 14200, 1043000, 1.00, [90000000, 105000000, 135000000, 175000000, 215000000, 235000000, 255000000])
    ],
    /* THE ARGUMENT, MADE VISIBLE. The fleet median sits at a comfortable half
       hour. One workload underneath it is thrashing at ninety-five seconds and
       another is nowhere near cache bound. The aggregate describes neither, and
       the two need opposite remedies. */
    /* batch-embed shifts RIGHT under mass and chat-serve shifts LEFT, which is
       the case worth building the toggle for: on events batch-embed looks like
       the whole problem, and on mass its thrashing turns out to be a great many
       small blocks while chat-serve's recoverable mass sits in fewer large ones.
       Same data, and the two denominations point at different remedies. */
    workload: [
      row("batch-embed", "ETR", 5100, 300000, 1.60, [8000, 22000, 95000, 380000, 1680000, 3900000, 18000000]),
      row("batch-embed", "post_clear", 3900, 150000, 1.55, [5000, 14000, 61000, 240000, 1100000, 2700000, 12600000]),
      row("chat-serve", "ETR", 8200, 700000, 0.60, [720000, 1900000, 5040000, 12600000, 25200000, 39600000, 68400000]),
      row("chat-serve", "post_clear", 2100, 240000, 0.62, [300000, 900000, 2700000, 7200000, 16200000, 27000000, 54000000]),
      row("agentic-tools", "ETR", 5400, 400000, 0.85, [240000, 780000, 2280000, 6600000, 15120000, 24000000, 50400000]),
      row("agentic-tools", "post_clear", 1500, 130000, 0.88, [120000, 400000, 1320000, 4200000, 10800000, 18000000, 43200000]),
      /* BIMODAL BY CONSTRUCTION, and the choice of cut is the point: unattributed
         is whatever nobody labelled, so it is the one bucket most likely to hold
         two mechanisms at once. A single median describes neither of them, which
         is the failure the cut exists to expose, one level further in. */
      row("unattributed", "ETR", 2786, 196102, 1.00, [120000, 200000, 300000, 5400000, 12600000, 19800000, 50400000]),
      row("unattributed", "post_clear", 758, 64340, 1.00, [180000, 560000, 1800000, 5400000, 12600000, 21600000, 46800000]),
      row("batch-embed", "cold", 4200, 240000, 1.00, [88000000, 96000000, 112000000, 140000000, 178000000, 205000000, 240000000]),
      row("chat-serve", "cold", 5400, 430000, 1.00, [95000000, 118000000, 152000000, 195000000, 228000000, 244000000, 256000000]),
      row("agentic-tools", "cold", 3200, 280000, 1.00, [90000000, 108000000, 138000000, 180000000, 218000000, 238000000, 254000000]),
      row("unattributed", "cold", 1400, 93000, 1.00, [92000000, 110000000, 140000000, 182000000, 220000000, 239000000, 255000000])
    ],
    /* The dimension the corpus cannot currently show, because every holder in
       this world runs one model. Blocks are model scoped, so two models are two
       incomparable cache populations and averaging them is worse than averaging
       across instances. A fleet with a 7B beside a 70B shows this first. */
    model: [
      row("Llama-3.1-70B", "ETR", 16386, 1300000, 0.65, [600000, 1600000, 4200000, 10800000, 21600000, 34200000, 61200000]),
      row("Llama-3.1-70B", "post_clear", 4358, 434340, 0.68, [260000, 780000, 2340000, 6600000, 15120000, 25200000, 50400000]),
      row("Qwen2.5-7B", "ETR", 5100, 296102, 1.50, [7000, 19000, 88000, 340000, 1500000, 3600000, 16200000]),
      row("Qwen2.5-7B", "post_clear", 3900, 150000, 1.45, [4000, 12000, 57000, 220000, 1020000, 2500000, 11700000]),
      row("Llama-3.1-70B", "cold", 10500, 800000, 1.00, [93000000, 114000000, 146000000, 188000000, 222000000, 241000000, 256000000]),
      row("Qwen2.5-7B", "cold", 3700, 243000, 1.00, [88000000, 99000000, 118000000, 148000000, 186000000, 212000000, 246000000])
    ]
  };

  /* ── the instance cut carries CURVES, not a median ────────────────────────
     A median has no shape, and shape picks the remedy: two instances at the same
     median, one tight and one heavy tailed, want opposite things. So each
     instance gets its own curve at the grid its sample count supports, the
     population renders as a band, and the instances outside it render as
     themselves.

     This is also the cut that needs NO DECLARATION. Workload is declared and
     frequently absent, so a fleet of one model with unlabelled mixed traffic has
     nothing to decompose by. Shape does not need a label: cohorts discovered
     here are handed to the customer to name, rather than demanded from them
     before the panel will say anything. */
  const IG = grid(180);
  const instances = (function () {
    const r = rng(90210);
    const out = [];
    for (let i = 0; i < POP.instances; i++) {
      const thrashing = i % 10 === 3;
      const med = thrashing ? 60000 + r() * 120000 : 2400000 + Math.pow(r(), 1.7) * 9000000;
      const sigma = thrashing ? 1.55 + r() * 0.25 : 1.2 + r() * 0.3;
      const shift = thrashing ? 1.6 : 0.65;
      const samples = Math.round(140 + r() * 90);
      const curve = function (m) { return IG.map(function (q) { return Math.round(m * Math.exp(sigma * zq(q))); }); };
      out.push({
        instance: "i-" + String(i + 1).padStart(3, "0"),
        workload: thrashing ? "batch-embed" : ["chat-serve", "agentic-tools", "chat-serve", "unattributed"][i % 4],
        samples: samples,
        tokens: Math.round(samples * (thrashing ? 26 : 118)),
        quantiles: IG,
        values: curve(med * shift),
        values_events: curve(med)
      });
    }
    return out;
  })();

  /* The population band: at each quantile, the 10th and 90th across instances.
     The band is the fleet's ordinary behaviour, so a line outside it is the
     finding rather than a line that happens to be drawn darker. */
  const bandOver = function (field) {
    return IG.map(function (q, k) {
      const v = instances.map(function (x) { return x[field][k]; }).sort(function (a, b) { return a - b; });
      return { q: q, lo: v[Math.floor(v.length * 0.10)], hi: v[Math.floor(v.length * 0.90)] };
    });
  };
  const band = bandOver("values");
  const band_events = bandOver("values_events");

  return {
    measure: "gap_ms",
    read_side: true,
    untruncated: true,
    right_censored_at_ms: EXAMINED_HISTORY_MS,
    /* carried separately, because it bounds the CLASS and not the observation */
    w_refetch_ms: W_REFETCH_MS,
    cuts: cuts,
    instances: instances,
    band: band,
    band_events: band_events,
    /* the floor below which a cut refuses rather than draws. A quantile over four
       samples is not a distribution, and a curve that renders anyway teaches a
       reader to trust the next one. */
    min_samples: 400
  };
})();

/* ── there is no CAPACITY here, and the absence is the ruling ──────────────
   A `gap x admission rate` conversion stood here: Little's law on the cache,
   turning retention into residency and rendering a cache-size axis. It was
   wrong twice and it was also DRIFT, because it was never the adopted design.

   Wrong first because a cache is not a TTL. Nothing is evicted after thirty
   minutes; it is evicted when other traffic displaces it. Converting through an
   average admission rate assumes traffic flowed uniformly over the gap, and
   that assumption fails hardest at peak, which is exactly where cache pressure
   lives. Wrong second because the gap distribution is CONDITIONED on the
   eviction having happened, and at a larger capacity those blocks are not
   evicted at all, so the curve describes a fleet that no longer exists at the
   capacity being asked about.

   THE ADOPTED DESIGN IS ORDINAL, NOT TEMPORAL. Ghost depth is the count of
   distinct blocks evicted between a block's eviction and its refetch, read
   straight off the event stream. No admission rate, no uniform-traffic
   assumption, no clock: displacement is MEASURED, which is what the objection
   above demands. Only the second-order term reaches it, and that is the
   trace-conditioning already on record, which is why the ghost is validation
   gated rather than dead.

   So the axis returns depth denominated, on a `ghost_depth` banked per ETR at
   classification time, accumulated in TOKENS rather than block count so it is
   directly comparable to configured KV size. Until that column and its rig
   matrix exist, this panel carries the four jobs it can prove and no fifth. */

/* ── info-hover definitions. Hover teaches; a definition never reads the shape. ── */
const DEFS = {
  recovery: {
    measures: "How long a block sat evicted before the fleet paid to store it again.",
    computed: "Quantiles of the gap between an observed close and the next store of the same block on the same instance. Read side over the window, exact rather than merged from approximate sketches.",
    basis: "Event denominated: one sample per classified store, not per token. Quantiles do not aggregate, so every cut is read from the pass and none is derived from another.",
    bound: "Right censored at examined_history, 72 h: the pass looks back that far, so a longer gap is not in the sketch and no window re-derived from it can be justified wider. w_refetch at 24 h is a different bound and bounds the CLASS, not the observation: gaps past it are banked as cold, which is what lets a wider attribution window be evaluated at all."
  },
  repeat_compute: {
    measures: "Token mass that was stored, evicted or cleared, and then stored again on the same instance.",
    computed: "Sum of n_tokens over stores classified ETR or post_clear. A store counts when its block had a prior observed close within 24 h on the same instance, which is the attribution window w_refetch. Cross-instance overlap is not here: it is registered under capacity and never summed with recompute. See the capacity register.",
    basis: "Token-weighted. sum(coverage x tokens) / sum(tokens) over exactly the classes summed.",
    bound: "Lower bound. Unobserved mass is not counted and is not estimated."
  },
  fraction: {
    measures: "Repeat compute as a share of all token mass stored in the window.",
    computed: "repeat_compute / total_stored, both measured over the same window and the same holders.",
    basis: "Token-weighted, carried from the numerator.",
    bound: "Lower bound. The denominator is also a floor."
  },
  threshold: {
    measures: "The action threshold declared in your configuration.",
    computed: "Not computed. Declared, and drawn as a rule across the measured mass.",
    basis: "Declared input. ACTION_THRESHOLD_DEFAULT is 1.00% until you set it.",
    bound: "None. This is your value, rendered as yours."
  },
  trend: {
    measures: "Daily repeat compute as a fraction of stored mass, one point per day.",
    computed: "Read from the banked daily rollup. Days no pass has covered are hatched, never zeroed.",
    basis: "Token-weighted per day. The ribbon below the series is that day's coverage.",
    bound: "Rollup retention. Daily rows age to monthly under the existing TTL."
  },
  seams: {
    measures: "Points where the meaning of the series changed.",
    computed: "Observed seams come from semantics_version and key_epoch in the record stream. Recorded seams come from the annotations stream, including parameter changes the analyzer writes itself.",
    basis: "Provenance is labeled per marker: observed or recorded.",
    bound: "Rows either side of a breaking seam are different quantities and are never summed."
  },
  residual: {
    measures: "Redundant token mass held across holders at the same instant.",
    computed: "Order statistic over comparable stores within same-model groups. Maxima do not sum across days.",
    basis: "Token-weighted, over comparable stores only.",
    bound: "Raw-window-bounded. Evidence retained about 14 days, so no window scalar exists past that horizon."
  },
  delta: {
    measures: "The difference between two windows of the same quantity.",
    computed: "Later window minus earlier window, both read from the same rollup at the same grain.",
    basis: "Each window carries its own coverage. The two are never blended, so a delta between figures of unequal confidence stays legible as one.",
    bound: "Comparison windows must be discriminator-clean. Where a breaking seam falls inside one, the window scopes to its longest clean range, or the metric is refused."
  },
  scoping: {
    measures: "Which span of each comparison window was actually summed.",
    computed: "A breaking seam inside a window splits it. The longest clean range is used and the excluded span is named.",
    basis: "The discriminator in force over the range summed.",
    bound: "Sums of banked rows can be scoped. A ratio whose denominator spans the seam cannot, and is refused with its reason."
  },
  holders: {
    measures: "Repeat compute per holder, where a holder is one instance, dp_rank and cache group.",
    computed: "The daily rollup at full holder grain, summed over the window.",
    basis: "Token-weighted per holder.",
    bound: "Holder grain is banked, so this survives the raw horizon. Event-grain drill does not."
  },
  state_at_pass: {
    measures: "The holder's staleness state at the moment the pass ran.",
    computed: "From the per-run staleness verdict in force at pass time.",
    basis: "Coverage qualifies this row's figures. State qualifies the holder at pass time. They answer different questions and one does not imply the other.",
    bound: "A holder can carry high coverage and still be silent now, or be reporting now with poor coverage over the window."
  },
  window_time: {
    measures: "Whether telemetry was present over the window at all.",
    computed: "covered_ms / window_ms, from coverage_daily.",
    basis: "Instance-time. This is not the basis of any token mass figure.",
    bound: "A fleet can sit at 99% here and 40% token-weighted, or the reverse."
  },
  ingest: {
    measures: "Segments relayed by the taps and acknowledged by the analyzer.",
    computed: "Counted from the batches ledger. Lag is now minus the newest acknowledged segment's end.",
    basis: "Observed. Nothing here is a scrape.",
    bound: "Pending segments are in flight, not lost."
  },
  odometer: {
    measures: "Records observed since install.",
    computed: "Cumulative count over acknowledged segments.",
    basis: "Observed. Counts records relayed, not records that existed.",
    bound: "Starts at install. It cannot see what happened before the tap ran."
  },
  evidence: {
    measures: "The individual store records a figure was computed from.",
    computed: "Event grain, read from classified_stores joined to the record stream.",
    basis: "Observed records. This is the terminal level: there is nothing beneath it.",
    bound: "Raw-window-bounded. Evidence is retained about 14 days, so a drill past that horizon returns nothing and says so."
  },
  trust: {
    measures: "Whether the meter was looking, and how much of it is reporting now.",
    computed: "Token-weighted coverage over the window, plus per-run staleness states at pass time.",
    basis: "Both bases appear and are labeled. They are not interchangeable.",
    bound: "A summary compresses volume, never valence. Impaired and unexamined counts appear here whenever they exist."
  }
};

/* ── invariants. If one of these ever fails the demo is lying somewhere. ───── */
const INVARIANTS = (function () {
  const holderSum = HOLDERS.reduce((a, x) => a + x.tokens, 0);
  const runSum = RUNS.reduce((a, x) => a + x.count, 0);
  const stateSum = Object.values(HOLDER_STATE_COUNTS).reduce((a, b) => a + b, 0);
  return [
    ["later + earlier = full", sumTokens("later") + sumTokens("earlier") === WASTE_FULL],
    ["ETR + post_clear = full", CLASSES.reduce((a, c) => a + classFull(c), 0) === WASTE_FULL],
    ["sum(holders) = full", holderSum === WASTE_FULL],
    ["holder states = listable", stateSum === POP.holders_listable],
    ["runs = 480", runSum === POP.runs],
    ["seams are in the past", SEAMS.every(s => s.at <= TODAY)],
    ["seam dates match indices", SEAMS.every(s => dayDate(s.day) === s.at)]
  ];
})();
