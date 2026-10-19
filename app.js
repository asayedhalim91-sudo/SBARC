(() => {
  const root = document.querySelector('.pd');
  const tip = document.getElementById('pd-tip');
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const isNum = (v) => v != null && Number.isFinite(v);
  const clamp01 = (v) => Math.max(0, Math.min(1, isNum(v) ? v : 0));
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---------- params ----------
  const P = () => dash.params();
  const seg = () => P().segment || 'All';
  const basis = () => (P().basis === 'mh' ? 'mh' : 'cost');
  const pkg = () => P().package || null;
  const fac = () => P().facility || null;
  const COUNT_FIELDS = ['n_act', 'n_done', 'n_wip', 'n_open', 'n_behind', 'done_pct', 'package', 'facility', 'segment', 'activities'];
  const fb = (k) => (basis() === 'mh' && !COUNT_FIELDS.includes(k) ? 'mh_' + k : k);
  const unit = () => (basis() === 'mh' ? ' hrs' : '');
  const F = {
    pct: (v) => (isNum(v) ? d3.format('.1%')(v) : '—'),
    pct0: (v) => (isNum(v) ? d3.format('.0%')(v) : '—'),
    amt: (v) => (isNum(v) ? compact.format(v) + unit() : '—'),
    signed: (v) => (isNum(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + compact.format(Math.abs(v)) + unit() : '—'),
    spi: (v) => (isNum(v) ? d3.format('.2f')(v) : '—'),
    pts: (v) => (isNum(v) ? (v >= 0 ? '+' : '−') + d3.format('.1f')(Math.abs(v * 100)) + ' pts' : '—'),
    int: (v) => (isNum(v) ? d3.format(',')(Math.round(v)) : '—'),
  };
  const state = { tab: 'home', dumbAll: false, pkgSort: { k: 'sv', dir: 1 }, actSort: { k: 'gap', dir: -1 }, drawnOnce: false };

  // ---------- index over scope_kpis ----------
  let idx = null, idxSrc = null;
  function index() {
    const d = dash.data('scope_kpis');
    if (d.status !== 'ok' || !Array.isArray(d.data)) return null;
    if (idxSrc === d.data) return idx;
    const byKey = new Map(), pkgsBy = new Map(), facsBy = new Map(), facSeg = new Map();
    const push = (m, k, r) => { let a = m.get(k); if (!a) { a = []; m.set(k, a); } a.push(r); };
    for (const r of d.data) {
      byKey.set(r.segment + '|' + r.package + '|' + r.facility, r);
      if (r.package !== 'All') push(pkgsBy, r.segment + '|' + r.facility, r);
      if (r.facility !== 'All' && r.facility !== '—') {
        push(facsBy, r.segment + '|' + r.package, r);
        if (r.segment !== 'All') facSeg.set(r.facility, r.segment);
      }
    }
    idx = { byKey, pkgsBy, facsBy, facSeg }; idxSrc = d.data;
    return idx;
  }
  const row = (s, p, f) => { const I = index(); return I ? I.byKey.get(s + '|' + (p || 'All') + '|' + (f || 'All')) || null : null; };
  const packagesIn = (s, f) => { const I = index(); return I ? I.pkgsBy.get(s + '|' + (f || 'All')) || [] : []; };
  const facilitiesIn = (s, p) => { const I = index(); return I ? I.facsBy.get(s + '|' + (p || 'All')) || [] : []; };
  const whereScope = (s, p, f) => 'segment=' + encodeURIComponent(s) + '&package=' + encodeURIComponent(p || 'All') + '&facility=' + encodeURIComponent(f || 'All');
  const facSegOf = (f) => { const I = index(); return I ? I.facSeg.get(f) : null; };
  const clusterRows = () => (dash.data('cluster_kpis').status === 'ok' ? dash.data('cluster_kpis').data : []);

  // ---------- selection ----------
  function setSegment(s) {
    const I = index(); const p = pkg(), f = fac();
    const next = { segment: s };
    let keepF = f;
    if (f && s !== 'All' && facSegOf(f) !== s) { next.facility = null; keepF = null; }
    if (p && I && !I.byKey.has(s + '|' + p + '|' + (keepF || 'All'))) next.package = null;
    dash.setParams(next);
  }
  function selectPackage(p) {
    if (pkg() === p) { dash.setParams({ package: null }); return; }
    const next = { package: p };
    const I = index();
    if (I && !I.byKey.has(seg() + '|' + p + '|' + (fac() || 'All'))) next.facility = null;
    dash.setParams(next);
  }
  function selectFacility(f) {
    if (fac() === f) { dash.setParams({ facility: null }); return; }
    const I = index(); const s = facSegOf(f);
    const next = { facility: f };
    if (s && seg() !== 'All' && seg() !== s) next.segment = s;
    const s2 = next.segment || seg();
    if (pkg() && I && !I.byKey.has(s2 + '|' + pkg() + '|' + f)) next.package = null;
    dash.setParams(next);
  }
  function selectCell(p, f) {
    const s = facSegOf(f); const next = { package: p, facility: f };
    if (s && seg() !== 'All' && seg() !== s) next.segment = s;
    dash.setParams(next);
  }

  // ---------- tooltip ----------
  function showTip(e, title, lines, hint) {
    tip.replaceChildren(mk('div', 'tt', title));
    lines.forEach(([color, name, value]) => {
      const ln = mk('div', 'ln'); const a = mk('span');
      if (color) { const i = mk('i'); i.style.background = color; a.append(i); }
      a.append(document.createTextNode(name)); ln.append(a, mk('b', null, value)); tip.append(ln);
    });
    if (hint) tip.append(mk('div', 'hint', hint));
    tip.style.display = 'block';
    const r = root.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x + w > r.width) x = Math.max(0, e.clientX - r.left - w - 14);
    if (y + h > r.height) y = Math.max(0, e.clientY - r.top - h - 14);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => { tip.style.display = 'none'; };
  const attachTip = (el, fn) => {
    el.addEventListener('mousemove', (e) => { const [t, l, h] = fn(); showTip(e, t, l, h); });
    el.addEventListener('mouseleave', hideTip);
  };
  const scopeLines = (r) => (r ? [
    [null, 'Budget', F.amt(r[fb('bac')])], [null, 'Planned', F.pct(r[fb('planned_pct')])], [null, 'Earned', F.pct(r[fb('actual_pct')])],
    [null, 'Variance', F.signed(r[fb('sv')])], [null, 'SPI', F.spi(r[fb('spi')])],
    [null, 'This week', F.amt(r[fb('ev_week')]) + ' / ' + F.amt(r[fb('pv_week')])],
    [null, 'Activities behind', F.int(r.n_behind) + ' of ' + F.int(r.n_act)],
  ] : []);

  // ---------- states ----------
  function ready(el, ...ids) {
    const sts = ids.map((id) => dash.data(id).status);
    if (sts.every((s) => s === 'ok')) { el.classList.remove('dash-skeleton'); return true; }
    el.replaceChildren();
    if (sts.some((s) => s !== 'loading')) { el.classList.remove('dash-skeleton'); el.append(mk('div', 'pd-fail', 'Failed to load')); }
    else el.classList.add('dash-skeleton');
    return false;
  }

  // ---------- colour ----------
  const heat = (g) => {
    if (!isNum(g)) return 'var(--color-panel)';
    if (g < -0.0005) return 'color-mix(in srgb, var(--pd-bad) ' + Math.round(12 + Math.min(1, -g / 0.4) * 60) + '%, var(--color-panel))';
    return 'color-mix(in srgb, var(--pd-accent) ' + Math.round(10 + Math.min(1, g / 0.2) * 40) + '%, var(--color-panel))';
  };

  // ---------- controls ----------
  $$('#seg-ctl button').forEach((b) => b.addEventListener('click', () => setSegment(b.dataset.seg)));
  $$('#basis-ctl button').forEach((b) => b.addEventListener('click', () => dash.setParams({ basis: b.dataset.basis })));
  $$('.pd-area').forEach((a) => {
    const go = () => setSegment(seg() === a.dataset.area ? 'All' : a.dataset.area);
    a.addEventListener('click', go);
    a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  function showTab(id, link) {
    state.tab = id;
    root.dataset.tab = id;
    $$('.pd-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
    $$('.pd-page').forEach((p) => { p.hidden = p.id !== id; });
    if (link) dash.setLink(id);
    draw();
  }
  $$('.pd-tab').forEach((t) => t.addEventListener('click', () => { showTab(t.dataset.tab, true); window.scrollTo({ top: 0 }); }));
  root.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) { showTab(g.dataset.goto, true); window.scrollTo({ top: 0 }); } });
  function drawHero() {
    const r = row('All', null, null); const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    if (!r) return;
    set('tb-bac', compact.format(r.bac)); set('tb-mh', compact.format(r.mh_bac) + ' hrs'); set('tb-act', d3.format(',')(r.n_act));
    set('tb-pk', String(packagesIn('All', null).length)); set('tb-bld', String(facilitiesIn('Buildings', null).length)); set('tb-vil', String(facilitiesIn('Villas', null).length));
  }
  $('#dumbbell-more').addEventListener('click', () => { state.dumbAll = !state.dumbAll; draw(); });
  $('#pkg-search').addEventListener('input', () => drawPkgTable());
  $('#act-search').addEventListener('input', () => drawActs());
  $('#pkg-table tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-pkg]'); if (tr) selectPackage(tr.dataset.pkg); });
  function sortable(table, key, cb) {
    table.querySelectorAll('th[data-k]').forEach((th) => th.querySelector('button').addEventListener('click', () => {
      const s = state[key];
      if (s.k === th.dataset.k) s.dir = -s.dir; else { s.k = th.dataset.k; s.dir = th.classList.contains('l') ? 1 : -1; }
      cb();
    }));
  }
  sortable($('#pkg-table'), 'pkgSort', () => drawPkgTable());
  sortable($('#act-table'), 'actSort', () => drawActs());
  const cmp = (k, dir) => (a, b) => {
    const x = a[k], y = b[k];
    if (typeof x === 'string' || typeof y === 'string') return dir * String(x ?? '').localeCompare(String(y ?? ''));
    return dir * ((isNum(x) ? x : -Infinity) - (isNum(y) ? y : -Infinity));
  };
  function markSort(table, s) {
    table.querySelectorAll('th[data-k]').forEach((th) => {
      if (th.dataset.k === s.k) th.setAttribute('aria-sort', s.dir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
    });
  }

  // ---------- header, chips, KPIs ----------
  function drawHeader() {
    const s = seg(), p = pkg(), f = fac(), b = basis();
    $$('#seg-ctl button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.seg === s)));
    $$('#basis-ctl button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.basis === b)));
    $$('.pd-area').forEach((a) => a.setAttribute('aria-pressed', String(a.dataset.area === s)));
    $$('.basis-word').forEach((x) => { x.textContent = b === 'mh' ? 'budgeted man-hours' : 'budget'; });
    $$('[data-cost]').forEach((x) => { x.textContent = b === 'mh' ? x.dataset.mh : x.dataset.cost; });
    $('#scope-label').textContent = [s === 'All' ? 'All areas' : s, p, f].filter(Boolean).join(' · ');

    // chips
    const chips = $('#chips'); chips.replaceChildren();
    if (p || f) {
      chips.append(mk('span', null, 'Filtered to'));
      if (p) { const c = mk('button', 'pd-chip', 'Package: ' + p); c.addEventListener('click', () => dash.setParams({ package: null })); chips.append(c); }
      if (f) { const c = mk('button', 'pd-chip', 'Facility: ' + f); c.addEventListener('click', () => dash.setParams({ facility: null })); chips.append(c); }
      const c = mk('button', 'pd-chip clear', 'Clear all'); c.addEventListener('click', () => dash.setParams({ package: null, facility: null })); chips.append(c);
    }
    chips.hidden = !(p || f);

    const r = row(s, p, f);
    const loading = dash.data('scope_kpis').status === 'loading';
    const where = whereScope(s, p, f);
    $$('.scope-mark').forEach((el) => {
      const field = fb(el.dataset.base);
      el.setAttribute('data-field', field);
      el.setAttribute('data-where', where);
      el.textContent = r ? F[el.dataset.fmt](r[field]) : '—';
      el.classList.toggle('dash-skeleton', loading);
    });
    $$('.area-mark').forEach((el) => {
      const field = fb(el.dataset.base);
      const ar = row(el.dataset.area, p, null);
      el.setAttribute('data-field', field);
      el.setAttribute('data-where', whereScope(el.dataset.area, p, null));
      el.textContent = ar ? F[el.dataset.fmt](ar[field]) : '—';
    });
    const setMeter = (m, x) => {
      m.querySelector('.fill').style.width = (x ? clamp01(x[fb('actual_pct')]) * 100 : 0) + '%';
      m.querySelector('.tick').style.left = 'calc(' + (x ? clamp01(x[fb('planned_pct')]) * 100 : 0) + '% - 1px)';
    };
    setMeter($('#meter-main'), r);
    $$('.pd-area').forEach((a) => setMeter(a.querySelector('.pd-meter'), row(a.dataset.area, p, null)));
    $$('.pd-area').forEach((a) => { a.style.opacity = row(a.dataset.area, p, null) ? '' : '.45'; });

    const tone = (el, v) => { el.classList.remove('is-bad', 'is-ok', 'is-warn'); if (isNum(v)) el.classList.add(v >= 0.98 ? 'is-ok' : v >= 0.9 ? 'is-warn' : 'is-bad'); };
    $$('.tone-spi').forEach((el) => tone(el, r && r[el.getAttribute('data-field')]));
    $$('.tone-sv').forEach((el) => {
      const x = el.classList.contains('area-mark') ? row(el.dataset.area, p, null) : r;
      const v = x && x[fb('sv')];
      el.classList.toggle('is-bad', isNum(v) && v < -0.5); el.classList.toggle('is-ok', isNum(v) && v >= -0.5);
    });

    // activity stack
    const st = $('#kpi-stack'); st.replaceChildren();
    if (r && r.n_act > 0) {
      [['n_done', dash.colors[0]], ['n_wip', dash.colors[1]]].forEach(([k, c]) => {
        const sp = mk('span'); sp.style.width = (r[k] / r.n_act) * 100 + '%'; sp.style.background = c; st.append(sp);
      });
    }

    fillBudget($('#budget-bar'), r, true);
    $$('.tone-delta').forEach((el) => { const v = r && r[el.getAttribute('data-field')]; el.classList.toggle('is-bad', isNum(v) && v < -0.5); el.classList.toggle('is-ok', isNum(v) && v >= -0.5); });
  }

  // ---------- generic bar row ----------
  function barRow(label, build, value, tipFn, onClick, selected) {
    const r = mk('div', 'pd-row' + (onClick ? ' click' : '') + (selected ? ' is-sel' : ''));
    const tr = mk('div', 'pd-track'); build(tr);
    const v = mk('div', 'val'); if (value instanceof Node) v.append(value); else v.textContent = value;
    r.append(mk('div', 'lbl', label), tr, v);
    if (tipFn) attachTip(r, tipFn);
    if (onClick) r.addEventListener('click', onClick);
    return r;
  }
  const bar = (tr, w, color, cls, left) => {
    const b = mk('div', 'bar' + (cls ? ' ' + cls : '')); b.style.width = clamp01(w) * 100 + '%'; b.style.background = color;
    if (left != null) b.style.left = left * 100 + '%';
    tr.append(b); return b;
  };
  const tick = (tr, at) => { const t = mk('div', 'tk'); t.style.left = 'calc(' + clamp01(at) * 100 + '% - 1px)'; tr.append(t); };

  // ---------- overview ----------
  function drawTreemap() {
    const el = $('#treemap'); if (!ready(el, 'scope_kpis')) return;
    const sel = pkg();
    const data = packagesIn(seg(), fac()).filter((r) => r[fb('bac')] > 0);
    if (!data.length) { el.replaceChildren(mk('div', 'pd-empty', 'No budget in this selection.')); return; }
    const W = Math.max(280, el.clientWidth), H = Math.round(Math.max(280, Math.min(480, W * 0.46)));
    const h = d3.hierarchy({ children: data }).sum((d) => d[fb('bac')] || 0).sort((a, b) => b.value - a.value);
    d3.treemap().size([W, H]).paddingInner(2).round(true)(h);
    const svg = d3.create('svg').attr('class', 'pd-svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img').attr('aria-label', 'Treemap of budget by work package');
    el.replaceChildren(svg.node());
    const g = svg.selectAll('g').data(h.leaves()).join('g').attr('class', 'tm-cell').attr('transform', (d) => 'translate(' + d.x0 + ',' + d.y0 + ')').style('cursor', 'pointer')
      .style('opacity', (d) => (sel && d.data.package !== sel ? 0.45 : 1));
    g.append('rect').attr('width', (d) => Math.max(0, d.x1 - d.x0)).attr('height', (d) => Math.max(0, d.y1 - d.y0)).attr('rx', 4)
      .style('fill', (d) => heat(d.data[fb('gap_pts')]))
      .style('stroke', (d) => (d.data.package === sel ? 'var(--color-fg)' : 'none')).style('stroke-width', 2);
    g.each(function (d) {
      const w = d.x1 - d.x0, hh = d.y1 - d.y0;
      if (w < 44 || hh < 22) return;
      const s = d3.select(this);
      const t = s.append('text').attr('class', 'tm-l').attr('x', 6).attr('y', 15).text(d.data.package);
      let txt = d.data.package;
      while (txt.length > 1 && t.node().getComputedTextLength() > w - 12) { txt = txt.slice(0, -1); t.text(txt + '…'); }
      if (hh >= 38) {
        const v = s.append('text').attr('class', 'tm-v').attr('x', 6).attr('y', 30).text(F.pct0(d.data[fb('actual_pct')]) + ' earned · ' + F.amt(d.data[fb('bac')]));
        if (v.node().getComputedTextLength() > w - 12) v.text(F.pct0(d.data[fb('actual_pct')]));
        if (v.node().getComputedTextLength() > w - 12) v.remove();
      }
    });
    g.on('mousemove', (e, d) => showTip(e, d.data.package, scopeLines(d.data), 'Click to filter')).on('mouseleave', hideTip)
      .on('click', (e, d) => selectPackage(d.data.package));
  }

  function drawScatter() {
    const el = $('#scatter'); if (!ready(el, 'scope_kpis')) return;
    const sel = pkg();
    const data = packagesIn(seg(), fac()).filter((r) => r[fb('bac')] > 0 && isNum(r[fb('planned_pct')])).sort((a, b) => b[fb('bac')] - a[fb('bac')]);
    const W = Math.max(260, el.clientWidth), H = Math.round(Math.min(400, Math.max(260, W * 0.72)));
    const rMax = Math.max(10, Math.min(26, W / 20));
    const rs = d3.scaleSqrt([0, d3.max(data, (d) => d[fb('bac')]) || 1], [2.5, rMax]);
    const m = { l: 44, r: rMax + 6, t: rMax + 6, b: 38 };
    const x = d3.scaleLinear([0, 1], [m.l, W - m.r]), y = d3.scaleLinear([0, 1], [H - m.b, m.t]);
    const svg = d3.create('svg').attr('class', 'pd-svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img').attr('aria-label', 'Planned versus earned scatter');
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    svg.append('g').selectAll('line').data(ticks).join('line').attr('class', 'grid').attr('x1', m.l).attr('x2', W - m.r).attr('y1', (t) => y(t)).attr('y2', (t) => y(t));
    svg.append('g').selectAll('line').data(ticks).join('line').attr('class', 'grid').attr('y1', m.t).attr('y2', H - m.b).attr('x1', (t) => x(t)).attr('x2', (t) => x(t));
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', m.l - 6).attr('y', (t) => y(t) + 4).attr('text-anchor', 'end').text((t) => d3.format('.0%')(t));
    svg.append('g').selectAll('text').data(ticks).join('text').attr('y', H - m.b + 15).attr('x', (t) => x(t)).attr('text-anchor', (t, i) => (i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle')).text((t) => d3.format('.0%')(t));
    svg.append('text').attr('x', (m.l + W - m.r) / 2).attr('y', H - 4).attr('text-anchor', 'middle').text('Planned % of budget');
    svg.append('text').attr('transform', 'translate(11,' + (m.t + H - m.b) / 2 + ') rotate(-90)').attr('text-anchor', 'middle').text('Earned %');
    svg.append('line').attr('class', 'ref').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(1)).attr('y2', y(1));
    svg.append('text').attr('class', 'zone').attr('x', x(0.03)).attr('y', y(0.93)).text('Ahead of plan');
    svg.append('text').attr('class', 'zone').attr('x', x(0.97)).attr('y', y(0.04)).attr('text-anchor', 'end').text('Behind plan');
    const behind = (d) => d[fb('actual_pct')] < d[fb('planned_pct')] - 0.0005;
    svg.append('g').selectAll('circle').data(data).join('circle')
      .attr('cx', (d) => x(clamp01(d[fb('planned_pct')]))).attr('cy', (d) => y(clamp01(d[fb('actual_pct')]))).attr('r', (d) => rs(d[fb('bac')]))
      .style('fill', (d) => (behind(d) ? 'var(--pd-bad)' : 'var(--pd-accent)'))
      .style('fill-opacity', (d) => (sel ? (d.package === sel ? 0.85 : 0.12) : 0.42))
      .style('stroke', (d) => (d.package === sel ? 'var(--color-fg)' : behind(d) ? 'var(--pd-bad)' : 'var(--pd-accent)'))
      .style('stroke-width', (d) => (d.package === sel ? 2.5 : 1)).style('cursor', 'pointer')
      .on('mousemove', (e, d) => showTip(e, d.package, scopeLines(d), 'Click to filter')).on('mouseleave', hideTip)
      .on('click', (e, d) => selectPackage(d.package));
    el.replaceChildren(svg.node());
  }

  function drawVariance() {
    const el = $('#variance'); if (!ready(el, 'scope_kpis')) return;
    const sel = pkg();
    const list = packagesIn(seg(), fac()).filter((r) => isNum(r[fb('sv')]));
    const neg = list.filter((r) => r[fb('sv')] < -0.5).sort((a, b) => a[fb('sv')] - b[fb('sv')]).slice(0, 9);
    const pos = list.filter((r) => r[fb('sv')] > 0.5).sort((a, b) => b[fb('sv')] - a[fb('sv')]).slice(0, 4);
    const rows = [...neg, ...pos];
    const max = d3.max(rows, (r) => Math.abs(r[fb('sv')])) || 1;
    el.replaceChildren(...rows.map((r) => {
      const v = r[fb('sv')]; const w = (Math.abs(v) / max) * 0.5;
      return barRow(r.package, (tr) => {
        tr.classList.add('bare'); tr.append(mk('div', 'mid'));
        bar(tr, w, v < 0 ? 'var(--pd-bad)' : 'var(--pd-accent)', null, v < 0 ? 0.5 - w : 0.5);
      }, mk('span', v < 0 ? 'is-bad' : 'is-ok', F.signed(v)), () => [r.package, scopeLines(r), 'Click to filter'], () => selectPackage(r.package), r.package === sel);
    }));
    if (!rows.length) el.append(mk('div', 'pd-empty', 'Everything in this selection is on plan.'));
  }

  function drawWeek() {
    const el = $('#week-chart'); if (!ready(el, 'scope_kpis')) return;
    const sel = pkg();
    const rows = packagesIn(seg(), fac()).filter((r) => r[fb('pv_week')] > 0.5 || r[fb('ev_week')] > 0.5).sort((a, b) => b[fb('pv_week')] - a[fb('pv_week')]).slice(0, 10);
    const max = d3.max(rows, (r) => Math.max(r[fb('pv_week')], r[fb('ev_week')])) || 1;
    el.replaceChildren(...rows.map((r) => {
      const v = mk('span'); v.append(mk('b', null, F.amt(r[fb('ev_week')])), document.createTextNode(' / ' + F.amt(r[fb('pv_week')])));
      return barRow(r.package, (tr) => {
        tr.classList.add('bare');
        bar(tr, r[fb('pv_week')] / max, 'var(--pd-muted)', 'half1');
        bar(tr, Math.max(0, r[fb('ev_week')]) / max, 'var(--pd-accent)', 'half2');
      }, v, () => [r.package, [['var(--pd-muted)', 'Planned this week', F.amt(r[fb('pv_week')])], ['var(--pd-accent)', 'Earned this week', F.amt(r[fb('ev_week')])], [null, 'Week SPI', F.spi(r[fb('week_spi')])]], 'Click to filter'],
      () => selectPackage(r.package), r.package === sel);
    }));
    if (!rows.length) el.append(mk('div', 'pd-empty', 'Nothing planned or earned this week in this selection.'));
  }

  // ---------- packages ----------
  function drawDrill() {
    const el = $('#drill'); const p = pkg();
    $('#drill-title').textContent = p ? p : 'Package drill-down';
    $('#drill-note').textContent = p ? 'Where this package stands by area, by facility and by activity.' : 'Select a package from any chart or the table below to see where it is behind.';
    if (!p) { el.replaceChildren(mk('div', 'pd-hint', 'No package selected yet. Click a box in the budget map, a bubble, a bar or a table row.')); return; }
    if (!ready(el, 'scope_kpis')) return;
    const s = seg(), f = fac();
    // by area
    const a = mk('div'); a.append(mk('h3', null, 'By area'));
    ['Buildings', 'Villas', 'Site-wide'].forEach((ar) => {
      const r = row(ar, p, null); if (!r || !(r[fb('bac')] > 0)) return;
      a.append(barRow(ar, (tr) => { bar(tr, r[fb('actual_pct')], 'var(--pd-accent)'); tick(tr, r[fb('planned_pct')]); },
        mk('span', r[fb('gap_pts')] < -0.0005 ? 'is-bad' : null, F.pct0(r[fb('actual_pct')]) + ' · ' + F.pts(r[fb('gap_pts')])),
        () => [p + ' · ' + ar, scopeLines(r), 'Click to focus on this area'], () => setSegment(ar), s === ar));
    });
    // facilities
    const b = mk('div'); b.append(mk('h3', null, 'Facilities furthest behind'));
    const facs = facilitiesIn(s, p).filter((r) => r[fb('bac')] > 0).sort((x, y) => x[fb('gap_pts')] - y[fb('gap_pts')]).slice(0, 10);
    facs.forEach((r) => b.append(barRow(r.facility, (tr) => { bar(tr, r[fb('actual_pct')], 'var(--pd-accent)'); tick(tr, r[fb('planned_pct')]); },
      mk('span', r[fb('gap_pts')] < -0.0005 ? 'is-bad' : null, F.pts(r[fb('gap_pts')])),
      () => [r.facility, scopeLines(r), 'Click to filter to this facility'], () => selectFacility(r.facility), f === r.facility)));
    if (!facs.length) b.append(mk('div', 'pd-empty', 'This package is not split by building or villa.'));
    // status
    const c = mk('div', 'pd-statusbig'); c.append(mk('h3', null, 'Activity status'));
    const r = row(s, p, f);
    if (r && r.n_act > 0) {
      const st = mk('div', 'pd-stack');
      [['n_done', dash.colors[0], 'Complete'], ['n_wip', dash.colors[1], 'In progress'], ['n_open', 'var(--pd-trackbg)', 'Not started']].forEach(([k, col, name]) => {
        const sp = mk('span'); sp.style.width = (r[k] / r.n_act) * 100 + '%'; sp.style.background = col; st.append(sp);
        attachTip(sp, () => [name, [[null, 'Activities', F.int(r[k])], [null, 'Share', F.pct(r[k] / r.n_act)]]]);
      });
      const lg = mk('div', 'pd-legend');
      [['n_done', dash.colors[0], 'Complete'], ['n_wip', dash.colors[1], 'In progress'], ['n_open', 'var(--pd-trackbg)', 'Not started'], ['n_behind', 'var(--pd-bad)', 'Behind plan']].forEach(([k, col, name]) => {
        const sp = mk('span'); const i = mk('i'); i.style.background = col; sp.append(i, document.createTextNode(name + ' '), mk('b', null, F.int(r[k]))); lg.append(sp);
      });
      c.append(st, lg);
      const go = mk('button', 'pd-more', 'See its late activities'); go.addEventListener('click', () => showTab('activities', true)); c.append(go);
    } else c.append(mk('div', 'pd-empty', 'No activities in this selection.'));
    el.replaceChildren(a, b, c);
  }

  function drawDumbbell() {
    const el = $('#dumbbell'); const more = $('#dumbbell-more');
    if (!ready(el, 'scope_kpis')) { more.hidden = true; return; }
    const sel = pkg();
    let rows = packagesIn(seg(), fac()).filter((r) => r[fb('bac')] > 0).sort((a, b) => a[fb('sv')] - b[fb('sv')]);
    const total = rows.length;
    if (!state.dumbAll) rows = rows.slice(0, 25);
    more.hidden = total <= 25; more.textContent = state.dumbAll ? 'Show top 25' : 'Show all packages';
    const axis = mk('div', 'pd-axis'); const tk = mk('div', 'ticks');
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => { const sp = mk('span', null, d3.format('.0%')(t)); sp.style.left = t * 100 + '%'; tk.append(sp); });
    axis.append(mk('span', null, 'Work package'), tk, mk('span', 'val', 'Gap'));
    el.replaceChildren(axis, ...rows.map((r) => {
      const p = clamp01(r[fb('planned_pct')]), a = clamp01(r[fb('actual_pct')]); const behind = a < p - 0.0005;
      return barRow(r.package, (tr) => {
        tr.classList.add('bare');
        const g = mk('div', 'seg'); g.style.left = Math.min(p, a) * 100 + '%'; g.style.width = Math.abs(p - a) * 100 + '%';
        g.style.background = behind ? 'var(--pd-bad)' : 'var(--pd-accent)'; tr.append(g);
        const dp = mk('div', 'dot plan'); dp.style.left = p * 100 + '%';
        const da = mk('div', 'dot'); da.style.left = a * 100 + '%'; da.style.background = 'var(--pd-accent)';
        tr.append(dp, da);
      }, mk('span', behind ? 'is-bad' : null, F.pts(r[fb('gap_pts')])), () => [r.package, scopeLines(r), 'Click to filter'], () => selectPackage(r.package), r.package === sel);
    }));
  }

  function drawPkgTable() {
    const table = $('#pkg-table'); const tb = table.tBodies[0];
    table.querySelectorAll('th[data-base]').forEach((th) => th.setAttribute('data-field', fb(th.dataset.base)));
    if (!index()) { tb.replaceChildren(); return; }
    const q = $('#pkg-search').value.trim().toLowerCase(); const sel = pkg();
    const sk = state.pkgSort.k; const sortKey = ['package', 'n_act', 'n_behind'].includes(sk) ? sk : fb(sk);
    const rows = packagesIn(seg(), fac()).filter((r) => !q || r.package.toLowerCase().includes(q)).slice().sort(cmp(sortKey, state.pkgSort.dir));
    markSort(table, state.pkgSort);
    tb.replaceChildren(...rows.map((r) => {
      const tr = mk('tr', r.package === sel ? 'is-sel' : null);
      tr.dataset.key = [r.segment, r.package, r.facility].map(encodeURIComponent).join(',');
      tr.dataset.pkg = r.package;
      const earned = mk('td', null, F.pct(r[fb('actual_pct')])); const cb = mk('span', 'cb'); cb.style.width = clamp01(r[fb('actual_pct')]) * 3.5 + 'rem'; earned.append(cb);
      tr.append(mk('td', 'l', r.package), mk('td', null, F.amt(r[fb('bac')])), mk('td', null, F.pct(r[fb('planned_pct')])), earned,
        mk('td', r[fb('sv')] < -0.5 ? 'is-bad' : null, F.signed(r[fb('sv')])), mk('td', isNum(r[fb('spi')]) && r[fb('spi')] < 0.9 ? 'is-bad' : null, F.spi(r[fb('spi')])),
        mk('td', 'sec', F.amt(r[fb('pv_week')])), mk('td', 'sec', F.amt(r[fb('ev_week')])), mk('td', 'sec', F.int(r.n_act)), mk('td', 'sec' + (r.n_behind > 0 ? ' is-bad' : ''), F.int(r.n_behind)));
      return tr;
    }));
  }

  // ---------- facilities ----------
  function drawBuildings() {
    const el = $('#buildings'); const card = $('#buildings-card');
    const s = seg(); card.hidden = !(s === 'All' || s === 'Buildings');
    if (card.hidden || !ready(el, 'scope_kpis')) return;
    const p = pkg(), sel = fac();
    const rows = facilitiesIn('Buildings', p).filter((r) => r[fb('bac')] > 0).sort((a, b) => a[fb('gap_pts')] - b[fb('gap_pts')]);
    el.replaceChildren(...rows.map((r) => {
      const v = mk('span'); v.append(mk('b', null, F.pct(r[fb('actual_pct')])), document.createTextNode(' '), mk('span', r[fb('gap_pts')] < -0.0005 ? 'is-bad' : 'is-ok', F.pts(r[fb('gap_pts')])));
      return barRow(r.facility, (tr) => { bar(tr, r[fb('actual_pct')], 'var(--pd-accent)'); tick(tr, r[fb('planned_pct')]); }, v,
        () => [r.facility + (p ? ' · ' + p : ''), scopeLines(r), 'Click to filter'], () => selectFacility(r.facility), r.facility === sel);
    }));
    if (!rows.length) el.append(mk('div', 'pd-empty', 'The selected package has no building work.'));
  }

  function heatGrid(el, rowsSpec, colsSpec, cellOf, opts) {
    const grid = mk('div', 'pd-heat');
    grid.style.gridTemplateColumns = 'minmax(9rem, 16rem) repeat(' + colsSpec.length + ', minmax(2.4rem, 1fr))';
    grid.append(mk('div'));
    colsSpec.forEach((c) => {
      const h = mk('div', 'hh' + (c.sel ? ' is-sel' : ''), c.label);
      if (c.onClick) h.addEventListener('click', c.onClick); else h.style.cursor = 'default';
      if (c.tip) attachTip(h, c.tip);
      grid.append(h);
    });
    rowsSpec.forEach((rw) => {
      const l = mk('div', 'rl' + (rw.sel ? ' is-sel' : ''), rw.label); l.addEventListener('click', rw.onClick); attachTip(l, rw.tip); grid.append(l);
      colsSpec.forEach((c) => {
        const x = cellOf(rw, c);
        if (!x || !(x[fb('bac')] > 0)) { grid.append(mk('div', 'c empty', '·')); return; }
        const cell = mk('div', 'c' + ((rw.sel && (c.sel || opts.rowOnly)) ? ' is-sel' : ''), d3.format('.0%')(clamp01(x[fb('actual_pct')])));
        cell.style.background = heat(x[fb('gap_pts')]);
        if (opts.dimOthers && (opts.dimOthers(rw, c))) cell.style.opacity = '.4';
        attachTip(cell, () => [rw.label + ' · ' + c.label, opts.lines(x), 'Click to filter']);
        cell.addEventListener('click', () => opts.onCell(rw, c));
        grid.append(cell);
      });
    });
    el.replaceChildren(grid);
  }

  function drawBHeat() {
    const el = $('#bheat'); const card = $('#bheat-card');
    const s = seg(); card.hidden = !(s === 'All' || s === 'Buildings');
    if (card.hidden || !ready(el, 'scope_kpis')) return;
    const p = pkg(), f = fac();
    const pk = packagesIn('Buildings', null).filter((r) => r[fb('bac')] > 0).sort((a, b) => a.order - b.order);
    const bl = facilitiesIn('Buildings', null).filter((r) => r[fb('bac')] > 0).sort((a, b) => b[fb('bac')] - a[fb('bac')]);
    heatGrid(el,
      pk.map((r) => ({ label: r.package, key: r.package, sel: r.package === p, onClick: () => selectPackage(r.package), tip: () => [r.package + ' · all buildings', scopeLines(r), 'Click to filter'] })),
      bl.map((r) => ({ label: r.facility, key: r.facility, sel: r.facility === f, onClick: () => selectFacility(r.facility), tip: () => [r.facility, scopeLines(r), 'Click to filter'] })),
      (rw, c) => row('Buildings', rw.key, c.key),
      { lines: scopeLines, onCell: (rw, c) => selectCell(rw.key, c.key), dimOthers: (rw, c) => (p && rw.key !== p) || (f && c.key !== f) });
  }

  function drawVillas() {
    const el = $('#villas'); const card = $('#villas-card');
    const s = seg(); card.hidden = !(s === 'All' || s === 'Villas');
    if (card.hidden || !ready(el, 'scope_kpis', 'cluster_kpis')) return;
    const p = pkg(), sel = fac();
    const villas = facilitiesIn('Villas', p).filter((r) => r[fb('bac')] > 0);
    if (!villas.length) { el.replaceChildren(mk('div', 'pd-empty', 'The selected package has no villa work.')); $('#villa-ramp-max').textContent = '—'; return; }
    const worst = Math.min(-0.001, d3.min(villas, (r) => r[fb('gap_pts')]));
    const best = Math.min(0, d3.max(villas, (r) => r[fb('gap_pts')]));
    $('#villa-ramp-max').textContent = F.pts(worst);
    const tScale = (g) => clamp01((g - best) / ((worst - best) || -1));
    const clusters = clusterRows().filter((c) => c.package === (p || 'All') && c[fb('bac')] > 0).sort((a, b) => a.cluster.localeCompare(b.cluster, 'en', { numeric: true }));
    const byC = d3.group(villas, (r) => r.facility.split('-')[0]);
    el.replaceChildren(...clusters.map((c) => {
      const rw = mk('div', 'pd-cl');
      const cn = mk('div', 'cn'); cn.append(mk('b', null, c.cluster), mk('span', null, F.pct(c[fb('actual_pct')])));
      attachTip(cn, () => ['Cluster ' + c.cluster + (p ? ' · ' + p : ''), [[null, 'Villas', F.int(c.villas)], [null, 'Budget', F.amt(c[fb('bac')])], [null, 'Planned', F.pct(c[fb('planned_pct')])], [null, 'Earned', F.pct(c[fb('actual_pct')])], [null, 'Gap', F.pts(c[fb('gap_pts')])]]]);
      const tiles = mk('div', 'pd-tiles');
      (byC.get(c.cluster) || []).sort((a, b) => a.facility.localeCompare(b.facility, 'en', { numeric: true })).forEach((r) => {
        const t = mk('div', 'pd-tile' + (r.facility === sel ? ' is-sel' : ''));
        const num = r.facility.includes('-') ? r.facility.split('-').slice(1).join('-') : r.facility;
        t.append(document.createTextNode(num), mk('small', null, d3.format('.0%')(clamp01(r[fb('actual_pct')]))));
        t.style.background = 'color-mix(in srgb, var(--pd-bad) ' + Math.round(tScale(r[fb('gap_pts')]) * 62) + '%, var(--color-panel))';
        attachTip(t, () => ['Villa ' + r.facility + (p ? ' · ' + p : ''), scopeLines(r), 'Click to filter']);
        t.addEventListener('click', () => selectFacility(r.facility));
        tiles.append(t);
      });
      rw.append(cn, tiles); return rw;
    }));
  }

  function drawVHeat() {
    const el = $('#vheat'); const card = $('#vheat-card');
    const s = seg(); card.hidden = !(s === 'All' || s === 'Villas');
    if (card.hidden || !ready(el, 'cluster_kpis', 'scope_kpis')) return;
    const p = pkg();
    const all = clusterRows();
    const by = new Map(all.map((c) => [c.package + '|' + c.cluster, c]));
    const cols = all.filter((c) => c.package === 'All' && c[fb('bac')] > 0).sort((a, b) => a.cluster.localeCompare(b.cluster, 'en', { numeric: true }));
    const pk = packagesIn('Villas', null).filter((r) => r[fb('bac')] > 0).sort((a, b) => a.order - b.order);
    const clLines = (x) => [[null, 'Budget', F.amt(x[fb('bac')])], [null, 'Planned', F.pct(x[fb('planned_pct')])], [null, 'Earned', F.pct(x[fb('actual_pct')])], [null, 'Gap', F.pts(x[fb('gap_pts')])], [null, 'Activities behind', F.int(x.n_behind)]];
    heatGrid(el,
      pk.map((r) => ({ label: r.package, key: r.package, sel: r.package === p, onClick: () => selectPackage(r.package), tip: () => [r.package + ' · all villas', scopeLines(r), 'Click to filter'] })),
      cols.map((c) => ({ label: c.cluster, key: c.cluster, sel: false, tip: () => ['Cluster ' + c.cluster, clLines(c)] })),
      (rw, c) => by.get(rw.key + '|' + c.key),
      { lines: clLines, rowOnly: true, onCell: (rw) => selectPackage(rw.key), dimOthers: (rw) => p && rw.key !== p });
  }

  // ---------- activities ----------
  function drawStatus() {
    const el = $('#status-chart'); if (!ready(el, 'scope_kpis')) return;
    $('#sw-done').style.background = dash.colors[0]; $('#sw-wip').style.background = dash.colors[1];
    const sel = pkg();
    let rows = packagesIn(seg(), fac()).filter((r) => r.n_act > 0).sort((a, b) => b.n_behind - a.n_behind || b.n_act - a.n_act).slice(0, 15);
    if (sel && !rows.some((r) => r.package === sel)) { const x = row(seg(), sel, fac()); if (x) rows = [x, ...rows.slice(0, 14)]; }
    el.replaceChildren(...rows.map((r) => {
      const v = mk('span'); v.append(mk('b', r.n_behind > 0 ? 'is-bad' : null, F.int(r.n_behind)), document.createTextNode(' behind'));
      return barRow(r.package, (tr) => {
        tr.classList.add('bare');
        const st = mk('div', 'pd-stack'); st.style.height = '12px';
        [['n_done', dash.colors[0]], ['n_wip', dash.colors[1]], ['n_open', 'var(--pd-trackbg)']].forEach(([k, c]) => { const sp = mk('span'); sp.style.width = (r[k] / r.n_act) * 100 + '%'; sp.style.background = c; st.append(sp); });
        tr.append(st);
      }, v, () => [r.package, [[dash.colors[0], 'Complete', F.int(r.n_done)], [dash.colors[1], 'In progress', F.int(r.n_wip)], ['var(--pd-trackbg)', 'Not started', F.int(r.n_open)], ['var(--pd-bad)', 'Behind plan', F.int(r.n_behind)]], 'Click to filter'],
      () => selectPackage(r.package), r.package === sel);
    }));
    if (!rows.length) el.append(mk('div', 'pd-empty', 'No activities in this selection.'));
  }

  // ---------- activities: index, list, detail ----------
  const ACT_NUM = ['sched_pct', 'perf_pct', 'mh_perf_pct', 'bac', 'pv', 'pv_prev', 'pv_week', 'ev', 'ev_prev', 'ev_week', 'remaining', 'mh_bac', 'mh_pv', 'mh_pv_prev', 'mh_pv_week', 'mh_ev', 'mh_ev_prev', 'mh_ev_week', 'mh_remaining'];
  let actIdx = null, actSrc = null, metSrc = null;
  function acts() {
    const d = dash.data('activities'), m = dash.data('activity_metrics');
    if (d.status !== 'ok' || m.status !== 'ok' || !Array.isArray(d.data) || !Array.isArray(m.data)) return null;
    if (actSrc === d.data && metSrc === m.data) return actIdx;
    const met = new Map(m.data.map((x) => [x.activity_id, x]));
    const list = d.data.map((r) => {
      const o = { activity_id: r.activity_id, activity: r.activity, package: r.package, segment: r.segment, facility: r.facility };
      ACT_NUM.forEach((k) => { o[k] = r[k] === '' || r[k] == null ? null : Number(r[k]); });
      return Object.assign(o, met.get(r.activity_id) || {});
    });
    actIdx = { list, byId: new Map(list.map((a) => [a.activity_id, a])) }; actSrc = d.data; metSrc = m.data;
    return actIdx;
  }
  state.actMode = 'behind';
  $$('#act-mode button').forEach((b) => b.addEventListener('click', () => { state.actMode = b.dataset.mode; drawActs(); }));
  function selectActivity(id) {
    dash.setParams({ activity: P().activity === id ? null : id });
    requestAnimationFrame(() => {
      const d = $('#act-detail'); if (!d || !P().activity) return;
      const r = d.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight - 80) d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
  $('#act-table tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-key]'); if (tr) selectActivity(tr.dataset.key); });

  function drawActs() {
    const table = $('#act-table'); const tb = table.tBodies[0];
    $$('#act-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.actMode)));
    const gapField = fb('gap');
    $('#act-gap-th').setAttribute('data-field', gapField); $('#act-gap-th').dataset.k = gapField;
    $('#act-bac-th').setAttribute('data-field', fb('bac')); $('#act-bac-th').dataset.k = fb('bac');
    if (state.actSort.k === 'gap' || state.actSort.k === 'mh_gap') state.actSort.k = gapField;
    if (state.actSort.k === 'bac' || state.actSort.k === 'mh_bac') state.actSort.k = fb('bac');
    const I = acts();
    if (!I) { tb.replaceChildren(); $('#act-trunc').hidden = true; return; }
    const s = seg(), p = pkg(), f = fac(), sel = P().activity; const q = $('#act-search').value.trim().toLowerCase();
    const all = I.list.filter((r) => (s === 'All' || r.segment === s) && (!p || r.package === p) && (!f || r.facility === f) && (state.actMode === 'all' || r.behind))
      .filter((r) => !q || [r.activity_id, r.activity, r.package, r.facility].some((x) => String(x).toLowerCase().includes(q)))
      .sort(cmp(state.actSort.k, state.actSort.dir));
    const LIMIT = 300; const rows = all.slice(0, LIMIT);
    markSort(table, state.actSort);
    $('#act-trunc').hidden = all.length <= LIMIT;
    tb.replaceChildren(...rows.map((r) => {
      const tr = mk('tr', r.activity_id === sel ? 'is-sel' : null); tr.dataset.key = r.activity_id;
      const g = r[gapField];
      tr.append(mk('td', 'l id', r.activity_id), mk('td', 'l', r.activity), mk('td', 'l sec', r.package), mk('td', 'l sec', r.facility),
        mk('td', 'sec', isNum(r[fb('bac')]) ? compact.format(r[fb('bac')]) + unit() : '—'), mk('td', null, F.pct(r.sched_pct)), mk('td', null, F.pct(r.perf_pct)),
        mk('td', g > 0.5 ? 'is-bad' : null, isNum(g) ? compact.format(g) + unit() : '—'));
      return tr;
    }));
    if (!rows.length) { const tr = mk('tr'); const td = mk('td', 'l', state.actMode === 'all' ? 'No activities in this selection.' : 'No activities behind plan in this selection.'); td.colSpan = 8; tr.append(td); tb.append(tr); }
  }

  const full = d3.format(',.0f');
  const DF = {
    pct: (v) => (isNum(v) ? d3.format('.1%')(v) : '—'),
    num: (v) => (isNum(v) ? full(v) : '—'),
    signed: (v) => (isNum(v) ? (v > 0.5 ? '+' : v < -0.5 ? '−' : '') + full(Math.abs(v)) : '—'),
    spi: (v) => (isNum(v) ? d3.format('.2f')(v) : '—'),
    pts: (v) => (isNum(v) ? (v >= 0 ? '+' : '−') + d3.format('.1f')(Math.abs(v * 100)) + ' pts' : '—'),
    text: (v) => (v == null || v === '' ? '—' : String(v)),
  };
  function drawDetail() {
    const el = $('#act-detail'); const split = $('#act-split'); const id = P().activity || null;
    split.classList.toggle('has-detail', !!id);
    if (!id) { el.classList.remove('dash-skeleton'); el.replaceChildren(mk('div', 'pd-hint', 'Click any activity in the list to see its full details here.')); return; }
    const I = acts();
    if (!I) { el.replaceChildren(); el.classList.toggle('dash-skeleton', dash.data('activities').status === 'loading' || dash.data('activity_metrics').status === 'loading'); return; }
    el.classList.remove('dash-skeleton');
    const a = I.byId.get(id);
    if (!a) { el.replaceChildren(mk('div', 'pd-hint', 'That activity is not in this export.')); return; }
    const W = 'activity_id=' + encodeURIComponent(id);
    const MET = ['sv', 'gap', 'spi', 'mh_sv', 'mh_gap', 'mh_spi', 'pct_gap', 'week_planned_pct', 'week_earned_pct', 'status', 'behind'];
    const v = (tag, field, fmt, cls) => {
      const e = mk(tag, cls || null, DF[fmt](a[field]));
      e.setAttribute('data-source', MET.includes(field) ? 'activity_metrics' : 'activities'); e.setAttribute('data-field', field); e.setAttribute('data-where', W);
      return e;
    };
    const kids = [];
    // header
    const top = mk('div', 'dt-top'); const idEl = v('span', 'activity_id', 'text', 'dt-id');
    const x = mk('button', 'dt-x', '×'); x.setAttribute('aria-label', 'Close details'); x.addEventListener('click', () => dash.setParams({ activity: null }));
    top.append(idEl, x); kids.push(top);
    kids.push(v('h3', 'activity', 'text', 'dt-name'));
    const cr = mk('div', 'dt-crumbs');
    const crumb = (label, fn) => { const b = mk('button', null, label); b.addEventListener('click', fn); return b; };
    cr.append(crumb(a.package, () => selectPackage(a.package)), document.createTextNode('›'), crumb(a.segment, () => setSegment(a.segment)));
    if (a.facility && a.facility !== '—') cr.append(document.createTextNode('›'), crumb(a.facility, () => selectFacility(a.facility)));
    kids.push(cr);
    const bd = mk('div', 'dt-badges');
    bd.append(v('span', 'status', 'text', 'dt-badge' + (a.status === 'Complete' ? ' done' : '')));
    if (a.behind) { const b = mk('span', 'dt-badge bad', 'Behind plan'); bd.append(b); }
    kids.push(bd);
    // progress
    const pr = mk('div', 'dt-prog');
    const big = mk('div', 'dt-big'); big.append(v('span', 'perf_pct', 'pct', 'v'), mk('span', 'k', 'performance % complete')); pr.append(big);
    const m = mk('div', 'pd-meter'); const fi = mk('div', 'fill'); fi.style.width = clamp01(a.perf_pct) * 100 + '%'; const tk = mk('div', 'tick'); tk.style.left = 'calc(' + clamp01(a.sched_pct) * 100 + '% - 1px)'; m.append(fi, tk); pr.append(m);
    const line = (...parts) => { const d = mk('div', 'dt-line'); parts.forEach((p) => d.append(p)); return d; };
    const pair = (label, node) => { const s = mk('span'); s.append(document.createTextNode(label + ' '), node); return s; };
    pr.append(line(pair('Schedule % complete', v('b', 'sched_pct', 'pct')), pair('Gap', v('b', 'pct_gap', 'pts', a.pct_gap < -0.001 ? 'is-bad' : 'is-ok'))));
    pr.append(line(pair('Man-hour performance', v('b', 'mh_perf_pct', 'pct'))));
    pr.append(line(pair('This week planned', v('b', 'week_planned_pct', 'pct')), pair('earned', v('b', 'week_earned_pct', 'pct', isNum(a.week_planned_pct) && a.week_earned_pct < a.week_planned_pct - 0.0005 ? 'is-bad' : null))));
    kids.push(pr);
    // cost & man-hours
    const block = (title, pre) => {
      const sec = mk('div', 'dt-sec'); sec.append(mk('h4', null, title));
      const dl = mk('dl', 'dt-grid');
      const r = (label, field, fmt, cls) => { dl.append(mk('dt', null, label)); const dd = mk('dd'); dd.append(v('b', field, fmt, cls)); dl.append(dd); };
      r('Budget', pre + 'bac', 'num');
      r('Planned to date', pre + 'pv', 'num');
      r('Earned to date', pre + 'ev', 'num');
      r('Schedule variance', pre + 'sv', 'signed', a[pre + 'sv'] < -0.5 ? 'is-bad' : a[pre + 'sv'] > 0.5 ? 'is-ok' : null);
      r('SPI', pre + 'spi', 'spi', isNum(a[pre + 'spi']) && a[pre + 'spi'] < 0.9 ? 'is-bad' : null);
      r('Remaining', pre + 'remaining', 'num');
      dl.append(mk('div', 'sep'));
      r('Planned this week', pre + 'pv_week', 'num');
      r('Earned this week', pre + 'ev_week', 'num');
      r('Planned to last week', pre + 'pv_prev', 'num');
      r('Earned to last week', pre + 'ev_prev', 'num');
      sec.append(dl); return sec;
    };
    kids.push(block('Cost', ''), block('Man-hours', 'mh_'));
    // siblings
    const sib = I.list.filter((r) => r.package === a.package && r.segment === a.segment && r.facility === a.facility);
    if (sib.length > 1) {
      const sec = mk('div', 'dt-sec dt-sib'); sec.setAttribute('data-source', 'activities activity_metrics');
      sec.append(mk('h4', null, 'Same package' + (a.facility !== '—' ? ' in ' + a.facility : ', ' + a.segment)));
      const ranked = sib.slice().sort((p, q) => (q.gap || 0) - (p.gap || 0));
      let show = ranked.slice(0, 12);
      if (!show.includes(a)) show = [a, ...show.slice(0, 11)];
      show.forEach((r) => {
        const val = mk('span', r.behind ? 'is-bad' : null, F.pct(r.perf_pct));
        sec.append(barRow(r.activity, (tr) => { bar(tr, r.perf_pct, 'var(--pd-accent)'); tick(tr, r.sched_pct); }, val,
          () => [r.activity_id + ' · ' + r.activity, [[null, 'Planned', F.pct(r.sched_pct)], [null, 'Earned', F.pct(r.perf_pct)], [null, 'Gap', compact.format(r.gap || 0)], [null, 'Status', r.status || '—']], 'Click to open'],
          () => selectActivity(r.activity_id), r.activity_id === a.activity_id));
      });
      if (ranked.length > show.length) sec.append(mk('div', 'pd-note', 'Showing those with the largest gap. Search the list for the rest.'));
      kids.push(sec);
    }
    el.replaceChildren(...kids);
  }

  // ---------- key messages & trend ----------
  const hlRows = () => (dash.data('headlines').status === 'ok' ? dash.data('headlines').data : []);
  const hlFor = (s, b) => hlRows().filter((h) => h.segment === s && h.basis === b).sort((a, c) => a.rank - c.rank);
  const hl = (key) => hlFor(seg(), basis()).find((h) => h.key === key) || null;
  function hlEl(tag, cls, h, fallback) {
    const e = mk(tag, cls, h ? h.text : fallback || '—');
    if (h) {
      e.setAttribute('data-source', 'headlines'); e.setAttribute('data-field', 'text');
      e.setAttribute('data-where', 'segment=' + encodeURIComponent(h.segment) + '&basis=' + h.basis + '&key=' + h.key);
    }
    return e;
  }
  function valEl(tag, cls, r, s, base, fmt) {
    const f = fb(base);
    const e = mk(tag, cls, r ? F[fmt](r[f]) : '—');
    e.setAttribute('data-source', 'scope_kpis'); e.setAttribute('data-field', f); e.setAttribute('data-where', whereScope(s, null, null));
    return e;
  }
  const isBadMsg = (h, r) => (h.key === 'status' ? r && r[fb('sv')] < 0 : h.key === 'week' ? r && r[fb('sv_change')] < 0 : h.key === 'drivers' || h.key === 'focus');
  function drawMessages() {
    const el = $('#messages'); const st = dash.data('headlines').status;
    if (st !== 'ok') {
      el.replaceChildren(); el.classList.toggle('dash-skeleton', st === 'loading');
      if (st !== 'loading') el.append(mk('li', 'pd-fail', 'Failed to load'));
      return;
    }
    el.classList.remove('dash-skeleton');
    const r = row(seg(), null, null);
    el.replaceChildren(...hlFor(seg(), basis()).map((h) => { const li = hlEl('li', null, h); if (isBadMsg(h, r)) li.classList.add('bad'); return li; }));
  }

  function slope(el, r, s, big) {
    if (!r) { el.replaceChildren(mk('div', 'pd-empty', 'No data for this selection.')); return; }
    const W = Math.max(240, el.clientWidth);
    const H = big ? Math.round(Math.max(200, Math.min(W * 0.62, 420))) : Math.round(Math.min(280, Math.max(190, W * 0.55)));
    const fsz = big ? Math.round(Math.max(12, Math.min(18, W / 34))) : 12;
    const series = [
      { name: 'Planned', a: r[fb('prev_planned_pct')], b: r[fb('planned_pct')], color: 'var(--pd-muted)', dashed: true, fa: 'prev_planned_pct', fb: 'planned_pct' },
      { name: 'Earned', a: r[fb('prev_actual_pct')], b: r[fb('actual_pct')], color: dash.colors[0], dashed: false, fa: 'prev_actual_pct', fb: 'actual_pct' },
    ].filter((x) => isNum(x.a) && isNum(x.b));
    const vals = series.flatMap((x) => [x.a, x.b]);
    let lo = Math.max(0, Math.floor((d3.min(vals) - 0.04) * 20) / 20), hi = Math.min(1, Math.ceil((d3.max(vals) + 0.02) * 20) / 20);
    if (hi - lo < 0.1) lo = Math.max(0, hi - 0.1);
    const svg = d3.create('svg').attr('class', 'pd-svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img').attr('aria-label', 'Planned and earned percent, last week and this week');
    svg.attr('data-source', 'scope_kpis');
    el.replaceChildren(svg.node());
    const meas = (t) => { const n = svg.append('text').style('font-size', fsz + 'px').text(t); const w = n.node().getComputedTextLength(); n.remove(); return w; };
    const leftW = d3.max(series, (x) => meas(F.pct(x.a))) || 30;
    const rightW = d3.max(series, (x) => meas(x.name + ' ' + F.pct(x.b))) || 60;
    const m = { l: leftW + 14, r: rightW + 14, t: fsz + 6, b: fsz + 14 };
    const x0 = m.l, x1 = Math.max(m.l + 40, W - m.r);
    const y = d3.scaleLinear([lo, hi], [H - m.b, m.t]);
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('class', 'grid').attr('x1', x0).attr('x2', x1).attr('y1', (t) => y(t)).attr('y2', (t) => y(t));
    [[x0, 'Last week', 'middle'], [x1, 'This week', 'middle']].forEach(([x, t, a]) => svg.append('text').attr('x', x).attr('y', H - 4).attr('text-anchor', a).style('font-size', fsz + 'px').text(t));
    // keep end labels apart
    const place = (key) => { const ys = series.map((x) => y(x[key])); if (ys.length === 2 && Math.abs(ys[0] - ys[1]) < fsz + 3) { const mid = (ys[0] + ys[1]) / 2; const up = ys[0] < ys[1] ? 0 : 1; ys[up] = mid - (fsz + 3) / 2; ys[1 - up] = mid + (fsz + 3) / 2; } return ys; };
    const ya = place('a'), yb = place('b');
    series.forEach((x, i) => {
      svg.append('line').attr('x1', x0).attr('y1', y(x.a)).attr('x2', x1).attr('y2', y(x.b)).style('stroke', x.color).style('stroke-width', big ? 3.5 : 2.5).style('stroke-linecap', 'round').style('stroke-dasharray', x.dashed ? '6 5' : null);
      [[x0, x.a], [x1, x.b]].forEach(([cx, v]) => svg.append('circle').attr('cx', cx).attr('cy', y(v)).attr('r', big ? 6 : 4.5).style('fill', x.color).style('stroke', 'var(--color-panel)').style('stroke-width', 2));
      svg.append('text').attr('x', x0 - 10).attr('y', ya[i] + fsz * 0.35).attr('text-anchor', 'end').style('font-size', fsz + 'px').style('fill', 'var(--color-fg)').text(F.pct(x.a));
      const t = svg.append('text').attr('x', x1 + 10).attr('y', yb[i] + fsz * 0.35).style('font-size', fsz + 'px');
      t.append('tspan').style('fill', 'var(--color-fg-muted)').text(x.name + ' ');
      t.append('tspan').style('fill', 'var(--color-fg)').style('font-weight', 500).text(F.pct(x.b));
    });
  }
  function drawTrend() {
    const el = $('#trend'); if (!ready(el, 'scope_kpis')) return;
    slope(el, row(seg(), pkg(), fac()), seg(), false);
  }

  function fillBudget(bb, r, withTips) {
    bb.replaceChildren();
    if (!r || !(r[fb('bac')] > 0)) return;
    const tot = r[fb('bac')];
    [['earned_on_plan', 'b-earned', 'Earned to plan'], ['ahead', 'b-ahead', 'Earned ahead of plan'], ['behind', 'b-behind', 'Due, not yet earned'], ['future', 'b-future', 'Not yet due']].forEach(([k, cls, name]) => {
      const v = r[fb(k)]; if (!(v > 0)) return;
      const d = mk('div', cls); d.style.width = (v / tot) * 100 + '%';
      if (v / tot > 0.08) d.textContent = d3.format('.0%')(v / tot);
      if (withTips) attachTip(d, () => [name, [[null, 'Amount', F.amt(v)], [null, 'Share of budget', F.pct(v / tot)]]]);
      bb.append(d);
    });
  }

  // ---------- presentation ----------
  const scopeName = (s) => (s === 'All' ? 'All areas' : s);
  function head(el, eyebrow, title, sub) {
    el.append(mk('div', 'sl-eyebrow', eyebrow));
    el.append(title instanceof Node ? title : mk('h2', 'sl-title', title));
    if (sub) el.append(sub instanceof Node ? sub : mk('p', 'sl-sub', sub));
    const body = mk('div', 'sl-body'); el.append(body); return body;
  }
  const hlTitle = (key, fallback) => hlEl('h2', 'sl-title', hl(key), fallback);
  const hlSub = (key) => (hl(key) ? hlEl('p', 'sl-sub', hl(key)) : null);
  const plain = (tr) => tr; // marker for no tooltip

  const SLIDES = [
    { id: 'title', when: () => true, render(el) {
      const s = seg(), r = row(s, null, null);
      el.append(mk('div', 'sl-eyebrow', 'SBARC · weekly progress review · current reporting week'));
      el.append(mk('h2', 'sl-title hero', 'SBARC progress & earned value'));
      el.append(mk('p', 'sl-sub', scopeName(s) + ' · ' + (basis() === 'mh' ? 'weighted by man-hours' : 'weighted by cost')));
      const stats = mk('div', 'sl-stats'); stats.setAttribute('data-source', 'scope_kpis');
      const stat = (k, base, fmt, d) => { const x = mk('div', 'sl-stat'); const v = valEl('div', 'v', r, s, base, fmt); x.append(mk('div', 'k', k), v); const dd = mk('div', 'd'); d(dd); x.append(dd); stats.append(x); return v; };
      stat('Earned', 'actual_pct', 'pct', (dd) => dd.append(document.createTextNode('Last week '), valEl('b', null, r, s, 'prev_actual_pct', 'pct')));
      stat('Planned', 'planned_pct', 'pct', (dd) => dd.append(document.createTextNode('Last week '), valEl('b', null, r, s, 'prev_planned_pct', 'pct')));
      const spi = stat('SPI', 'spi', 'spi', (dd) => dd.append(document.createTextNode('Last week '), valEl('b', null, r, s, 'prev_spi', 'spi')));
      const sv = stat('Schedule variance', 'sv', 'signed', (dd) => { const b = valEl('b', null, r, s, 'sv_change', 'signed'); if (r && r[fb('sv_change')] < 0) b.classList.add('is-bad'); dd.append(b, document.createTextNode(' this week')); });
      if (r && isNum(r[fb('spi')])) spi.classList.add(r[fb('spi')] >= 0.98 ? 'is-ok' : r[fb('spi')] >= 0.9 ? 'is-warn' : 'is-bad');
      if (r && r[fb('sv')] < 0) sv.classList.add('is-bad');
      el.append(stats);
      const m = mk('div', 'pd-meter'); m.style.height = '12px'; m.setAttribute('data-source', 'scope_kpis');
      const fi = mk('div', 'fill'); fi.style.width = (r ? clamp01(r[fb('actual_pct')]) * 100 : 0) + '%';
      const tk = mk('div', 'tick'); tk.style.left = 'calc(' + (r ? clamp01(r[fb('planned_pct')]) * 100 : 0) + '% - 1px)';
      m.append(fi, tk); el.append(m);
    } },
    { id: 'messages', when: () => true, render(el) {
      const body = head(el, 'Summary', 'Key messages');
      const ol = mk('ol', 'sl-msgs'); ol.setAttribute('data-source', 'headlines');
      hlFor(seg(), basis()).forEach((h) => ol.append(hlEl('li', null, h)));
      body.append(ol);
    } },
    { id: 'budget', when: () => true, render(el) {
      const s = seg(), r = row(s, null, null);
      const body = head(el, 'Budget status', 'Where the ' + (basis() === 'mh' ? 'man-hour budget' : 'budget') + ' stands', hlSub('status'));
      body.classList.add('two');
      const a = mk('div', 'sl-col'); a.append(mk('h3', null, 'Budget split'));
      const bb = mk('div', 'pd-budget'); bb.setAttribute('data-source', 'scope_kpis'); fillBudget(bb, r, false); a.append(bb);
      const lg = mk('div', 'pd-bleg');
      [['earned_on_plan', 'var(--pd-accent)', 'Earned to plan'], ['ahead', 'color-mix(in srgb,var(--pd-accent) 55%,var(--color-panel))', 'Earned ahead'], ['behind', 'var(--pd-bad)', 'Due, not earned'], ['future', 'var(--pd-trackbg)', 'Not yet due']].forEach(([k, c, n]) => {
        if (!(r && r[fb(k)] > 0)) return;
        const d = mk('div'); const lab = mk('span'); const i = mk('i'); i.style.background = c; lab.append(i, document.createTextNode(n));
        const v = valEl('span', 'v', r, s, k, 'amt'); if (k === 'behind') v.classList.add('is-bad');
        d.append(lab, v); lg.append(d);
      });
      a.append(lg);
      const b = mk('div', 'sl-col'); b.append(mk('h3', null, 'Last week → this week'));
      const ch = mk('div'); b.append(ch);
      body.append(a, b);
      slope(ch, r, s, true);
    } },
    { id: 'drivers', when: () => true, render(el) {
      const body = head(el, 'Delay drivers', hlTitle('drivers', 'No work package is behind plan'), 'Work packages with the largest planned value not yet earned, to date.');
      body.setAttribute('data-source', 'scope_kpis');
      const rows = packagesIn(seg(), null).filter((r) => r[fb('sv')] < -0.5).sort((a, b) => a[fb('sv')] - b[fb('sv')]).slice(0, 10);
      const max = d3.max(rows, (r) => -r[fb('sv')]) || 1;
      const box = mk('div');
      rows.forEach((r) => box.append(barRow(r.package, (tr) => bar(tr, -r[fb('sv')] / max, 'var(--pd-bad)'),
        mk('span', 'is-bad', F.signed(r[fb('sv')]) + '  ·  SPI ' + F.spi(r[fb('spi')])))));
      body.append(box);
    } },
    { id: 'week', when: () => true, render(el) {
      const body = head(el, 'This week', hlTitle('week', 'This week'), null);
      body.setAttribute('data-source', 'scope_kpis');
      const lg = mk('div', 'pd-legend'); lg.innerHTML = '<span><i style="background:var(--pd-muted)"></i>Planned this week</span><span><i style="background:var(--pd-accent)"></i>Earned this week</span>';
      const rows = packagesIn(seg(), null).filter((r) => r[fb('pv_week')] > 0.5 || r[fb('ev_week')] > 0.5).sort((a, b) => b[fb('pv_week')] - a[fb('pv_week')]).slice(0, 10);
      const max = d3.max(rows, (r) => Math.max(r[fb('pv_week')], r[fb('ev_week')])) || 1;
      const box = mk('div');
      rows.forEach((r) => {
        const v = mk('span'); v.append(mk('b', null, F.amt(r[fb('ev_week')])), document.createTextNode(' / ' + F.amt(r[fb('pv_week')])));
        box.append(barRow(r.package, (tr) => { tr.classList.add('bare'); bar(tr, r[fb('pv_week')] / max, 'var(--pd-muted)', 'half1'); bar(tr, Math.max(0, r[fb('ev_week')]) / max, 'var(--pd-accent)', 'half2'); }, v));
      });
      body.append(lg, box);
    } },
    { id: 'areas', when: () => seg() === 'All', render(el) {
      const body = head(el, 'By area', hlTitle('focus', 'Progress by area'), 'Earned vs planned share of each area’s ' + (basis() === 'mh' ? 'man-hour budget' : 'budget') + '.');
      body.classList.add('three');
      ['Buildings', 'Villas', 'Site-wide'].forEach((ar) => {
        const r = row(ar, null, null); if (!r) return;
        const d = mk('div', 'sl-area'); d.setAttribute('data-source', 'scope_kpis');
        const big = valEl('div', 'big', r, ar, 'actual_pct', 'pct'); big.setAttribute('data-where', whereScope(ar, null, null));
        const m = mk('div', 'pd-meter'); const fi = mk('div', 'fill'); fi.style.width = clamp01(r[fb('actual_pct')]) * 100 + '%'; const tk = mk('div', 'tick'); tk.style.left = 'calc(' + clamp01(r[fb('planned_pct')]) * 100 + '% - 1px)'; m.append(fi, tk);
        const line = (label, base, fmt, cls) => { const p = mk('div'); const v = valEl('b', cls || null, r, ar, base, fmt); v.setAttribute('data-where', whereScope(ar, null, null)); p.append(document.createTextNode(label + ' '), v); return p; };
        d.append(mk('div', 'nm', ar), big, m, line('Planned', 'planned_pct', 'pct'), line('Variance', 'sv', 'signed', r[fb('sv')] < 0 ? 'is-bad' : null), line('SPI', 'spi', 'spi'), line('Earned this week', 'ev_week', 'amt'), line('Planned this week', 'pv_week', 'amt'));
        body.append(d);
      });
    } },
    { id: 'buildings', when: () => seg() === 'All' || seg() === 'Buildings', render(el) {
      const body = head(el, 'Buildings', seg() === 'Buildings' ? hlTitle('focus', 'Buildings') : mk('h2', 'sl-title', 'Buildings: earned vs planned'), 'Sorted by gap to plan. Bar is earned %, tick is planned %.');
      body.setAttribute('data-source', 'scope_kpis');
      const rows = facilitiesIn('Buildings', null).filter((r) => r[fb('bac')] > 0).sort((a, b) => a[fb('gap_pts')] - b[fb('gap_pts')]);
      const box = mk('div');
      rows.forEach((r) => {
        const v = mk('span'); v.append(mk('b', null, F.pct(r[fb('actual_pct')])), document.createTextNode('  '), mk('span', r[fb('gap_pts')] < -0.0005 ? 'is-bad' : 'is-ok', F.pts(r[fb('gap_pts')])));
        box.append(barRow(r.facility, (tr) => { bar(tr, r[fb('actual_pct')], 'var(--pd-accent)'); tick(tr, r[fb('planned_pct')]); }, v));
      });
      body.append(box);
    } },
    { id: 'villas', when: () => seg() === 'All' || seg() === 'Villas', render(el) {
      const body = head(el, 'Villas', seg() === 'Villas' ? hlTitle('focus', 'Villas') : mk('h2', 'sl-title', 'Villas by cluster'), 'Bar is earned %, tick is planned %.');
      body.classList.add('two');
      const a = mk('div', 'sl-col'); a.setAttribute('data-source', 'cluster_kpis'); a.append(mk('h3', null, 'Clusters'));
      clusterRows().filter((c) => c.package === 'All' && c[fb('bac')] > 0).sort((x, y) => x.cluster.localeCompare(y.cluster, 'en', { numeric: true })).forEach((c) => {
        a.append(barRow(c.cluster + ' · ' + F.int(c.villas) + (c.villas === 1 ? ' villa' : ' villas'), (tr) => { bar(tr, c[fb('actual_pct')], 'var(--pd-accent)'); tick(tr, c[fb('planned_pct')]); },
          mk('span', c[fb('gap_pts')] < -0.0005 ? 'is-bad' : null, F.pct(c[fb('actual_pct')]) + '  ' + F.pts(c[fb('gap_pts')]))));
      });
      const b = mk('div', 'sl-col'); b.setAttribute('data-source', 'scope_kpis'); b.append(mk('h3', null, 'Villas furthest behind'));
      facilitiesIn('Villas', null).filter((r) => r[fb('bac')] > 0).sort((x, y) => x[fb('gap_pts')] - y[fb('gap_pts')]).slice(0, 8).forEach((r) => {
        b.append(barRow(r.facility, (tr) => { bar(tr, r[fb('actual_pct')], 'var(--pd-accent)'); tick(tr, r[fb('planned_pct')]); }, mk('span', 'is-bad', F.pts(r[fb('gap_pts')]))));
      });
      body.append(a, b);
    } },
    { id: 'activities', when: () => true, render(el) {
      const body = head(el, 'Critical activities', 'Activities with the largest gap to plan', hlSub('activities'));
      const I = acts();
      if (!I) { const st = dash.data('activities').status; const x = mk('div', st === 'loading' ? 'dash-skeleton' : 'pd-fail', st === 'loading' ? null : 'Failed to load'); x.style.minHeight = '10rem'; body.append(x); return; }
      const gf = fb('gap'); const s = seg();
      const rows = I.list.filter((r) => (s === 'All' || r.segment === s) && r.behind).sort((a, b) => (b[gf] || 0) - (a[gf] || 0)).slice(0, 10);
      const t = mk('table'); t.setAttribute('data-source', 'activities'); t.setAttribute('data-row-key', 'activity_id');
      const hr = mk('tr');
      [['activity_id', 'ID', 'l'], ['activity', 'Activity', 'l'], ['package', 'Work package', 'l sec'], ['facility', 'Facility', 'l sec'], ['sched_pct', 'Planned', ''], ['perf_pct', 'Earned', ''], [gf, 'Gap', '']].forEach(([f, n, c]) => { const th = mk('th', c || null, n); th.setAttribute('data-field', f); if (f === gf) th.setAttribute('data-source', 'activity_metrics'); hr.append(th); });
      const thead = mk('thead'); thead.append(hr); const tb = mk('tbody');
      rows.forEach((r) => { const tr = mk('tr'); tr.dataset.key = r.activity_id; tr.append(mk('td', 'l id', r.activity_id), mk('td', 'l', r.activity), mk('td', 'l sec', r.package), mk('td', 'l sec', r.facility), mk('td', null, F.pct(r.sched_pct)), mk('td', null, F.pct(r.perf_pct)), mk('td', 'is-bad', isNum(r[gf]) ? compact.format(r[gf]) + unit() : '—')); tb.append(tr); });
      t.append(thead, tb);
      const wrap = mk('div'); wrap.style.overflow = 'hidden'; wrap.append(t); body.append(wrap);
    } },
    { id: 'remaining', when: () => true, render(el) {
      const body = head(el, 'Remaining work', 'What’s left to earn', hlSub('remaining'));
      body.setAttribute('data-source', 'scope_kpis');
      const lg = mk('div', 'pd-legend'); lg.innerHTML = '<span><i style="background:var(--pd-bad)"></i>Due, not yet earned</span><span><i style="background:var(--cds-chart-muted)"></i>Not yet due</span>';
      const rows = packagesIn(seg(), null).filter((r) => r[fb('remaining')] > 0.5).sort((a, b) => b[fb('remaining')] - a[fb('remaining')]).slice(0, 10);
      const max = d3.max(rows, (r) => r[fb('remaining')]) || 1;
      const box = mk('div');
      rows.forEach((r) => {
        const bh = r[fb('behind')] / max, fu = r[fb('future')] / max;
        box.append(barRow(r.package, (tr) => { tr.classList.add('bare'); bar(tr, bh, 'var(--pd-bad)'); bar(tr, fu, 'var(--cds-chart-muted)', null, bh); }, mk('b', null, F.amt(r[fb('remaining')]))));
      });
      body.append(lg, box);
    } },
  ];
  state.slide = 0; state.slideKey = null;
  const slideList = () => SLIDES.filter((x) => x.when());
  function drawSlide() {
    const list = slideList();
    state.slide = Math.max(0, Math.min(list.length - 1, state.slide));
    const el = $('#slide');
    $('#sl-count').textContent = (state.slide + 1) + ' / ' + list.length;
    $('#sl-prev').disabled = state.slide === 0; $('#sl-next').disabled = state.slide === list.length - 1;
    const dots = $('#sl-dots'); dots.replaceChildren(...list.map((x, i) => { const b = mk('button'); b.setAttribute('role', 'tab'); b.setAttribute('aria-label', 'Slide ' + (i + 1)); b.setAttribute('aria-selected', String(i === state.slide)); b.addEventListener('click', () => { state.slide = i; drawSlide(); }); return b; }));
    if (!ready(el, 'scope_kpis', 'headlines', 'cluster_kpis')) return;
    const sl = list[state.slide];
    el.replaceChildren();
    sl.render(el);
    const foot = mk('div', 'sl-foot');
    foot.append(mk('span', null, 'SBARC · ' + scopeName(seg()) + ' · ' + (basis() === 'mh' ? 'Man-hours' : 'Cost') + ' · Source: ahmed_sayed_sheet.xlsx'), mk('span', null, (state.slide + 1) + ' / ' + list.length));
    el.append(foot);
    const key = sl.id + '|' + seg() + '|' + basis();
    if (key !== state.slideKey) { state.slideKey = key; el.classList.remove('pd-anim'); void el.offsetWidth; el.classList.add('pd-anim'); }
  }
  const goSlide = (d) => { state.slide += d; drawSlide(); };
  $('#sl-prev').addEventListener('click', () => goSlide(-1));
  $('#sl-next').addEventListener('click', () => goSlide(1));
  document.addEventListener('keydown', (e) => {
    if (state.tab !== 'present') return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select')) return;
    if (e.key === ' ' && t && t.closest && t.closest('button')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); goSlide(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goSlide(-1); }
    else if (e.key === 'Home') { e.preventDefault(); state.slide = 0; drawSlide(); }
    else if (e.key === 'End') { e.preventDefault(); state.slide = 99; drawSlide(); }
  });
  (() => {
    const btn = $('#sl-full'); const pres = $('#present');
    if (!(document.fullscreenEnabled && pres.requestFullscreen)) return;
    btn.hidden = false;
    btn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else pres.requestFullscreen().then(() => $('#stage').focus()).catch(() => { btn.hidden = true; });
    });
    document.addEventListener('fullscreenchange', () => { btn.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; requestAnimationFrame(drawSlide); });
  })();

  // ---------- draw ----------
  function draw() {
    root.style.setProperty('--pd-accent', dash.colors[0]);
    root.style.setProperty('--pd-accent2', dash.colors[1]);
    hideTip();
    drawHeader();
    if (state.tab === 'home') { drawMessages(); drawHero(); }
    if (state.tab === 'overview') { drawTrend(); drawTreemap(); drawScatter(); drawVariance(); drawWeek(); }
    if (state.tab === 'packages') { drawDrill(); drawDumbbell(); drawPkgTable(); }
    if (state.tab === 'facilities') { $('#fac-note').hidden = seg() !== 'Site-wide'; drawBuildings(); drawBHeat(); drawVillas(); drawVHeat(); }
    if (state.tab === 'activities') { drawStatus(); drawActs(); drawDetail(); }
    if (state.tab === 'present') drawSlide();
    root.classList.toggle('is-presenting', state.tab === 'present');
    if (!state.drawnOnce && index()) {
      state.drawnOnce = true;
      $$('.pd-kpi, .pd-card').forEach((c, i) => { c.classList.add('pd-anim'); c.style.animationDelay = Math.min(i, 10) * 40 + 'ms'; });
      requestAnimationFrame(() => root.classList.add('drawn'));
    }
  }

  const named = location.hash.slice(1);
  if (['home', 'overview', 'packages', 'facilities', 'activities', 'present', 'about'].includes(named)) showTab(named, false);
  dash.onData(draw);
})();
