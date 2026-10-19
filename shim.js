// Minimal runtime that gives the page the same data API the dashboard used.
window.dash = (() => {
  const datasets = {};
  const calcs = [];
  const listeners = [];
  const DEFAULTS = { segment: 'All', basis: 'cost', package: null, facility: null, activity: null };
  let params = { ...DEFAULTS };
  try { const b = localStorage.getItem('pp-basis'); if (b === 'mh' || b === 'cost') params.basis = b; } catch (e) { /* storage unavailable */ }
  const colors = Array.from({ length: 8 }, (_, i) => 'var(--series-' + (i + 1) + ')');
  let queued = false;
  const notify = () => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); });
  };
  const data = (id) => datasets[id] || { status: 'loading', data: [] };
  function calc(id, o) { calcs.push({ id, ...o }); datasets[id] = { status: 'loading', data: [] }; runCalcs(); notify(); }
  function runCalcs() {
    let moved = true;
    while (moved) {
      moved = false;
      for (const c of calcs) {
        if (datasets[c.id].status !== 'loading') continue;
        const ins = c.inputs.map((i) => datasets[i]);
        if (ins.some((x) => x && (x.status === 'error'))) { datasets[c.id] = { status: 'error', data: [] }; moved = true; continue; }
        if (ins.every((x) => x && x.status === 'ok')) {
          try { datasets[c.id] = { status: 'ok', data: c.fn(...ins.map((x) => x.data)) }; } catch (e) { console.error(e); datasets[c.id] = { status: 'error', data: [] }; }
          moved = true;
        }
      }
    }
  }
  function load(id, url, kind) {
    datasets[id] = { status: 'loading', data: [] };
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return kind === 'csv' ? r.text() : r.json(); })
      .then((x) => { datasets[id] = { status: 'ok', data: kind === 'csv' ? d3.csvParse(x) : x }; runCalcs(); notify(); })
      .catch((e) => { console.error(e); datasets[id] = { status: 'error', data: [], message: String(e) }; runCalcs(); notify(); });
  }
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(notify, 120); });
  return {
    data, calc, colors, load,
    params: () => ({ ...params }),
    setParams: (o) => { Object.assign(params, o); if ('basis' in o) { try { localStorage.setItem('pp-basis', params.basis); } catch (e) { /* ignore */ } } notify(); },
    resetParams: () => { params = { ...DEFAULTS }; notify(); },
    onData: (fn) => { listeners.push(fn); fn(); },
    refresh: () => {},
    setLink: (id) => { try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignore */ } },
  };
})();
dash.load('pkg_facility', 'data/pkg_facility.json', 'json');
dash.load('activities', 'data/activities.csv', 'csv');

// theme toggle: system → light → dark
(() => {
  const btn = document.getElementById('theme-btn');
  const label = { '': 'Theme: auto', light: 'Theme: light', dark: 'Theme: dark' };
  let t = '';
  try { t = localStorage.getItem('pp-theme') || ''; } catch (e) { /* ignore */ }
  const apply = () => { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); btn.textContent = label[t]; };
  apply();
  btn.addEventListener('click', () => { t = t === '' ? 'light' : t === 'light' ? 'dark' : ''; try { localStorage.setItem('pp-theme', t); } catch (e) { /* ignore */ } apply(); });
})();
