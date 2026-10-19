dash.calc('scope_kpis', {
  title: 'Progress by area, package, facility',
  description: 'Sums activity rows for every area × package × facility, with “All” roll-ups; progress = value ÷ budget, SPI = earned ÷ planned.',
  inputs: ['pkg_facility'],
  fn: (pkg_facility) => {
    const K = ['bac', 'pv', 'ev', 'pv_week', 'ev_week', 'mh_bac', 'mh_pv', 'mh_ev', 'mh_pv_week', 'mh_ev_week', 'n_act', 'n_done', 'n_wip', 'n_open', 'n_behind'];
    const groups = new Map();
    for (const r of pkg_facility) {
      for (const s of ['All', r.segment]) for (const p of ['All', r.package]) for (const f of ['All', r.facility]) {
        const key = s + '|' + p + '|' + f;
        let g = groups.get(key);
        if (!g) {
          g = { segment: s, package: p, facility: f, order: p === 'All' ? 0 : r.order };
          K.forEach((k) => { g[k] = 0; });
          groups.set(key, g);
        }
        K.forEach((k) => { g[k] += Number(r[k]) || 0; });
      }
    }
    const div = (a, b) => (b > 0 ? a / b : null);
    return [...groups.values()].map((g) => {
      const o = { ...g };
      for (const pre of ['', 'mh_']) {
        const bac = g[pre + 'bac'], pv = g[pre + 'pv'], ev = g[pre + 'ev'];
        o[pre + 'planned_pct'] = div(pv, bac);
        o[pre + 'actual_pct'] = div(ev, bac);
        o[pre + 'gap_pts'] = div(ev - pv, bac);
        o[pre + 'sv'] = ev - pv;
        o[pre + 'spi'] = div(ev, pv);
        o[pre + 'remaining'] = bac - ev;
        o[pre + 'week_spi'] = div(g[pre + 'ev_week'], g[pre + 'pv_week']);
        o[pre + 'week_gain_pct'] = div(g[pre + 'ev_week'], bac);
        o[pre + 'earned_on_plan'] = Math.min(ev, pv);
        o[pre + 'ahead'] = Math.max(ev - pv, 0);
        o[pre + 'behind'] = Math.max(pv - ev, 0);
        o[pre + 'future'] = Math.max(bac - Math.max(pv, ev), 0);
        const pev = ev - g[pre + 'ev_week'], ppv = pv - g[pre + 'pv_week'];
        o[pre + 'prev_actual_pct'] = div(pev, bac);
        o[pre + 'prev_planned_pct'] = div(ppv, bac);
        o[pre + 'prev_sv'] = pev - ppv;
        o[pre + 'prev_spi'] = div(pev, ppv);
        o[pre + 'sv_change'] = g[pre + 'ev_week'] - g[pre + 'pv_week'];
        o[pre + 'spi_change'] = o[pre + 'spi'] != null && o[pre + 'prev_spi'] != null ? o[pre + 'spi'] - o[pre + 'prev_spi'] : null;
      }
      o.done_pct = div(g.n_done, g.n_act);
      return o;
    });
  },
});

dash.calc('cluster_kpis', {
  title: 'Villa clusters by package',
  description: 'Villas grouped by the prefix of their number (R1, R2 …), per work package and overall.',
  inputs: ['pkg_facility'],
  fn: (pkg_facility) => {
    const K = ['bac', 'pv', 'ev', 'mh_bac', 'mh_pv', 'mh_ev', 'n_act', 'n_done', 'n_behind'];
    const m = new Map();
    const names = new Map();
    for (const r of pkg_facility) {
      if (r.segment !== 'Villas' || r.facility === '—') continue;
      const cluster = r.facility.split('-')[0];
      for (const p of ['All', r.package]) {
        const key = p + '|' + cluster;
        let g = m.get(key);
        if (!g) {
          g = { package: p, cluster, order: p === 'All' ? 0 : r.order };
          K.forEach((k) => { g[k] = 0; });
          m.set(key, g);
          names.set(key, new Set());
        }
        K.forEach((k) => { g[k] += Number(r[k]) || 0; });
        names.get(key).add(r.facility);
      }
    }
    const div = (a, b) => (b > 0 ? a / b : null);
    return [...m.entries()].map(([key, g]) => ({
      ...g,
      villas: names.get(key).size,
      planned_pct: div(g.pv, g.bac), actual_pct: div(g.ev, g.bac), gap_pts: div(g.ev - g.pv, g.bac),
      mh_planned_pct: div(g.mh_pv, g.mh_bac), mh_actual_pct: div(g.mh_ev, g.mh_bac), mh_gap_pts: div(g.mh_ev - g.mh_pv, g.mh_bac),
    }));
  },
});

