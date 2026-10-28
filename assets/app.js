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
  const pad = (n) => String(n).padStart(2, "0");
  const yy = (y) => "’" + String(y).slice(2);
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

  function money(n) {
    if (!n) return "—";
    const [div, unit] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]].find(([v]) => n >= v) || [1, ""];
    const x = n / div;
    return "$" + +x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2) + unit;
  }

  const hue = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; };
  function initials(name) {
    const w = name.replace(/\(.*?\)/g, "").split(/\s+/).filter((p) => /^[A-Za-zÀ-ž]/.test(p));
    if (!w.length) return "?";
    return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
  }
  const mono = (f, s) => `<span class="mono" style="--h:${hue(f.name)}${s ? `;--s:${s}px` : ""}" aria-hidden="true">${esc(initials(f.name))}</span>`;

  const SECTOR_HUE = {
    "AI": 245, "Crypto": 275, "Bio & Health": 150, "Hardware & Deep Tech": 28, "Energy & Climate": 95,
    "Space & Defense": 200, "Fintech": 170, "Consumer": 330, "Software & SaaS": 220, "Education": 45,
    "Research": 5, "Investing": 60,
  };
  const chip = (s) => (s ? `<span class="chip${SECTOR_HUE[s] == null ? " gray" : ""}"><i style="--h:${SECTOR_HUE[s] ?? 0}"></i>${esc(s)}</span>` : "");
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

  const fellowLinks = (fs) => fs.map((f) => `<a href="#/fellow/${f.id}">${esc(f.name)}</a> <span class="yy">${yy(f.class)}</span>`).join(", ");
  const companyLine = (f) => {
    if (f.company) return `<b>${esc(f.company)}</b>${f.role ? ` · ${esc(f.role)}` : ""}`;
    const built = f.cos.slice().sort(byValue)[0];
    if (built) return `<span class="muted">Built</span> <b>${esc(built.name)}</b>`;
    if (f.previous && f.previous.length) return `<span class="muted">Fellowship project:</span> ${esc(f.previous[0])}`;
    return f.role ? esc(f.role) : `<span class="muted">Current work not listed</span>`;
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
  const logW = (v, max) => (v ? Math.max(1.5, ((Math.log10(v) - 7) / (Math.log10(max) - 7)) * 100) : 0);

  function companyBoard(list, max) {
    if (!list.length) return `<div class="empty">No valued companies yet.</div>`;
    return `<div class="board">${list.map((c, i) => {
      const v = value(c);
      const former = c.unicorn && v < 1e9 && c.peakValuationUSD >= 1e9;
      return `<div class="lb-row">
        <span class="rank">${pad(i + 1)}</span>
        <div class="lb-main">
          <a class="lb-name" href="#/company/${c.id}">${esc(c.name)}</a>${c.status === "protocol" ? `<span class="tag dim">Token network</span>` : ""}${c.status === "acquired" ? `<span class="tag dim">Acquired</span>` : ""}${former ? `<span class="tag gold">Peak ${money(c.peakValuationUSD)}</span>` : ""}
          <span class="lb-sub">${fellowLinks(c.fs)}</span>
        </div>
        <div class="bar" title="${esc(c.name)}: ${money(v)}"><i style="width:${logW(v, max)}%"></i></div>
        <div class="lb-val">${money(v)}<small>${esc(c.valuationNote || "")}</small></div>
      </div>`;
    }).join("")}</div>`;
  }

  function classScore(r) {
    if (state.metric === "unicorns") return r.unicorns + r.value / 1e16;
    if (state.metric === "per") return r.n ? r.value / r.n : 0;
    return r.value;
  }

  function classBoard() {
    const rows = years.map(classStats).sort((a, b) => classScore(b) - classScore(a) || a.year - b.year);
    const max = Math.max(...rows.map((r) => r.value), 1);
    return `<div class="board">${rows.map((r, i) => {
      const segs = r.valued.map((c, j) => {
        const w = (value(c) / max) * 100;
        return `<a class="cl-seg s${Math.min(j, 3)}" href="#/company/${c.id}" style="width:${w}%" title="${esc(c.name)} · ${money(value(c))}">${w > 9 ? `<span>${esc(c.name)}</span>` : ""}</a>`;
      }).join("");
      const big = state.metric === "unicorns"
        ? `${r.unicorns}<small>${r.unicorns === 1 ? "unicorn" : "unicorns"}</small>`
        : state.metric === "per"
          ? `${money(r.n ? r.value / r.n : 0)}<small>per fellow</small>`
          : `${money(r.value)}<small>combined</small>`;
      return `<div class="cl-row${i === 0 ? " win" : ""}">
        <span class="rank">${pad(i + 1)}</span>
        <a class="cl-year" href="#/class/${r.year}">${r.year}<small>${plural(r.n, "fellow")} · ${plural(r.unicorns, "unicorn")}</small></a>
        <div class="cl-track">${segs}</div>
        <div class="lb-val">${big}</div>
      </div>`;
    }).join("")}</div>`;
  }

  function classAnswer() {
    const rows = years.map(classStats).sort((a, b) => classScore(b) - classScore(a) || a.year - b.year);
    const w = rows[0];
    if (!w || !w.value) return "";
    const top = w.valued.slice(0, 3).map((c) => `<b>${esc(c.name)}</b>`).join(", ");
    const why = state.metric === "unicorns"
      ? `${plural(w.unicorns, "unicorn")} from ${plural(w.n, "fellow")}`
      : state.metric === "per"
        ? `${money(w.value / w.n)} of company value per fellow`
        : `${money(w.value)} in combined company value`;
    return `<div class="answer"><span class="big">${w.year}</span><p>The class of ${w.year} leads with ${why}, driven by ${top}.</p></div>`;
  }

  const metricSeg = () => `<div class="seg" role="group" aria-label="Rank classes by">
    ${[["value", "Combined value"], ["unicorns", "Unicorns"], ["per", "Value per fellow"]].map(([k, l]) => `<button type="button" data-metric="${k}" class="${state.metric === k ? "on" : ""}" aria-pressed="${state.metric === k}">${l}</button>`).join("")}
  </div>`;

  const protoSwitch = () => `<label class="switch" title="Ethereum and Polkadot are token networks, not companies"><input type="checkbox" data-protocols ${state.protocols ? "checked" : ""}> Count token networks</label>`;

  function classGrid() {
    return `<div class="cgrid">${years.map((y) => {
      const r = classStats(y);
      const faces = r.fs.slice().sort((a, b) => fellowValue(b) - fellowValue(a)).slice(0, 7);
      return `<a class="class-card" href="#/class/${y}">
        <div class="cc-top"><span class="cc-year">${y}</span><span class="cc-n">${plural(r.n, "fellow")}</span></div>
        <div class="faces">${faces.map((f) => mono(f, 30)).join("")}${r.n > 7 ? `<span class="more-n">+${r.n - 7}</span>` : ""}</div>
        <div class="cc-foot"><span class="num">${r.value ? money(r.value) : "—"}</span><span class="cc-cos">${r.valued.slice(0, 3).map((c) => esc(c.name)).join(" · ") || "Early-stage"}</span></div>
      </a>`;
    }).join("")}</div>`;
  }

  function fellowCard(f) {
    const c = topCo(f);
    const v = c ? value(c) : 0;
    return `<a class="f-card" href="#/fellow/${f.id}">
      <div class="fc-top">${mono(f)}<span class="badge">${f.class}</span></div>
      <div><div class="fc-name">${esc(f.name)}</div><div class="fc-co">${companyLine(f)}</div></div>
      <div class="fc-foot">${chip(f.sector) || "<span></span>"}${v ? `<span class="fc-val">${money(v)}</span>` : ""}</div>
    </a>`;
  }

  function fellowRow(f) {
    const c = topCo(f);
    const v = c ? value(c) : 0;
    return `<a class="f-row" href="#/fellow/${f.id}">
      ${mono(f)}
      <span class="f-name">${esc(f.name)}<small>${companyLine(f)}</small></span>
      ${chip(f.sector) || "<span></span>"}
      <span class="f-val">${v ? money(v) : ""}</span>
    </a>`;
  }

  // ---------- views ----------
  function viewHome() {
    const list = ranked();
    const max = list[0] ? value(list[0]) : 1;
    const total = list.reduce((s, c) => s + value(c), 0);
    const unicorns = companies.filter(isUnicorn).length;
    const billionaires = fellows.filter((f) => f.billionaire === "current").length;
    const html = `
      <section class="hero">
        <div>
          <p class="eyebrow">The Thiel Fellowship · ${years[0]}–${years[years.length - 1]}</p>
          <h1 class="display">Every Thiel Fellow,<br><em>and what they built.</em></h1>
          <p class="lede">A directory of all ${fellows.length} fellows across ${years.length} classes, the companies they started, and what those companies are worth today.</p>
          <div class="hero-actions">
            <a class="btn primary" href="#/fellows">Browse all fellows</a>
            <a class="btn" href="#/leaderboard">Valuation leaderboard</a>
          </div>
        </div>
        <aside class="hero-side">
          <b>The deal</b>
          <p>Since 2011 the Thiel Foundation has paid young people (now $250,000 over two years) to skip or leave college and build something instead.</p>
        </aside>
      </section>
      <section class="stats" aria-label="Directory totals">
        <div class="stat"><b>${fellows.length}</b><span>Fellows</span></div>
        <div class="stat"><b>${years.length}</b><span>Classes</span></div>
        <div class="stat"><b>${unicorns}</b><span>Unicorns built</span></div>
        <div class="stat"><b>${billionaires}</b><span>Billionaires</span></div>
        <div class="stat"><b>${money(total)}</b><span>Combined company value</span></div>
      </section>

      <section class="block">
        <header class="block-head">
          <div><h2>Valuation leaderboard</h2><p>Companies founded or co-founded by Thiel Fellows, by latest public valuation.</p></div>
          <div class="controls">${protoSwitch()}<a class="more" href="#/leaderboard">Full leaderboard →</a></div>
        </header>
        ${companyBoard(list.slice(0, 10), max)}
        <p class="scale-note">Bars use a log scale.</p>
      </section>

      <section class="block">
        <header class="block-head">
          <div><h2>Which class won?</h2><p>Each class’s companies, stacked by current value. Companies with fellows from two classes count for both.</p></div>
          <div class="controls">${metricSeg()}</div>
        </header>
        <div id="class-answer">${classAnswer()}</div>
        <div id="class-board">${classBoard()}</div>
      </section>

      <section class="block">
        <header class="block-head">
          <div><h2>Browse by class</h2><p>Every cohort from the first “20 Under 20” in 2011 to today.</p></div>
          <a class="more" href="#/classes">All classes →</a>
        </header>
        ${classGrid()}
      </section>`;
    return { html };
  }

  function viewLeaderboard() {
    const list = ranked();
    const max = list[0] ? value(list[0]) : 1;
    const billionaires = fellows.filter((f) => f.billionaire).sort((a, b) => (a.billionaire === "current" ? 0 : 1) - (b.billionaire === "current" ? 0 : 1) || fellowValue(b) - fellowValue(a));
    const html = `
      <header class="page-head">
        <p class="eyebrow">Leaderboard</p>
        <h1 class="display sm">Valuation leaderboard</h1>
        <p class="lede">${plural(list.length, "company")} founded or co-founded by Thiel Fellows, ranked by latest public valuation: last priced round, public market cap, token market cap or acquisition price.</p>
      </header>
      <div class="block-head"><div></div><div class="controls">${protoSwitch()}</div></div>
      ${companyBoard(list, max)}
      <p class="scale-note">Bars use a log scale. A company appears once even when several fellows co-founded it.</p>

      <section class="block">
        <header class="block-head">
          <div><h2>Which class won?</h2><p>Each class’s companies, stacked by current value.</p></div>
          <div class="controls">${metricSeg()}</div>
        </header>
        <div id="class-answer">${classAnswer()}</div>
        <div id="class-board">${classBoard()}</div>
      </section>

      ${billionaires.length ? `<section class="block">
        <header class="block-head"><div><h2>Billionaire fellows</h2><p>Forbes real-time estimates as of ${esc(meta.updated || "today")}, plus fellows who were billionaires in the past.</p></div></header>
        <div class="rows">${billionaires.map((f) => `<a class="f-row bil-row" href="#/fellow/${f.id}">${mono(f)}<span class="f-name">${esc(f.name)} <span class="badge">${f.class}</span><small>${esc(f.billionaireNote || "")}</small></span><span>${f.billionaire === "current" ? `<span class="tag gold">Billionaire</span>` : `<span class="tag dim">Former</span>`}</span><span class="f-val"></span></a>`).join("")}</div>
      </section>` : ""}`;
    return { html, title: "Valuation leaderboard" };
  }

  function viewClasses() {
    const html = `
      <header class="page-head">
        <p class="eyebrow">Classes</p>
        <h1 class="display sm">${years.length} classes</h1>
        <p class="lede">From the first “20 Under 20” in ${years[0]} to the class of ${years[years.length - 1]}.</p>
      </header>
      ${classGrid()}
      <section class="block">
        <header class="block-head">
          <div><h2>Which class won?</h2></div>
          <div class="controls">${metricSeg()}${protoSwitch()}</div>
        </header>
        <div id="class-answer">${classAnswer()}</div>
        <div id="class-board">${classBoard()}</div>
      </section>`;
    return { html, title: "Classes" };
  }

  function viewClass(y) {
    if (!years.includes(y)) return viewNotFound();
    const r = classStats(y);
    const i = years.indexOf(y);
    const prev = years[i - 1], next = years[i + 1];
    const all = ranked();
    const max = all[0] ? value(all[0]) : 1;
    const rank = years.map(classStats).sort((a, b) => b.value - a.value).indexOf(r) + 1;
    const fs = r.fs.slice().sort((a, b) => fellowValue(b) - fellowValue(a) || a.name.localeCompare(b.name));
    const html = `
      <header class="page-head">
        <nav class="crumbs"><a href="#/classes">Classes</a><span>/</span><span>${y}</span></nav>
        <h1 class="display sm">Class of ${y}</h1>
        <div class="kv">
          <div><b>${r.n}</b><span>Fellows</span></div>
          <div><b>${money(r.value)}</b><span>Combined value</span></div>
          <div><b>${r.unicorns}</b><span>Unicorns</span></div>
          <div><b>${r.value ? "#" + rank : "—"}</b><span>Rank of ${years.length} classes</span></div>
        </div>
      </header>
      ${r.valued.length ? `<section class="block" style="padding-top:8px">
        <header class="block-head"><div><h2>Companies</h2></div><div class="controls">${protoSwitch()}</div></header>
        ${companyBoard(r.valued, max)}
      </section>` : ""}
      <section class="block">
        <header class="block-head"><div><h2>Fellows</h2><p>Sorted by company value, then name.</p></div></header>
        <div class="rows">${fs.map(fellowRow).join("")}</div>
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
        <p class="eyebrow">Companies</p>
        <h1 class="display sm">What fellows built</h1>
        <p class="lede">${plural(companies.length, "company")} and projects founded or led by Thiel Fellows. Click a column to sort.</p>
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
        ${list.length ? `<div class="ct-head">
          <span class="h-rank rank">#</span>${th("name", "Company")}${th("sector", "Sector", "h-sector")}${th("status", "Status", "h-status")}${th("value", "Valuation", "r")}${th("raised", "Raised", "r h-raised")}
        </div>
        ${list.map((c, i) => `<div class="ct-row">
          <span class="rank">${pad(i + 1)}</span>
          <div class="ct-co"><a class="ct-name" href="#/company/${c.id}">${esc(c.name)}</a><span class="ct-f">${fellowLinks(c.fs)}</span></div>
          <span class="ct-sector">${chip(c.sector)}</span>
          <span class="ct-status">${statusTag(c.status)}</span>
          <span class="ct-val">${value(c) ? money(value(c)) : `<span class="muted">${c.status === "nonprofit" ? "Nonprofit" : "Not public"}</span>`}<small>${value(c) ? esc(c.valuationNote || "") : ""}</small></span>
          <span class="ct-raised">${money(c.totalRaisedUSD)}</span>
        </div>`).join("")}` : `<div class="empty">No companies match.</div>`}`;
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
    const list = ranked();
    const rank = list.indexOf(c) + 1;
    const url = safeUrl(c.url);
    const sources = (c.sources || []).map(safeUrl).filter(Boolean);
    const html = `
      <nav class="crumbs" style="padding-top:48px"><a href="#/companies">Companies</a><span>/</span><span>${esc(c.name)}</span></nav>
      <header>
        <h1 class="d-title">${esc(c.name)}</h1>
        <div class="d-sub">${statusTag(c.status)}${chip(c.sector)}${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(host(url))} ↗</a>` : ""}</div>
      </header>
      <div class="kv">
        <div><b>${value(c) ? money(value(c)) : c.valuationUSD ? money(c.valuationUSD) : "—"}</b><span>${esc(c.valuationNote || "Valuation not public")}</span></div>
        <div><b>${money(c.peakValuationUSD)}</b><span>Peak valuation</span></div>
        <div><b>${money(c.totalRaisedUSD)}</b><span>Total raised</span></div>
        <div><b>${rank ? "#" + rank : "—"}</b><span>Leaderboard rank</span></div>
      </div>
      ${c.valuationDetail ? `<p class="detail">${esc(c.valuationDetail)}</p>` : ""}
      <section class="block" style="padding-top:40px">
        <header class="block-head"><div><h2>Thiel Fellows behind it</h2></div></header>
        <div class="rows">${c.fs.map(fellowRow).join("")}</div>
      </section>
      ${sources.length ? `<p class="sect-label">Sources</p><ul class="sources">${sources.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join("")}</ul>` : ""}`;
    return { html, title: c.name };
  }

  function viewFellows() {
    const s = state.f;
    const sectors = [...new Set(fellows.map((f) => f.sector).filter(Boolean))].sort();
    const html = `
      <header class="page-head">
        <p class="eyebrow">Directory</p>
        <h1 class="display sm">All ${fellows.length} fellows</h1>
        <p class="lede">Every Thiel Fellow from ${years[0]} to ${years[years.length - 1]}, and what they are working on now.</p>
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
      <div class="pills" id="fy" role="group" aria-label="Class">${["all", ...years].map((y) => `<button type="button" data-y="${y}" class="${String(s.year) === String(y) ? "on" : ""}">${y === "all" ? "All classes" : y}</button>`).join("")}</div>
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
        const groups = years.map((y) => [y, list.filter((f) => f.class === y).sort((a, b) => fellowValue(b) - fellowValue(a) || a.name.localeCompare(b.name))]).filter(([, g]) => g.length);
        out = groups.map(([y, g]) => `<h2 class="group-h"><a href="#/class/${y}">Class of ${y}</a><span>${plural(g.length, "fellow")}</span></h2><div class="grid">${g.map(fellowCard).join("")}</div>`).join("");
      } else {
        list.sort(s.sort === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => fellowValue(b) - fellowValue(a) || a.name.localeCompare(b.name));
        out = `<div class="grid">${list.map(fellowCard).join("")}</div>`;
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
    const others = mates.filter((x) => x !== f).slice(0, 8);
    const list = ranked();
    const links = [
      f.x && [`https://x.com/${encodeURIComponent(f.x.replace(/^@/, ""))}`, `@${f.x.replace(/^@/, "")}`],
      safeUrl(f.linkedin) && [f.linkedin, "LinkedIn"],
      safeUrl(f.website) && [f.website, host(f.website)],
    ].filter(Boolean);
    const sources = (f.sources || []).map(safeUrl).filter(Boolean);
    const cos = f.cos.slice().sort(byValue);
    const html = `
      <nav class="crumbs" style="padding-top:40px"><a href="#/fellows">Fellows</a><span>/</span><a href="#/class/${f.class}">Class of ${f.class}</a></nav>
      <header class="d-head" style="padding-top:8px">
        ${mono(f)}
        <div>
          <h1 class="d-title">${esc(f.name)}</h1>
          <div class="d-sub">
            <a class="badge" href="#/class/${f.class}">Class of ${f.class}</a>
            ${f.company ? `<span>${f.role ? esc(f.role) + ", " : ""}${cos[0] && cos[0].name === f.company ? `<a href="#/company/${cos[0].id}">${esc(f.company)}</a>` : `<b>${esc(f.company)}</b>`}</span>` : ""}
            ${f.location ? `<span class="muted">${esc(f.location)}</span>` : ""}
          </div>
        </div>
      </header>
      <div class="d-grid">
        <div>
          ${f.bio ? `<p class="prose">${esc(f.bio)}</p>` : ""}
          ${f.previous && f.previous.length ? `<p class="sect-label">Previously</p><div class="taglist">${f.previous.map((p) => `<span>${esc(p)}</span>`).join("")}</div>` : ""}
          ${links.length ? `<p class="sect-label">Links</p><div class="links">${links.map(([u, l]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join("")}</div>` : ""}
          ${sources.length ? `<p class="sect-label">Sources</p><ul class="sources">${sources.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join("")}</ul>` : ""}
          ${f.confidence && f.confidence !== "high" ? `<p class="conf">Class year confidence: ${esc(f.confidence)}. Know better? This is an independent project built from public sources.</p>` : ""}
        </div>
        <aside class="side">
          ${cos.map((c) => {
            const r = list.indexOf(c) + 1;
            return `<div class="card co-card">
              <h3>Company</h3>
              <a class="co-name" href="#/company/${c.id}">${esc(c.name)}</a>
              ${c.valuationUSD ? `<div class="co-val">${money(c.valuationUSD)}</div>` : ""}
              <div class="co-note">${esc(c.valuationNote || (c.status === "nonprofit" ? "Nonprofit" : "Valuation not public"))}</div>
              <div class="co-meta">${statusTag(c.status)}${chip(c.sector)}${r ? `<span class="badge">#${r} on leaderboard</span>` : ""}</div>
            </div>`;
          }).join("")}
          ${f.billionaire ? `<div class="card co-card"><h3>Net worth</h3><div class="co-name">${f.billionaire === "current" ? "Billionaire" : "Former billionaire"}</div><div class="co-note">${esc(f.billionaireNote || "")}</div>${safeUrl(f.billionaireSource) ? `<a class="more" style="display:block;margin-top:10px;font-size:13px" href="${esc(f.billionaireSource)}" target="_blank" rel="noopener">${esc(host(f.billionaireSource))} ↗</a>` : ""}</div>` : ""}
          <div class="card">
            <h3>Class of ${f.class}</h3>
            <div class="mates">${others.map((m) => `<a class="mate" href="#/fellow/${m.id}">${mono(m, 30)}<span class="t"><b>${esc(m.name)}</b><small>${m.company ? esc(m.company) : "&nbsp;"}</small></span></a>`).join("")}</div>
            <a class="more" href="#/class/${f.class}" style="display:block;margin-top:12px">All ${mates.length} in this class →</a>
          </div>
        </aside>
      </div>
      <nav class="pn">
        ${prev ? `<a href="#/fellow/${prev.id}"><small>← Previous in ${f.class}</small><b>${esc(prev.name)}</b></a>` : "<span></span>"}
        ${next ? `<a class="next" href="#/fellow/${next.id}"><small>Next in ${f.class} →</small><b>${esc(next.name)}</b></a>` : ""}
      </nav>`;
    return { html, title: f.name };
  }

  function viewNotFound() {
    return { html: `<header class="page-head"><p class="eyebrow">404</p><h1 class="display sm">Nothing here.</h1><p class="lede"><a class="more" href="#/">Back to the directory →</a></p></header>`, title: "Not found" };
  }

  // ---------- router ----------
  let lastPath = null, current = null;
  function render() {
    const path = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [p = "", a] = path.split("/");
    const views = {
      "": viewHome,
      leaderboard: viewLeaderboard,
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
    if (path !== lastPath) { window.scrollTo(0, 0); lastPath = path; }
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
      if (s) items.push({ s: s + fellowValue(f) / 1e14, href: `#/fellow/${f.id}`, ico: mono(f, 32), t: f.name, sub: [f.company, `Class of ${f.class}`].filter(Boolean).join(" · "), k: "Fellow" });
    }
    for (const c of companies) {
      const s = score(c.name, c.fs.map((f) => f.name).join(" "));
      if (s) items.push({ s: s + 0.5 + value(c) / 1e14, href: `#/company/${c.id}`, ico: `<span class="pal-ico">${esc(c.name[0])}</span>`, t: c.name, sub: [value(c) ? money(value(c)) : null, c.fs.map((f) => f.name).join(", ")].filter(Boolean).join(" · "), k: "Company" });
    }
    for (const y of years) {
      if (q && !String(y).includes(q) && !`class of ${y}`.includes(q)) continue;
      items.push({ s: q ? 5 : 0, href: `#/class/${y}`, ico: `<span class="pal-ico">${yy(y)}</span>`, t: `Class of ${y}`, sub: plural(classStats(y).n, "fellow"), k: "Class" });
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
