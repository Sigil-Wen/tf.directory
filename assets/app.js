"use strict";

(() => {
  const app = document.getElementById("app");
  const root = document.documentElement;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  };

  // ---------- theme ----------
  const savedTheme = store.get("tf-theme");
  if (savedTheme === "light" || savedTheme === "dark") root.dataset.theme = savedTheme;
  document.getElementById("theme").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    store.set("tf-theme", root.dataset.theme);
  });

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const yy = (y) => "’" + String(y).slice(2);
  const plural = (n, w) => `${n} ${w === "company" ? (n === 1 ? w : "companies") : w + (n === 1 ? "" : "s")}`;
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

  function money(n) {
    if (!n) return "—";
    const [div, unit] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]].find(([v]) => n >= v) || [1, ""];
    const x = n / div;
    return "$" + +x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2) + unit;
  }

  function initials(name) {
    const w = name.replace(/\(.*?\)/g, "").split(/\s+/).filter((p) => /^[A-Za-zÀ-ž]/.test(p));
    if (!w.length) return "?";
    return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
  }

  const img = (cls, src, s) => `<img class="${cls}" src="${esc(src)}" alt="" width="${s}" height="${s}" style="--s:${s}px" loading="lazy" decoding="async">`;
  const face = (f, s = 40) => (f.photo ? img("face", f.photo, s) : `<span class="face blank" style="--s:${s}px" aria-hidden="true">${esc(initials(f.name))}</span>`);
  const logo = (c, s = 40) => (c.logo ? img(c.logoDark ? "logo on-dark" : "logo", c.logo, s) : `<span class="logo blank" style="--s:${s}px" aria-hidden="true">${esc(c.name[0])}</span>`);
  const stack = (fs, s = 28, n = 3) => `<span class="stack">${fs.slice(0, n).map((f) => face(f, s)).join("")}</span>`;
  const rk = (i) => `<span class="rk${i < 3 ? " lead" : ""}">${i + 1}</span>`;
  const tag = (t) => `<span class="tag">${esc(t)}</span>`;

  const chip = (s) => (s ? `<span class="chip">${esc(s)}</span>` : "");
  const STATUS_LABEL = { public: "Public", private: "Private", acquired: "Acquired", defunct: "Defunct", nonprofit: "Nonprofit", protocol: "Token network" };
  const statusTag = (s) => (s ? `<span class="status ${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>` : "");

  // ---------- state ----------
  const state = {
    protocols: store.get("tf-protocols") !== "0",
    metric: "value",
    f: { q: "", year: "all", sector: "all", sort: "class" },
    c: { q: "", sector: "all", status: "all", year: "all", sort: "value", dir: -1 },
  };

  let fellows = [], companies = [], F = new Map(), C = new Map(), years = [], meta = {};

  const counted = (c) => c.valuationUSD > 0 && (state.protocols || c.status !== "protocol");
  const value = (c) => (counted(c) ? c.valuationUSD : 0);
  const isUnicorn = (c) => !!c.unicorn && (state.protocols || c.status !== "protocol");
  const byValue = (a, b) => value(b) - value(a) || a.name.localeCompare(b.name);
  const topCo = (f) => f.cos.slice().sort(byValue)[0];
  const fellowValue = (f) => Math.max(0, ...f.cos.map(value));
  const ranked = () => companies.filter(counted).sort(byValue);
  const classesOf = (c) => [...new Set(c.fs.map((f) => f.class))].sort((a, b) => a - b);

  const fellowNames = (fs) => fs.map((f) => `<a href="#/fellow/${f.id}">${esc(f.name)}</a>`).join(", ");
  const workOf = (f) => {
    if (f.company) return f.company;
    const built = topCo(f);
    if (built) return built.name;
    return f.previous && f.previous.length ? `Fellowship project: ${f.previous[0]}` : "";
  };
  const companyTags = (c) => {
    const former = c.unicorn && value(c) < 1e9 && c.peakValuationUSD >= 1e9;
    return [c.status === "protocol" && tag("Token network"), c.status === "acquired" && tag("Acquired"), former && tag(`Peak ${money(c.peakValuationUSD)}`)].filter(Boolean).join("");
  };

  const classCache = new Map();
  function classStats(y) {
    const key = `${y}|${state.protocols}`;
    if (classCache.has(key)) return classCache.get(key);
    const fs = fellows.filter((f) => f.class === y);
    const cos = [...new Set(fs.flatMap((f) => f.cos))].sort(byValue);
    const valued = cos.filter((c) => value(c) > 0);
    const r = { year: y, fs, cos, valued, n: fs.length, value: valued.reduce((s, c) => s + value(c), 0), unicorns: cos.filter(isUnicorn).length };
    classCache.set(key, r);
    return r;
  }

  // ---------- components ----------
  function podium(list) {
    return `<div class="podium">${list.slice(0, 3).map((c, i) => `<a class="pod" href="#/company/${c.id}">
      <div class="pod-top"><span class="tile">${i + 1}</span>${logo(c, 52)}</div>
      <div class="pod-name">${esc(c.name)}</div>
      <div class="pod-val">${money(value(c))}</div>
      <div class="pod-note">${esc(c.valuationNote || "")}</div>
      <div class="pod-fs">${stack(c.fs, 26)}<span class="t">${esc(c.fs.map((f) => f.name).join(", "))}</span></div>
    </a>`).join("")}</div>`;
  }

  function companyRows(list, start = 0) {
    if (!list.length) return `<div class="empty">No valued companies yet.</div>`;
    return `<div class="t-head"><span>Rank</span><span>Company</span><span>Fellows</span><span class="h-cls">Class</span><span class="r">Valuation</span></div>
    ${list.map((c, i) => `<div class="t-row">
      ${rk(i + start)}
      <a class="t-co" href="#/company/${c.id}">${logo(c)}<span class="txt"><span class="t-name">${esc(c.name)}</span><span class="t-sub">${esc(c.sector || "")}${companyTags(c)}</span><span class="t-sub m">${esc(c.fs.map((f) => f.name).join(", "))}</span></span></a>
      <div class="founders">${stack(c.fs)}<span class="names">${fellowNames(c.fs)}</span></div>
      <div class="t-cls">${classesOf(c).map((y) => `<a href="#/class/${y}">${y}</a>`).join(", ")}</div>
      <div class="val">${money(value(c))}<small>${esc(c.valuationNote || "")}</small></div>
    </div>`).join("")}`;
  }

  function classScore(r) {
    if (state.metric === "unicorns") return r.unicorns + r.value / 1e16;
    if (state.metric === "per") return r.n ? r.value / r.n : 0;
    return r.value;
  }
  const classRanking = () => years.map(classStats).sort((a, b) => classScore(b) - classScore(a) || a.year - b.year);

  function classBoard() {
    const rows = classRanking();
    const max = Math.max(...rows.map((r) => r.value), 1);
    return `<div class="cl-rows">${rows.map((r, i) => {
      const segs = r.valued.map((c, j) => {
        const w = (value(c) / max) * 100;
        return `<a class="cl-seg s${Math.min(j, 3)}" href="#/company/${c.id}" style="width:${w}%" title="${esc(c.name)} · ${money(value(c))}">${w > 9 ? `<span>${esc(c.name)}</span>` : ""}</a>`;
      }).join("");
      const big = state.metric === "unicorns"
        ? `${r.unicorns}<small>${r.unicorns === 1 ? "unicorn" : "unicorns"}</small>`
        : state.metric === "per"
          ? `${money(r.n ? r.value / r.n : 0)}<small>per fellow</small>`
          : `${money(r.value)}<small>combined</small>`;
      return `<div class="cl-row">
        ${rk(i)}
        <a class="cl-year" href="#/class/${r.year}">${r.year}<small>${plural(r.n, "fellow")} · ${plural(r.unicorns, "unicorn")}</small></a>
        <span class="stack">${r.valued.slice(0, 3).map((c) => logo(c, 30)).join("")}</span>
        <div class="cl-track">${segs}</div>
        <div class="val">${big}</div>
      </div>`;
    }).join("")}</div>`;
  }

  function classAnswer() {
    const w = classRanking()[0];
    if (!w || !w.value) return "";
    const top = w.valued.slice(0, 3).map((c) => `<b>${esc(c.name)}</b>`).join(", ");
    const why = state.metric === "unicorns"
      ? `${plural(w.unicorns, "unicorn")} from ${plural(w.n, "fellow")}`
      : state.metric === "per"
        ? `${money(w.value / w.n)} of company value per fellow`
        : `${money(w.value)} in combined company value`;
    return `The class of ${w.year} leads with ${why}, driven by ${top}.`;
  }

  const metricSeg = () => `<div class="seg" role="group" aria-label="Rank classes by">
    ${[["value", "Combined value"], ["unicorns", "Unicorns"], ["per", "Value per fellow"]].map(([k, l]) => `<button type="button" data-metric="${k}" class="${state.metric === k ? "on" : ""}" aria-pressed="${state.metric === k}">${l}</button>`).join("")}
  </div>`;

  const protoSwitch = () => `<label class="switch" title="Ethereum and Polkadot are token networks, not companies"><input type="checkbox" data-protocols ${state.protocols ? "checked" : ""}> Count token networks</label>`;

  function listCard({ kicker, title, href, rows, total, wide }) {
    const shown = rows.length;
    return `<article class="lcard${wide ? " wide" : ""}">
      <div class="lc-top"><span>${esc(kicker)}</span><a class="lc-btn" href="${href}">View list →</a></div>
      <h3>${esc(title)}</h3>
      <div class="li-rows${wide ? " two" : ""}">${rows.map((r, i) => `<a class="li" href="${r.href}">${rk(i)}${r.img}<span class="li-t">${esc(r.t)}</span>${r.v ? `<span class="li-v">${esc(r.v)}</span>` : ""}</a>`).join("")}</div>
      ${total > shown ? `<p class="li-more">+ ${total - shown} others</p>` : ""}
    </article>`;
  }

  function fellowCard(f) {
    const c = topCo(f);
    const media = f.photo
      ? `<img class="photo" src="${esc(f.photo)}" alt="" loading="lazy" decoding="async">`
      : c && c.logo ? logo(c, 64) : `<span class="ini" aria-hidden="true">${esc(initials(f.name))}</span>`;
    return `<a class="f-card" href="#/fellow/${f.id}">
      <div class="fc-media">${media}<span class="tile">${yy(f.class)}</span></div>
      <div class="fc-body"><div class="fc-name">${esc(f.name)}</div><div class="fc-co">${esc(workOf(f))}</div></div>
    </a>`;
  }

  const facts = (rows) => `<dl class="facts">${rows.filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

  // ---------- views ----------
  function viewHome() {
    const list = ranked();
    const total = list.reduce((s, c) => s + value(c), 0);
    const unicorns = companies.filter(isUnicorn).length;
    const billionaires = fellows.filter((f) => f.billionaire).sort((a, b) => (a.billionaire === "current" ? 0 : 1) - (b.billionaire === "current" ? 0 : 1) || fellowValue(b) - fellowValue(a));
    const current = billionaires.filter((f) => f.billionaire === "current").length;
    const classes = years.map(classStats).sort((a, b) => b.value - a.value || a.year - b.year);
    const sectors = [...new Set(list.map((c) => c.sector).filter(Boolean))]
      .map((s) => ({ s, cos: list.filter((c) => c.sector === s) }))
      .filter((x) => x.cos.length >= 3)
      .sort((a, b) => b.cos.reduce((n, c) => n + value(c), 0) - a.cos.reduce((n, c) => n + value(c), 0))
      .slice(0, 3);
    const html = `
      <header class="page-head" style="padding-bottom:0">
        <h1 class="title">The Thiel Fellow List</h1>
        <p class="sub">The Thiel Fellowship pays young people $250,000 over two years to skip or leave college and build something. This is everyone who took the deal since ${years[0]}, ranked by what they built.</p>
        <section class="stats" aria-label="Directory totals">
          <div class="stat"><b>${money(total)}</b><span>Combined company value</span></div>
          <div class="stat"><b>${unicorns}</b><span>Unicorns built</span></div>
          <div class="stat"><b>${current}</b><span>Billionaires</span></div>
          <div class="stat"><b>${fellows.length}</b><span>Fellows</span></div>
          <div class="stat"><b>${years.length}</b><span>Classes</span></div>
        </section>
      </header>

      <section class="sect" style="padding-top:36px">
        <div class="sect-head"><h2>The most valuable companies fellows built</h2><div class="controls">${protoSwitch()}</div></div>
        ${podium(list)}
        <div style="margin-top:28px">${companyRows(list.slice(3, 12), 3)}</div>
        <a class="btn-wide" href="#/leaderboard">See all ${list.length} ranked companies</a>
      </section>

      <section class="sect">
        <div class="sect-head"><h2>More lists</h2></div>
        <div class="lists">
          ${listCard({ kicker: "Classes", title: "Which class won?", href: "#/classes", wide: true, total: classes.length,
            rows: classes.map((r) => ({ href: `#/class/${r.year}`, img: `<span class="yr">${yy(r.year)}</span>`, t: r.valued[0] ? `${r.year} · ${r.valued[0].name}` : `${r.year}`, v: r.value ? money(r.value) : "—" })) })}
          ${billionaires.length ? listCard({ kicker: "People", title: "Billionaires", href: "#/leaderboard#billionaires", total: billionaires.length,
            rows: billionaires.slice(0, 5).map((f) => ({ href: `#/fellow/${f.id}`, img: face(f, 30), t: f.name, v: f.billionaire === "former" ? "Former" : "" })) }) : ""}
          ${sectors.map(({ s, cos }) => listCard({ kicker: "Sector", title: s, href: `#/leaderboard/${encodeURIComponent(s)}`, total: cos.length,
            rows: cos.slice(0, 5).map((c) => ({ href: `#/company/${c.id}`, img: logo(c, 30), t: c.name, v: money(value(c)) })) })).join("")}
        </div>
      </section>`;
    return { html };
  }

  function viewLeaderboard(sector) {
    const all = ranked();
    const sectors = [...new Set(all.map((c) => c.sector).filter(Boolean))]
      .sort((a, b) => all.filter((c) => c.sector === b).length - all.filter((c) => c.sector === a).length || a.localeCompare(b));
    if (sector && !sectors.includes(sector)) return viewNotFound();
    const list = sector ? all.filter((c) => c.sector === sector) : all;
    const billionaires = fellows.filter((f) => f.billionaire).sort((a, b) => (a.billionaire === "current" ? 0 : 1) - (b.billionaire === "current" ? 0 : 1) || fellowValue(b) - fellowValue(a));
    const html = `
      <header class="page-head">
        <h1 class="title">${sector ? esc(sector) : "Valuation leaderboard"}</h1>
        <p class="sub">${plural(list.length, "company")} founded or co-founded by Thiel Fellows, ranked by latest public valuation: last priced round, public market cap, token market cap or acquisition price.</p>
      </header>
      <div class="toolbar">
        <nav class="tabs" aria-label="Filter by sector"><a href="#/leaderboard" class="${sector ? "" : "on"}">All</a>${sectors.map((s) => `<a href="#/leaderboard/${encodeURIComponent(s)}" class="${s === sector ? "on" : ""}">${esc(s)}</a>`).join("")}</nav>
        ${protoSwitch()}
      </div>
      ${companyRows(list)}
      <p class="note">A company appears once even when several fellows co-founded it.</p>

      ${billionaires.length && !sector ? `<section class="sect" id="billionaires">
        <div class="sect-head"><div><h2>Billionaire fellows</h2><p>Forbes real-time estimates as of ${esc(meta.updated || "today")}, plus fellows who were billionaires in the past.</p></div></div>
        <div class="b-rows">${billionaires.map((f) => `<a class="b-row" href="#/fellow/${f.id}">${face(f, 44)}<span><span class="b-name">${esc(f.name)}</span><span class="b-note">${esc(f.billionaireNote || "")}</span></span><span class="t-cls b-cls">${f.class}</span><span class="r">${tag(f.billionaire === "current" ? "Billionaire" : "Former")}</span></a>`).join("")}</div>
      </section>` : ""}`;
    return { html, title: sector ? `${sector} leaderboard` : "Valuation leaderboard" };
  }

  function viewClasses() {
    const html = `
      <header class="page-head">
        <h1 class="title">Which class won?</h1>
        <p class="sub" id="class-answer">${classAnswer()}</p>
      </header>
      <div class="toolbar">${metricSeg()}${protoSwitch()}</div>
      <div id="class-board">${classBoard()}</div>
      <p class="note">Bars show each class’s companies by current value. A company with fellows from two classes counts for both.</p>`;
    return { html, title: "Classes" };
  }

  function viewClass(y) {
    if (!years.includes(y)) return viewNotFound();
    const r = classStats(y);
    const i = years.indexOf(y);
    const prev = years[i - 1], next = years[i + 1];
    const rank = years.map(classStats).sort((a, b) => b.value - a.value).indexOf(r) + 1;
    const fs = r.fs.slice().sort((a, b) => fellowValue(b) - fellowValue(a) || !!b.photo - !!a.photo || a.name.localeCompare(b.name));
    const html = `
      <a class="back" href="#/classes">← All classes</a>
      <header>
        <h1 class="title">Class of ${y}</h1>
        <section class="stats" style="grid-template-columns:repeat(4,minmax(0,1fr))" aria-label="Class totals">
          <div class="stat"><b>${money(r.value)}</b><span>Combined value</span></div>
          <div class="stat"><b>${r.value ? "#" + rank : "—"}</b><span>Rank of ${years.length} classes</span></div>
          <div class="stat"><b>${r.unicorns}</b><span>Unicorns</span></div>
          <div class="stat"><b>${r.n}</b><span>Fellows</span></div>
        </section>
      </header>
      ${r.valued.length ? `<section class="sect" style="padding-top:36px">
        <div class="sect-head"><h2>Companies</h2><div class="controls">${protoSwitch()}</div></div>
        ${companyRows(r.valued)}
      </section>` : ""}
      <section class="sect">
        <div class="sect-head"><h2>Fellows</h2></div>
        <div class="fgrid">${fs.map(fellowCard).join("")}</div>
      </section>
      <nav class="pn">
        ${prev ? `<a href="#/class/${prev}"><small>← Previous class</small><b>Class of ${prev}</b></a>` : "<span></span>"}
        ${next ? `<a class="next" href="#/class/${next}"><small>Next class →</small><b>Class of ${next}</b></a>` : ""}
      </nav>`;
    return { html, title: `Class of ${y}` };
  }

  function viewCompanies() {
    const s = state.c;
    const sectors = [...new Set(companies.map((c) => c.sector).filter(Boolean))].sort();
    const statuses = [...new Set(companies.map((c) => c.status).filter(Boolean))];
    const html = `
      <header class="page-head">
        <h1 class="title">Companies</h1>
        <p class="sub">${plural(companies.length, "company")} and projects founded or led by Thiel Fellows. Click a column to sort.</p>
      </header>
      <div class="filters">
        <input class="input grow" id="cq" type="search" placeholder="Search companies or founders…" value="${esc(s.q)}" aria-label="Search companies">
        <select class="input" id="cs" aria-label="Sector"><option value="all">All sectors</option>${sectors.map((x) => `<option ${s.sector === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>
        <select class="input" id="ct" aria-label="Status"><option value="all">Any status</option>${statuses.map((x) => `<option value="${esc(x)}" ${s.status === x ? "selected" : ""}>${esc(STATUS_LABEL[x] || x)}</option>`).join("")}</select>
        <select class="input" id="cy" aria-label="Class"><option value="all">All classes</option>${years.map((y) => `<option ${String(s.year) === String(y) ? "selected" : ""}>${y}</option>`).join("")}</select>
        ${protoSwitch()}
      </div>
      <div id="results"></div>`;

    function update() {
      const q = s.q.trim().toLowerCase();
      let list = companies.filter((c) =>
        (s.sector === "all" || c.sector === s.sector) &&
        (s.status === "all" || c.status === s.status) &&
        (s.year === "all" || c.fs.some((f) => String(f.class) === String(s.year))) &&
        (!q || [c.name, c.sector, ...c.fs.map((f) => f.name)].join(" ").toLowerCase().includes(q)));
      const minYear = (c) => Math.min(...c.fs.map((f) => f.class));
      const keyFn = {
        name: (a, b) => a.name.localeCompare(b.name),
        class: (a, b) => minYear(a) - minYear(b) || byValue(a, b),
        sector: (a, b) => (a.sector || "~").localeCompare(b.sector || "~") || byValue(a, b),
        status: (a, b) => (a.status || "~").localeCompare(b.status || "~") || byValue(a, b),
        value: (a, b) => value(a) - value(b) || b.name.localeCompare(a.name),
        raised: (a, b) => (a.totalRaisedUSD || 0) - (b.totalRaisedUSD || 0) || byValue(b, a),
      }[s.sort];
      list.sort((a, b) => keyFn(a, b) * (s.sort === "value" || s.sort === "raised" ? s.dir : -s.dir));
      const th = (k, label, cls = "") => `<button type="button" class="${cls}${s.sort === k ? " on" : ""}" data-sort="${k}">${label}${s.sort === k ? (s.dir === -1 ? " ↓" : " ↑") : ""}</button>`;
      document.getElementById("results").innerHTML = `
        <p class="count">${plural(list.length, "company")}</p>
        ${list.length ? `<div class="ct"><div class="t-head">
          <span>#</span>${th("name", "Company")}${th("sector", "Sector", "h-sector")}${th("status", "Status")}${th("value", "Valuation", "r")}${th("raised", "Raised", "r h-raised")}
        </div>
        ${list.map((c, i) => `<div class="t-row">
          <span class="rk">${i + 1}</span>
          <a class="t-co" href="#/company/${c.id}">${logo(c)}<span class="txt"><span class="t-name">${esc(c.name)}</span><span class="t-sub">${esc(c.fs.map((f) => f.name).join(", "))}</span><span class="t-sub m">${esc(c.fs.map((f) => f.name).join(", "))}</span></span></a>
          <span class="t-sector">${chip(c.sector)}</span>
          <span class="t-status">${statusTag(c.status)}</span>
          <span class="val">${value(c) ? money(value(c)) : `<span class="none">${c.status === "nonprofit" ? "Nonprofit" : "Not public"}</span>`}<small>${value(c) ? esc(c.valuationNote || "") : ""}</small></span>
          <span class="t-raised">${money(c.totalRaisedUSD)}</span>
        </div>`).join("")}</div>` : `<div class="empty">No companies match.</div>`}`;
    }

    function mount() {
      const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
      on("cq", "input", (e) => { s.q = e.target.value; update(); });
      on("cs", "change", (e) => { s.sector = e.target.value; update(); });
      on("ct", "change", (e) => { s.status = e.target.value; update(); });
      on("cy", "change", (e) => { s.year = e.target.value; update(); });
      document.getElementById("results").addEventListener("click", (e) => {
        const b = e.target.closest("[data-sort]");
        if (!b) return;
        const k = b.dataset.sort;
        if (s.sort === k) s.dir = -s.dir; else { s.sort = k; s.dir = k === "value" || k === "raised" ? -1 : 1; }
        update();
      });
      update();
    }
    return { html, mount, title: "Companies", rerender: update };
  }

  function viewCompany(id) {
    const c = C.get(id);
    if (!c) return viewNotFound();
    const rank = ranked().indexOf(c) + 1;
    const url = safeUrl(c.url);
    const sources = (c.sources || []).map(safeUrl).filter(Boolean);
    const shown = value(c) || c.valuationUSD;
    const html = `
      <a class="back" href="#/companies">← All companies</a>
      <div class="profile">
        <aside class="p-side">
          <div class="p-media">${logo(c, 128)}</div>
          ${facts([
            ["Rank", rank ? `#${rank}` : ""],
            ["Peak valuation", c.peakValuationUSD ? money(c.peakValuationUSD) : ""],
            ["Total raised", c.totalRaisedUSD ? money(c.totalRaisedUSD) : ""],
            ["Status", c.status ? esc(STATUS_LABEL[c.status] || c.status) : ""],
            ["Sector", esc(c.sector || "")],
            ["Website", url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(host(url))} ↗</a>` : ""],
          ])}
        </aside>
        <div class="p-main">
          <h1>${esc(c.name)}</h1>
          <div class="worth"><small>Valuation</small><b>${shown ? money(shown) : "—"}</b><small>${esc(c.valuationNote || "Valuation not public")}</small></div>
          ${c.valuationDetail ? `<p class="prose">${esc(c.valuationDetail)}</p>` : ""}
          <p class="sect-label">Thiel Fellows behind it</p>
          <div class="fgrid">${c.fs.map(fellowCard).join("")}</div>
          ${sources.length ? `<p class="sect-label">Sources</p><ul class="sources">${sources.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join("")}</ul>` : ""}
        </div>
      </div>`;
    return { html, title: c.name };
  }

  function viewFellows() {
    const s = state.f;
    const sectors = [...new Set(fellows.map((f) => f.sector).filter(Boolean))].sort();
    const html = `
      <header class="page-head">
        <h1 class="title">All ${fellows.length} fellows</h1>
        <p class="sub">Every Thiel Fellow from ${years[0]} to ${years[years.length - 1]}, and what they are working on now.</p>
      </header>
      <div class="filters">
        <input class="input grow" id="fq" type="search" placeholder="Search names, companies, cities…" value="${esc(s.q)}" aria-label="Search fellows">
        <select class="input" id="fs" aria-label="Sector"><option value="all">All sectors</option>${sectors.map((x) => `<option ${s.sector === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>
        <select class="input" id="fo" aria-label="Sort">
          <option value="class" ${s.sort === "class" ? "selected" : ""}>Group by class</option>
          <option value="value" ${s.sort === "value" ? "selected" : ""}>Company value</option>
          <option value="name" ${s.sort === "name" ? "selected" : ""}>Name A–Z</option>
        </select>
      </div>
      <div class="seg tabs" id="fy" role="group" aria-label="Class">${["all", ...years].map((y) => `<button type="button" data-y="${y}" class="${String(s.year) === String(y) ? "on" : ""}">${y === "all" ? "All" : y}</button>`).join("")}</div>
      <div id="results"></div>`;

    const hay = (f) => [f.name, f.company, f.role, f.location, f.sector, f.class, ...(f.previous || [])].join(" ").toLowerCase();

    function update() {
      const q = s.q.trim().toLowerCase();
      const list = fellows.filter((f) =>
        (s.year === "all" || String(f.class) === String(s.year)) &&
        (s.sector === "all" || f.sector === s.sector) &&
        (!q || hay(f).includes(q)));
      let out;
      if (!list.length) out = `<div class="empty">No fellows match.</div>`;
      else if (s.sort === "class") {
        const groups = years.map((y) => [y, list.filter((f) => f.class === y).sort((a, b) => fellowValue(b) - fellowValue(a) || !!b.photo - !!a.photo || a.name.localeCompare(b.name))]).filter(([, g]) => g.length);
        out = groups.map(([y, g]) => `<h2 class="group-h"><a href="#/class/${y}">Class of ${y}</a><span>${plural(g.length, "fellow")}</span></h2><div class="fgrid">${g.map(fellowCard).join("")}</div>`).join("");
      } else {
        list.sort(s.sort === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => fellowValue(b) - fellowValue(a) || a.name.localeCompare(b.name));
        out = `<div class="fgrid">${list.map(fellowCard).join("")}</div>`;
      }
      document.getElementById("results").innerHTML = `<p class="count">${list.length === fellows.length ? `${fellows.length} fellows` : `${list.length} of ${fellows.length} fellows`}</p>${out}`;
    }

    function mount() {
      document.getElementById("fq").addEventListener("input", (e) => { s.q = e.target.value; update(); });
      document.getElementById("fs").addEventListener("change", (e) => { s.sector = e.target.value; update(); });
      document.getElementById("fo").addEventListener("change", (e) => { s.sort = e.target.value; update(); });
      document.getElementById("fy").addEventListener("click", (e) => {
        const b = e.target.closest("[data-y]");
        if (!b) return;
        s.year = b.dataset.y === "all" ? "all" : +b.dataset.y;
        document.querySelectorAll("#fy button").forEach((x) => x.classList.toggle("on", x === b));
        update();
      });
      update();
    }
    return { html, mount, title: "Fellows", rerender: update };
  }

  function viewFellow(id) {
    const f = F.get(id);
    if (!f) return viewNotFound();
    const mates = fellows.filter((x) => x.class === f.class).sort((a, b) => fellowValue(b) - fellowValue(a) || a.name.localeCompare(b.name));
    const i = mates.indexOf(f);
    const prev = mates[i - 1], next = mates[i + 1];
    const others = mates.filter((x) => x !== f).slice(0, 9);
    const links = [
      f.x && [`https://x.com/${encodeURIComponent(f.x.replace(/^@/, ""))}`, `@${f.x.replace(/^@/, "")}`],
      safeUrl(f.linkedin) && [f.linkedin, "LinkedIn"],
      safeUrl(f.website) && [f.website, host(f.website)],
    ].filter(Boolean);
    const sources = (f.sources || []).map(safeUrl).filter(Boolean);
    const cos = f.cos.slice().sort(byValue);
    const top = cos[0] && value(cos[0]) ? cos[0] : null;
    const linked = cos.find((c) => c.name === f.company);
    const html = `
      <a class="back" href="#/fellows">← All fellows</a>
      <div class="profile">
        <aside class="p-side">
          <div class="p-media">${f.photo ? `<img src="${esc(f.photo)}" alt="Portrait of ${esc(f.name)}">` : `<span class="ini" aria-hidden="true">${esc(initials(f.name))}</span>`}</div>
          ${facts([
            ["Class", `<a href="#/class/${f.class}">${f.class}</a>`],
            ["Company", f.company ? (linked ? `<a href="#/company/${linked.id}">${esc(f.company)}</a>` : esc(f.company)) : ""],
            ["Role", esc(f.role || "")],
            ["Sector", esc(f.sector || "")],
            ["Based in", esc(f.location || "")],
          ])}
          ${links.length ? `<div class="links">${links.map(([u, l]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join("")}</div>` : ""}
        </aside>
        <div class="p-main">
          <h1>${esc(f.name)}</h1>
          <div class="p-sub">${esc(workOf(f))}${f.billionaire ? tag(f.billionaire === "current" ? "Billionaire" : "Former billionaire") : ""}</div>
          ${top ? `<div class="worth"><small>Value of ${esc(top.name)}</small><b>${money(value(top))}</b><small>${esc(top.valuationNote || "")}. This is the company’s value, not personal net worth.</small></div>` : ""}
          ${f.bio ? `<p class="prose">${esc(f.bio)}</p>` : ""}
          ${f.billionaire && f.billionaireNote ? `<p class="sect-label">Net worth</p><p style="margin:0">${esc(f.billionaireNote)}${safeUrl(f.billionaireSource) ? ` <a href="${esc(f.billionaireSource)}" target="_blank" rel="noopener" style="text-decoration:underline;text-underline-offset:3px">${esc(host(f.billionaireSource))} ↗</a>` : ""}</p>` : ""}
          ${cos.length ? `<p class="sect-label">Companies</p><div class="co-list">${cos.map((c) => `<a class="co-row" href="#/company/${c.id}">${logo(c)}<span class="txt"><span class="t-name">${esc(c.name)}</span><span class="t-sub">${esc(c.sector || "")}</span></span><span class="val">${value(c) ? money(value(c)) : `<span class="none">${c.status === "nonprofit" ? "Nonprofit" : "Not public"}</span>`}</span></a>`).join("")}</div>` : ""}
          ${f.previous && f.previous.length ? `<p class="sect-label">Previously</p><div class="taglist">${f.previous.map((p) => `<span>${esc(p)}</span>`).join("")}</div>` : ""}
          <p class="sect-label">Class of ${f.class}</p>
          <div class="mates">${others.map((m) => `<a class="mate" href="#/fellow/${m.id}">${face(m, 34)}<span class="t"><b>${esc(m.name)}</b><small>${esc(m.company || topCo(m)?.name || "") || "&nbsp;"}</small></span></a>`).join("")}</div>
          ${sources.length ? `<p class="sect-label">Sources</p><ul class="sources">${sources.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join("")}</ul>` : ""}
          ${f.confidence && f.confidence !== "high" ? `<p class="conf">Class year confidence: ${esc(f.confidence)}. Know better? This is an independent project built from public sources.</p>` : ""}
          <nav class="pn">
            ${prev ? `<a href="#/fellow/${prev.id}"><small>← Previous in ${f.class}</small><b>${esc(prev.name)}</b></a>` : "<span></span>"}
            ${next ? `<a class="next" href="#/fellow/${next.id}"><small>Next in ${f.class} →</small><b>${esc(next.name)}</b></a>` : ""}
          </nav>
        </div>
      </div>`;
    return { html, title: f.name };
  }

  function viewNotFound() {
    return { html: `<header class="page-head"><h1 class="title">Nothing here.</h1><p class="sub"><a href="#/" style="text-decoration:underline;text-underline-offset:3px">Back to the list</a></p></header>`, title: "Not found" };
  }

  // ---------- router ----------
  let lastPath = null, current = null;
  function render() {
    const path = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [full, anchor] = path.split("#");
    const [p = "", a] = full.split("/");
    const views = {
      "": viewHome,
      leaderboard: () => viewLeaderboard(a),
      classes: () => (a ? viewClass(+a) : viewClasses()),
      class: () => viewClass(+a),
      companies: viewCompanies,
      company: () => viewCompany(a),
      fellows: viewFellows,
      fellow: () => viewFellow(a),
    };
    current = (views[p] || viewNotFound)();
    app.innerHTML = current.html;
    document.title = current.title ? `${current.title} · tf.directory` : "tf.directory — every Thiel Fellow";
    const navKey = { class: "classes", company: "companies", fellow: "fellows" }[p] || p;
    document.querySelectorAll(".nav a").forEach((el) => el.classList.toggle("on", el.dataset.nav === navKey));
    current.mount?.();
    if (path !== lastPath) {
      lastPath = path;
      const target = anchor && document.getElementById(anchor);
      if (target) target.scrollIntoView();
      else window.scrollTo(0, 0);
    }
  }

  // Class metric + protocol toggles work on any view that shows them.
  app.addEventListener("click", (e) => {
    const b = e.target.closest("[data-metric]");
    if (!b) return;
    state.metric = b.dataset.metric;
    document.querySelectorAll("[data-metric]").forEach((x) => { x.classList.toggle("on", x.dataset.metric === state.metric); x.setAttribute("aria-pressed", x.dataset.metric === state.metric); });
    const ans = document.getElementById("class-answer"), board = document.getElementById("class-board");
    if (ans) ans.innerHTML = classAnswer();
    if (board) board.innerHTML = classBoard();
  });
  app.addEventListener("change", (e) => {
    if (!e.target.matches("[data-protocols]")) return;
    state.protocols = e.target.checked;
    store.set("tf-protocols", state.protocols ? "1" : "0");
    const y = window.scrollY;
    if (current.rerender) {
      document.querySelectorAll("[data-protocols]").forEach((x) => { x.checked = state.protocols; });
      current.rerender();
    } else {
      render();
      window.scrollTo(0, y);
    }
  });

  // ---------- search palette ----------
  const pal = document.getElementById("pal");
  const palQ = document.getElementById("pal-q");
  const palList = document.getElementById("pal-list");
  let palItems = [], palIdx = 0, lastFocus = null;

  function palSearch(q) {
    q = q.trim().toLowerCase();
    const score = (name, extra) => {
      const n = name.toLowerCase();
      if (!q) return 1;
      if (n.startsWith(q)) return 4;
      if (n.split(/\s+/).some((w) => w.startsWith(q))) return 3;
      if (n.includes(q)) return 2;
      if (extra && extra.toLowerCase().includes(q)) return 1;
      return 0;
    };
    const items = [];
    for (const f of fellows) {
      const s = score(f.name, `${f.company || ""} ${f.class}`);
      if (s) items.push({ s: s + fellowValue(f) / 1e14, href: `#/fellow/${f.id}`, ico: face(f, 32), t: f.name, sub: [f.company, `Class of ${f.class}`].filter(Boolean).join(" · "), k: "Fellow" });
    }
    for (const c of companies) {
      const s = score(c.name, c.fs.map((f) => f.name).join(" "));
      if (s) items.push({ s: s + 0.5 + value(c) / 1e14, href: `#/company/${c.id}`, ico: logo(c, 32), t: c.name, sub: [value(c) ? money(value(c)) : null, c.fs.map((f) => f.name).join(", ")].filter(Boolean).join(" · "), k: "Company" });
    }
    for (const y of years) {
      if (q && !String(y).includes(q) && !`class of ${y}`.includes(q)) continue;
      items.push({ s: q ? 5 : 0, href: `#/class/${y}`, ico: `<span class="yr">${yy(y)}</span>`, t: `Class of ${y}`, sub: plural(classStats(y).n, "fellow"), k: "Class" });
    }
    return items.sort((a, b) => b.s - a.s).slice(0, q ? 40 : 12);
  }

  function palRender() {
    palItems = palSearch(palQ.value);
    palIdx = Math.min(palIdx, Math.max(0, palItems.length - 1));
    palList.innerHTML = palItems.length
      ? palItems.map((it, i) => `<a class="pal-item${i === palIdx ? " on" : ""}" href="${it.href}" role="option" aria-selected="${i === palIdx}" data-i="${i}">${it.ico}<span class="t"><b>${esc(it.t)}</b><small>${esc(it.sub)}</small></span><span class="k">${it.k}</span></a>`).join("")
      : `<div class="pal-empty">No matches.</div>`;
  }
  function palMove(d) {
    if (!palItems.length) return;
    palIdx = (palIdx + d + palItems.length) % palItems.length;
    palList.querySelectorAll(".pal-item").forEach((el, i) => { el.classList.toggle("on", i === palIdx); el.setAttribute("aria-selected", i === palIdx); });
    palList.querySelector(".pal-item.on")?.scrollIntoView({ block: "nearest" });
  }
  function palOpen() {
    if (!fellows.length) return;
    lastFocus = document.activeElement;
    pal.hidden = false;
    palQ.value = "";
    palIdx = 0;
    palRender();
    palQ.focus();
  }
  function palClose() {
    pal.hidden = true;
    lastFocus?.focus?.();
  }
  document.getElementById("open-search").addEventListener("click", palOpen);
  palQ.addEventListener("input", () => { palIdx = 0; palRender(); });
  palQ.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); palMove(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); palMove(-1); }
    else if (e.key === "Enter") { e.preventDefault(); const it = palItems[palIdx]; if (it) { palClose(); location.hash = it.href; } }
    else if (e.key === "Escape") { e.preventDefault(); palClose(); }
  });
  palList.addEventListener("click", (e) => { if (e.target.closest(".pal-item")) palClose(); });
  pal.addEventListener("mousedown", (e) => { if (e.target === pal) palClose(); });
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
      e.preventDefault();
      pal.hidden ? palOpen() : palClose();
    } else if (e.key === "Escape" && !pal.hidden) palClose();
  });

  // ---------- boot ----------
  async function boot() {
    try {
      const [fd, cd] = await Promise.all([
        fetch("data/fellows.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
        fetch("data/companies.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      ]);
      meta = fd.meta || {};
      fellows = fd.fellows;
      companies = cd.companies;
    } catch (err) {
      app.innerHTML = `<div class="loading">Couldn’t load the directory data (${esc(err.message)}).</div>`;
      return;
    }
    F = new Map(fellows.map((f) => [f.id, f]));
    C = new Map(companies.map((c) => [c.id, c]));
    for (const f of fellows) f.cos = [];
    for (const c of companies) {
      c.fs = (c.fellows || []).map((id) => F.get(id)).filter(Boolean).sort((a, b) => a.class - b.class || a.name.localeCompare(b.name));
      for (const f of c.fs) f.cos.push(c);
    }
    years = [...new Set(fellows.map((f) => f.class))].sort((a, b) => a - b);
    if (meta.updated) document.getElementById("updated").textContent = `Last updated ${meta.updated}.`;
    window.addEventListener("hashchange", render);
    render();
  }
  boot();
})();