dash.calc('headlines', {
  title: 'Key messages',
  description: 'Plain-language findings for each area and measure, worded from the totals by area, package and facility.',
  inputs: ['scope_kpis'],
  fn: (scope_kpis) => {
    const nf = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
    const pct = (v) => (v * 100).toFixed(1) + '%';
    const pts = (v) => Math.abs(v * 100).toFixed(1) + ' pts';
    const int = (v) => Math.round(v).toLocaleString('en');
    const out = [];
    for (const segment of ['All', 'Buildings', 'Villas', 'Site-wide']) {
      for (const basis of ['cost', 'mh']) {
        const p = basis === 'mh' ? 'mh_' : '';
        const u = basis === 'mh' ? ' man-hours' : '';
        const amt = (v) => nf.format(Math.abs(v)) + u;
        const was = basis === 'mh' ? 'were' : 'was', is = basis === 'mh' ? 'are' : 'is';
        const t = scope_kpis.find((r) => r.segment === segment && r.package === 'All' && r.facility === 'All');
        if (!t || !(t[p + 'bac'] > 0)) continue;
        let rank = 0;
        const add = (key, text) => { rank += 1; out.push({ segment, basis, key, rank, text }); };
        const scope = segment === 'All' ? 'The project is' : segment === 'Site-wide' ? 'Site-wide works are' : segment + ' are';
        const sv = t[p + 'sv'];
        const spi = t[p + 'spi'] != null ? ' (SPI ' + t[p + 'spi'].toFixed(2) + ')' : '';
        add('status', scope + ' ' + pct(t[p + 'actual_pct']) + ' complete against ' + pct(t[p + 'planned_pct']) + ' planned, ' + amt(sv) + (sv < 0 ? ' behind' : ' ahead of') + ' plan' + spi + '.');
        const wk = t[p + 'pv_week'];
        if (wk > 0) {
          const d = t[p + 'ev_week'] - wk;
          add('week', 'This week ' + amt(t[p + 'ev_week']) + ' ' + was + ' earned against ' + amt(wk) + ' planned (weekly SPI ' + (t[p + 'ev_week'] / wk).toFixed(2) + '), so the gap to plan ' + (d < 0 ? 'widened' : 'narrowed') + ' by ' + amt(d) + '.');
        }
        const pk = scope_kpis.filter((r) => r.segment === segment && r.facility === 'All' && r.package !== 'All' && r[p + 'sv'] < 0).sort((a, b) => a[p + 'sv'] - b[p + 'sv']);
        const gross = pk.reduce((s, r) => s - r[p + 'sv'], 0);
        if (pk.length && gross > 0) {
          const top = pk.slice(0, 3);
          const share = top.reduce((s, r) => s - r[p + 'sv'], 0) / gross;
          add('drivers', (top.length === 1 ? 'One package accounts for ' : 'The top ' + top.length + ' packages account for ') + Math.round(share * 100) + '% of the shortfall: ' + top.map((r) => r.package + ' (' + amt(r[p + 'sv']) + ')').join(', ') + '.');
        }
        if (segment === 'All') {
          const areas = scope_kpis.filter((r) => r.package === 'All' && r.facility === 'All' && r.segment !== 'All' && r[p + 'bac'] > 0).sort((a, b) => a[p + 'gap_pts'] - b[p + 'gap_pts']);
          if (areas.length) {
            const a = areas[0];
            add('focus', (a.segment === 'Site-wide' ? 'Site-wide works are' : a.segment + ' are') + ' furthest behind: ' + pct(a[p + 'actual_pct']) + ' earned vs ' + pct(a[p + 'planned_pct']) + ' planned (' + pts(a[p + 'gap_pts']) + ' short).');
          }
        } else {
          const fs = scope_kpis.filter((r) => r.segment === segment && r.package === 'All' && r.facility !== 'All' && r.facility !== '—' && r[p + 'bac'] > 0).sort((a, b) => a[p + 'gap_pts'] - b[p + 'gap_pts']);
          if (fs.length) {
            const f = fs[0];
            add('focus', (segment === 'Villas' ? 'Villa ' : '') + f.facility + ' is furthest behind: ' + pct(f[p + 'actual_pct']) + ' earned vs ' + pct(f[p + 'planned_pct']) + ' planned (' + pts(f[p + 'gap_pts']) + ' short).');
          }
        }
        if (t.n_act > 0) add('activities', int(t.n_behind) + ' of ' + int(t.n_act) + ' activities are behind plan; ' + int(t.n_done) + ' (' + pct(t.n_done / t.n_act) + ') are complete.');
        add('remaining', amt(t[p + 'remaining']) + ' (' + pct(t[p + 'remaining'] / t[p + 'bac']) + ') ' + is + ' still to be earned, of which ' + amt(t[p + 'behind']) + ' ' + was + ' already due.');
      }
    }
    return out;
  },
});

dash.calc('activity_metrics', {
  title: 'Activity variance & status',
  description: 'Per activity: variance = earned − planned, gap = planned − earned, SPI = earned ÷ planned, status from performance %, behind when schedule % exceeds performance %.',
  inputs: ['activities'],
  fn: (activities) => activities.map((a) => {
    const n = (k) => Number(a[k]) || 0;
    const sched = n('sched_pct'), perf = n('perf_pct'), bac = n('bac'), mbac = n('mh_bac');
    return {
      activity_id: a.activity_id,
      sv: n('ev') - n('pv'), gap: n('pv') - n('ev'), spi: n('pv') > 0 ? n('ev') / n('pv') : null,
      mh_sv: n('mh_ev') - n('mh_pv'), mh_gap: n('mh_pv') - n('mh_ev'), mh_spi: n('mh_pv') > 0 ? n('mh_ev') / n('mh_pv') : null,
      pct_gap: perf - sched,
      week_planned_pct: bac > 0 ? n('pv_week') / bac : (mbac > 0 ? n('mh_pv_week') / mbac : null),
      week_earned_pct: bac > 0 ? n('ev_week') / bac : (mbac > 0 ? n('mh_ev_week') / mbac : null),
      status: perf >= 0.9999 ? 'Complete' : perf <= 0 ? 'Not started' : 'In progress',
      behind: sched - perf > 0.001,
    };
  }),
});
