// Keyword search over the docs, in the reader's browser: nothing is sent
// anywhere. search-index.js (written by site/build.py) holds each page's
// title, headings and text. Every word of the query must appear on a page,
// as the start of a word, for it to be listed; a match in the title counts
// most, then the headings, then the text. Diacritics and case are ignored.
(() => {
  const docs = window.SNDSTATION_DOCS || [];
  const root = document.body.dataset.root || "";
  const input = document.getElementById("q");
  const panel = document.getElementById("search-panel");
  if (!input || !panel) return;

  const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const terms = (q) => [...new Set(fold(q).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 || /\d/.test(w)))];
  const wordStart = (t) => new RegExp("(^|[^\\p{L}\\p{N}])" + reEsc(t), "gu");

  const pages = docs.map((d) => ({ ...d, ft: fold(d.t), fh: fold(d.h.join(" • ")), fx: fold(d.x) }));

  function count(re, s, cap) {
    let n = 0;
    re.lastIndex = 0;
    while (n < cap && re.exec(s)) n++;
    return n;
  }

  function search(q) {
    const ts = terms(q);
    if (!ts.length) return { ts, hits: [] };
    const phrase = fold(q).trim();
    const hits = [];
    for (const p of pages) {
      let score = 0, all = true;
      for (const t of ts) {
        const re = wordStart(t);
        const inT = count(re, p.ft, 1), inH = count(re, p.fh, 3), inX = count(re, p.fx, 5);
        if (!inT && !inH && !inX) { all = false; break; }
        score += inT * 10 + inH * 4 + inX;
      }
      if (!all) continue;
      if (ts.length > 1 && p.ft.includes(phrase)) score += 8;
      if (ts.length > 1 && p.fx.includes(phrase)) score += 3;
      if (p.stub) score -= 2;
      hits.push({ p, score });
    }
    hits.sort((a, b) => b.score - a.score || a.p.t.localeCompare(b.p.t));
    return { ts, hits };
  }

  // The text around the first match, with every term marked.
  function snippet(p, ts) {
    const lower = fold(p.x);
    let at = -1;
    for (const t of ts) {
      const m = wordStart(t).exec(lower);
      if (m && (at < 0 || m.index < at)) at = m.index + m[1].length;
    }
    const from = Math.max(0, at - 60);
    let s = (at < 0 ? p.x.slice(0, 140) : p.x.slice(from, from + 160)).trim();
    if (from > 0) s = "…" + s;
    if (s.length < p.x.length - from) s += "…";
    let out = esc(s);
    for (const t of ts) out = out.replace(new RegExp("(^|[^\\p{L}\\p{N}])(" + reEsc(t) + "[\\p{L}\\p{N}]*)", "giu"), "$1<mark>$2</mark>");
    return out;
  }

  function row(h, ts, i) {
    const p = h.p;
    const meta = [p.s, p.stub ? "stub" : ""].filter(Boolean).join(" · ");
    return `<a class="hit" role="option" id="hit-${i}" href="${root}${p.u}">` +
      `<span class="hit-t">${esc(p.t)}</span>` + (meta ? `<span class="hit-s">${esc(meta)}</span>` : "") +
      `<span class="hit-x">${snippet(p, ts)}</span></a>`;
  }

  // The panel under the box, as you type.
  let active = -1, timer = 0;
  function open(yes) {
    panel.hidden = !yes;
    input.setAttribute("aria-expanded", String(yes));
    if (!yes) { active = -1; input.removeAttribute("aria-activedescendant"); }
  }
  function show() {
    const q = input.value;
    if (!terms(q).length) { open(false); return; }
    const { ts, hits } = search(q);
    const top = hits.slice(0, 8);
    panel.innerHTML = top.length
      ? top.map((h, i) => row(h, ts, i)).join("") +
        `<a class="all" href="${root}search.html?q=${encodeURIComponent(q)}">${hits.length > top.length ? `All ${hits.length} pages` : "Open as a page"} →</a>`
      : `<p class="none">No page has every word of “${esc(q.trim())}”.</p>`;
    active = -1;
    open(true);
  }
  function move(by) {
    const items = [...panel.querySelectorAll(".hit")];
    if (!items.length) return;
    active = (active + by + items.length) % items.length;
    items.forEach((a, i) => a.classList.toggle("on", i === active));
    input.setAttribute("aria-activedescendant", items[active].id);
    items[active].scrollIntoView({ block: "nearest" });
  }

  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(show, 60); });
  input.addEventListener("focus", () => { if (input.value) show(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (panel.hidden) show(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Escape") { if (!panel.hidden) open(false); else input.value = ""; }
    else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      location.href = panel.querySelectorAll(".hit")[active].href;
    }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) open(false); });
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); input.focus(); input.select(); }
  });

  // search.html: every page that matches, for ?q=
  const list = document.getElementById("search-results");
  if (list) {
    const q = new URLSearchParams(location.search).get("q") || "";
    input.value = q;
    const status = document.getElementById("search-status");
    if (terms(q).length) {
      const { ts, hits } = search(q);
      status.textContent = hits.length
        ? `${hits.length} ${hits.length === 1 ? "page has" : "pages have"} every word of “${q.trim()}”.`
        : `No page has every word of “${q.trim()}”. Try fewer words, or the start of a word.`;
      list.innerHTML = hits.map((h, i) => `<li>${row(h, ts, i)}</li>`).join("");
      document.title = `${q.trim()} · Search · sndstation docs`;
    }
  }
})();
