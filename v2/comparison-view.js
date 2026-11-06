// Tampilan perbandingan hari aturan vs hari AI dari run.report.comparison (API /smartpot/api/ai).
(() => {
  'use strict';
  if (!window.SmartPotAuth?.authenticated) return;
  const core = window.SmartPotCsv;
  const byId = id => document.getElementById(id);
  const HOUR = core.HOUR;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const TELEMETRY_API = 'https://wincamp.web.id/smartpot/api/telemetry';
  const num = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat('id-ID');
  const clockFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dayFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const stampFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const isNum = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const pct = value => isNum(value) ? `${num.format(Number(value))}%` : '—';
  const pts = value => isNum(value) ? `${num.format(Number(value))} poin` : '—';
  const clock = ms => clockFmt.format(new Date(Number(ms)));
  const stamp = ms => isNum(ms) ? `${stampFmt.format(new Date(Number(ms)))} WIB` : '—';
  const VERDICT = { sama: 'Sama', ai_lebih_awal: 'AI lebih awal', aturan_lebih_awal: 'Aturan lebih awal', tidak_dapat_disimpulkan: 'Belum dapat disimpulkan' };
  const INTRO = byId('compare-intro').textContent;
  let payload = null;
  let lastWidth = 0;
  let tableKey = '';

  // Telemetry 72 jam untuk nilai aktual hari aturan; dipakai juga oleh ekspor CSV.
  async function loadTelemetry({ profile, source, hours = 72 }) {
    const url = new URL(TELEMETRY_API);
    url.searchParams.set('source', source);
    url.searchParams.set('hours', String(hours));
    url.searchParams.set('profile', profile);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Telemetry gagal dibaca (${response.status}).`);
      if (body.database !== 'Smartport' || !Array.isArray(body.data)) throw new Error('Format telemetry tidak sesuai.');
      return { rows: body.data.map(row => ({ ...row, ts: typeof row.ts === 'number' ? row.ts : Date.parse(row.ts) })), truncated: Boolean(body.truncated), deviceId: body.device_id };
    } catch (error) {
      throw error.name === 'AbortError' ? new Error('Telemetry melewati batas waktu.') : error;
    } finally { clearTimeout(timer); }
  }
  window.SmartPotTelemetry = { load: loadTelemetry };

  function comparisonOf(data) {
    const comparison = data?.run?.report?.comparison;
    return core.usableComparison(comparison) ? comparison : null;
  }
  window.SmartPotComparison = { current: () => ({ payload, comparison: comparisonOf(payload) }) };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function svg(tag, attrs, parent, text) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  }
  function relativeDay(date) {
    const now = Date.now();
    if (date === core.wibDate(now)) return 'Hari ini';
    if (date === core.wibDate(now - 24 * HOUR)) return 'Kemarin';
    if (date === core.wibDate(now + 24 * HOUR)) return 'Besok';
    return null;
  }
  function longDate(date) {
    const ms = Date.parse(`${date}T12:00:00+07:00`);
    return Number.isFinite(ms) ? dayFmt.format(new Date(ms)) : (date || '—');
  }
  function times(list, valueKey, valueLabel) {
    const items = Array.isArray(list) ? list.filter(item => isNum(item?.at)) : [];
    if (!items.length) return el('span', 'muted', 'Tidak ada');
    const ul = el('ul', 'time-chips');
    items.forEach(item => {
      const li = el('li');
      li.append(el('strong', null, clock(item.at)), el('span', null, `${valueLabel} ${pct(item[valueKey])}`));
      ul.append(li);
    });
    return ul;
  }
  function coverageTag(day) {
    const coverage = Number(day?.coverage_pct);
    const tone = !isNum(day?.coverage_pct) || coverage < 20 ? 'is-bad' : coverage < 80 ? 'is-warn' : 'is-good';
    return el('span', `tag ${tone}`, isNum(day?.coverage_pct) ? `Cakupan ${num.format(coverage)}%` : 'Cakupan —');
  }
  function dayCard(container, titleId, title, day, facts) {
    container.replaceChildren();
    const head = el('div', 'day-head');
    const heading = el('div');
    const h4 = el('h4', null, title); h4.id = titleId;
    heading.append(h4, el('p', 'caption', longDate(day?.date)));
    head.append(heading, coverageTag(day));
    const dl = el('dl', 'facts');
    facts.forEach(([label, value, hint]) => {
      const row = el('div');
      const dd = el('dd');
      if (value instanceof Node) dd.append(value); else dd.textContent = value;
      if (hint) dd.append(el('small', null, hint));
      row.append(el('dt', null, label), dd);
      dl.append(row);
    });
    container.append(head, dl);
  }
  const countLabel = list => `${Array.isArray(list) ? list.length : 0}×`;
  const coverageText = day => `${pct(day?.coverage_pct)} · ${isNum(day?.valid_minutes) ? integer.format(day.valid_minutes) : '—'} dari 1.440 menit valid`;
  const soilRange = day => `${pct(day?.soil_min)} / ${pct(day?.soil_avg)} / ${pct(day?.soil_max)}`;
  const climate = day => `${isNum(day?.temperature_avg) ? `${num.format(day.temperature_avg)} °C` : '—'} · udara ${pct(day?.humidity_avg)}`;
  function modelText(model) {
    if (!model) return '—';
    // dry_rate_pct_per_hour bertanda: negatif = tanah mengering (turun), positif = naik.
    const rate = isNum(model.dry_rate_pct_per_hour) ? Math.round(Number(model.dry_rate_pct_per_hour) * 10) / 10 : null;
    const parts = [rate === null ? 'laju kering —' : rate < 0 ? `turun ${num.format(-rate)}% per jam` : rate > 0 ? `naik ${num.format(rate)}% per jam` : 'stabil (0% per jam)'];
    parts.push(isNum(model.pump_jump_pct) ? `naik ${num.format(model.pump_jump_pct)} poin setelah siram` : 'kenaikan setelah siram belum terukur');
    if (isNum(model.pump_sessions)) parts.push(`${integer.format(model.pump_sessions)} sesi pompa dalam data latih`);
    return parts.join(' · ');
  }

  function renderCards(cmp) {
    const rule = cmp.rule_day || {};
    const ai = cmp.ai_day;
    const threshold = isNum(cmp.threshold_pct) ? `${num.format(cmp.threshold_pct)}%` : 'ambang';
    dayCard(byId('compare-rule'), 'compare-rule-title', `${relativeDay(rule.date) || 'Hari pertama'} · aturan sensor`, rule, [
      ['Cakupan data', coverageText(rule)],
      ['Tanah min / rata-rata / maks', soilRange(rule)],
      [`Di bawah ${threshold}`, isNum(rule.minutes_below_threshold) ? `${integer.format(rule.minutes_below_threshold)} menit` : '—'],
      [`Aturan akan menyiram · ${countLabel(rule.would_water)}`, times(rule.would_water, 'soil_pct', 'tanah')],
      ['Pompa menyala (catatan alat)', isNum(rule.actual_pump_on) ? `${integer.format(rule.actual_pump_on)}×` : '—'],
      ['Suhu rata-rata', climate(rule)]
    ]);
    const mae = isNum(ai.mae_pct) && isNum(ai.persistence_mae_pct)
      ? `${pts(ai.mae_pct)} model · ${pts(ai.persistence_mae_pct)} persistensi`
      : 'Belum ada titik aktual';
    dayCard(byId('compare-ai'), 'compare-ai-title', `${relativeDay(ai.date) || 'Hari kedua'} · prediksi AI`, ai, [
      ['Cakupan data', coverageText(ai)],
      ['Model dilatih sampai', stamp(ai.trained_until), isNum(ai.train_valid_minutes) ? `${integer.format(ai.train_valid_minutes)} menit data valid` : null],
      ['Tanah awal prediksi', pct(ai.start_soil_pct)],
      [`AI merencanakan siram · ${countLabel(ai.planned_waterings)}`, times(ai.planned_waterings, 'predicted_soil_pct', 'prediksi')],
      [`Aturan pada data nyata · ${countLabel(ai.rule_on_actual?.would_water)}`, times(ai.rule_on_actual?.would_water, 'soil_pct', 'tanah')],
      [`Di bawah ${threshold}`, isNum(ai.minutes_below_threshold) ? `${integer.format(ai.minutes_below_threshold)} menit` : '—'],
      ['Galat rata-rata (MAE)', mae, `${isNum(ai.points) ? integer.format(ai.points) : 0} titik per jam · lebih kecil lebih baik`],
      ['Model', modelText(ai.model)],
      ['Pompa menyala (catatan alat)', isNum(ai.actual_pump_on) ? `${integer.format(ai.actual_pump_on)}×` : '—']
    ]);
  }

  function renderVerdict(cmp) {
    const code = cmp.verdict?.code || 'tidak_dapat_disimpulkan';
    const badge = byId('compare-verdict-badge');
    badge.textContent = VERDICT[code] || 'Hasil';
    badge.className = `verdict-badge is-${code.replace(/_/g, '-')}`;
    byId('compare-verdict-text').textContent = cmp.verdict?.text || 'Data belum cukup untuk menarik kesimpulan.';
  }

  function renderTomorrow(cmp) {
    const plan = cmp.tomorrow;
    const list = byId('compare-tomorrow');
    list.replaceChildren();
    if (!plan) {
      byId('compare-tomorrow-meta').textContent = 'Rencana besok belum tersedia.';
      return;
    }
    byId('compare-tomorrow-meta').textContent = `${relativeDay(plan.date) || 'Rencana'} · ${longDate(plan.date)} · mulai dari ${pct(plan.start_soil_pct)} · ${modelText(plan.model)}`;
    const items = Array.isArray(plan.planned_waterings) ? plan.planned_waterings : [];
    if (!items.length) {
      list.append(el('li', 'muted', isNum(plan.start_soil_pct) ? 'Tidak ada penyiraman yang diperkirakan perlu; prediksi tanah tetap di atas ambang.' : 'Belum dapat direncanakan karena belum ada pembacaan tanah yang valid.'));
      return;
    }
    items.forEach(item => {
      const li = el('li');
      li.append(el('strong', null, clock(item.at)), el('span', null, `Siram saat prediksi tanah ${pct(item.predicted_soil_pct)}`));
      list.append(li);
    });
  }

  function renderNotes(cmp) {
    const list = byId('compare-notes');
    list.replaceChildren();
    const notes = Array.isArray(cmp.notes) ? cmp.notes.filter(Boolean) : [];
    if (!notes.length) list.append(el('li', 'muted', 'Tidak ada catatan.'));
    notes.forEach(note => list.append(el('li', null, String(note))));
  }

  function drawChart() {
    const cmp = comparisonOf(payload);
    const chart = byId('compare-chart');
    const wrap = byId('compare-chart-wrap');
    chart.replaceChildren();
    if (!cmp) return;
    const day = cmp.ai_day;
    const start = Number(day.start);
    const width = Math.max(300, Math.round(wrap.clientWidth || 640));
    lastWidth = width;
    const height = width < 520 ? 250 : 290;
    chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
    chart.setAttribute('width', String(width));
    chart.setAttribute('height', String(height));
    const plot = { left: 50, right: width - 14, top: 16, bottom: height - 74 };
    const x = ms => plot.left + (ms - start) / (24 * HOUR) * (plot.right - plot.left);
    const y = value => plot.bottom - Math.max(0, Math.min(100, value)) / 100 * (plot.bottom - plot.top);
    [0, 25, 50, 75, 100].forEach(value => {
      svg('line', { x1: plot.left, x2: plot.right, y1: y(value), y2: y(value), class: value === 0 ? 'axis-line' : 'grid-line' }, chart);
      svg('text', { x: plot.left - 8, y: y(value) + 4, 'text-anchor': 'end', class: 'tick' }, chart, `${value}%`);
    });
    const step = width < 480 ? 6 : 3;
    for (let hour = 0; hour <= 24; hour += step) {
      svg('text', { x: x(start + hour * HOUR), y: plot.bottom + 16, 'text-anchor': hour === 0 ? 'start' : hour === 24 ? 'end' : 'middle', class: 'tick' }, chart, `${String(hour).padStart(2, '0')}.00`);
    }
    if (isNum(cmp.threshold_pct)) {
      const ty = y(Number(cmp.threshold_pct));
      svg('line', { x1: plot.left, x2: plot.right, y1: ty, y2: ty, class: 'threshold-line' }, chart);
      svg('text', { x: plot.right, y: ty - 6, 'text-anchor': 'end', class: 'tick tick-strong' }, chart, `Ambang ${num.format(cmp.threshold_pct)}%`);
    }
    const series = (Array.isArray(day.forecast_vs_actual) ? day.forecast_vs_actual : [])
      .filter(point => isNum(point.at)).map(point => ({ at: Number(point.at), predicted: isNum(point.predicted_pct) ? Number(point.predicted_pct) : null, actual: isNum(point.actual_pct) ? Number(point.actual_pct) : null }))
      .sort((a, b) => a.at - b.at);
    const pathFor = key => series.map((point, index) => {
      if (point[key] === null) return '';
      const previous = series[index - 1];
      return `${previous && previous[key] !== null ? 'L' : 'M'}${x(point.at).toFixed(1)} ${y(point[key]).toFixed(1)}`;
    }).join(' ');
    const predictedPath = pathFor('predicted');
    if (predictedPath.trim()) svg('path', { d: predictedPath, class: 'line-ai' }, chart);
    const actualPath = pathFor('actual');
    if (actualPath.trim()) svg('path', { d: actualPath, class: 'line-actual' }, chart);
    series.filter(point => point.actual !== null).forEach(point => svg('circle', { cx: x(point.at), cy: y(point.actual), r: 4, class: 'dot-actual' }, chart));

    const lanes = [
      { label: 'AI', list: day.planned_waterings, key: 'predicted_soil_pct', y: plot.bottom + 38, className: 'mark-ai', name: 'Siram AI', value: 'prediksi' },
      { label: 'Aturan', list: day.rule_on_actual?.would_water, key: 'soil_pct', y: plot.bottom + 58, className: 'mark-rule', name: 'Siram aturan', value: 'tanah' }
    ];
    lanes.forEach(lane => {
      svg('text', { x: plot.left - 8, y: lane.y + 4, 'text-anchor': 'end', class: 'tick' }, chart, lane.label);
      svg('line', { x1: plot.left, x2: plot.right, y1: lane.y, y2: lane.y, class: 'lane-line' }, chart);
      (Array.isArray(lane.list) ? lane.list : []).filter(item => isNum(item.at)).forEach(item => {
        const cx = x(Number(item.at));
        const mark = lane.className === 'mark-ai'
          ? svg('circle', { cx, cy: lane.y, r: 5, class: lane.className }, chart)
          : svg('rect', { x: cx - 4.5, y: lane.y - 4.5, width: 9, height: 9, transform: `rotate(45 ${cx} ${lane.y})`, class: lane.className }, chart);
        svg('title', {}, mark, `${lane.name} ${clock(item.at)} WIB · ${lane.value} ${pct(item[lane.key])}`);
      });
    });

    // Lapisan hover: garis bantu dan keterangan nilai per jam.
    const guide = svg('line', { x1: 0, x2: 0, y1: plot.top, y2: plot.bottom, class: 'hover-line', visibility: 'hidden' }, chart);
    const tip = svg('g', { class: 'hover-tip', visibility: 'hidden' }, chart);
    const tipBox = svg('rect', { rx: 8, ry: 8, height: 44, class: 'tip-box' }, tip);
    const tipTitle = svg('text', { class: 'tip-title' }, tip, '');
    const tipBody = svg('text', { class: 'tip-body' }, tip, '');
    const hit = svg('rect', { x: plot.left, y: plot.top, width: plot.right - plot.left, height: plot.bottom - plot.top, class: 'hit-area' }, chart);
    const hide = () => { guide.setAttribute('visibility', 'hidden'); tip.setAttribute('visibility', 'hidden'); };
    const show = event => {
      if (!series.length) return;
      const box = chart.getBoundingClientRect();
      const px = (event.clientX - box.left) * (width / box.width);
      const at = start + (px - plot.left) / (plot.right - plot.left) * 24 * HOUR;
      const point = series.reduce((best, item) => Math.abs(item.at - at) < Math.abs(best.at - at) ? item : best, series[0]);
      const gx = x(point.at);
      guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); guide.setAttribute('visibility', 'visible');
      tipTitle.textContent = `${clock(point.at)} WIB`;
      tipBody.textContent = `Aktual ${pct(point.actual)} · Prediksi ${pct(point.predicted)}`;
      const tipWidth = Math.max(tipTitle.getComputedTextLength(), tipBody.getComputedTextLength()) + 20;
      const tipX = Math.max(plot.left, gx + 10 + tipWidth > plot.right ? gx - 10 - tipWidth : gx + 10);
      tipBox.setAttribute('x', tipX); tipBox.setAttribute('y', plot.top); tipBox.setAttribute('width', tipWidth);
      tipTitle.setAttribute('x', tipX + 10); tipTitle.setAttribute('y', plot.top + 18);
      tipBody.setAttribute('x', tipX + 10); tipBody.setAttribute('y', plot.top + 35);
      tip.setAttribute('visibility', 'visible');
    };
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', hide);

    const withActual = series.filter(point => point.actual !== null).length;
    chart.setAttribute('aria-label', `Kelembapan tanah ${longDate(day.date)}: ${series.length} titik prediksi per jam, ${withActual} dengan nilai aktual. AI merencanakan ${countLabel(day.planned_waterings)} siram, aturan pada data nyata ${countLabel(day.rule_on_actual?.would_water)} siram. Rincian ada di tabel per jam.`);
    byId('compare-chart-caption').textContent = `${longDate(day.date)} · titik per jam; nilai aktual adalah median pembacaan valid ±5 menit.`;
  }

  async function renderTable() {
    const details = byId('compare-rows').closest('details');
    const cmp = comparisonOf(payload);
    if (!cmp || !details.open) return;
    const key = `${payload.profile}:${payload.source}:${payload.run?.id}`;
    if (tableKey === key) return;
    tableKey = key;
    const body = byId('compare-rows');
    const fill = (rows, note) => {
      body.replaceChildren();
      rows.forEach(values => {
        const tr = el('tr');
        values.forEach((value, index) => {
          const text = value === null || value === undefined ? '—' : index === 2 ? (value === 'ai' ? 'AI' : 'Aturan') : typeof value === 'number' ? num.format(value) : String(value);
          tr.append(el(index === 0 ? 'th' : 'td', null, text));
        });
        body.append(tr);
      });
      if (note) {
        const tr = el('tr'); const td = el('td', 'empty-row', note); td.colSpan = 7; tr.append(td); body.append(tr);
      }
    };
    fill(core.comparisonRows(cmp, []), 'Memuat nilai aktual hari aturan dari telemetry…');
    try {
      const telemetry = await loadTelemetry({ profile: payload.profile, source: payload.source, hours: 72 });
      if (tableKey !== key) return;
      const rows = core.comparisonRows(cmp, telemetry.rows);
      fill(rows, core.ruleActualHours(rows) ? '' : 'Telemetry 72 jam terakhir tidak mencakup hari aturan; nilai aktual hari aturan kosong.');
    } catch (error) {
      if (tableKey !== key) return;
      fill(core.comparisonRows(cmp, []), `${error.message} Nilai aktual hari aturan dikosongkan.`);
      tableKey = '';
    }
  }

  function render(data) {
    payload = data;
    tableKey = '';
    const cmp = comparisonOf(data);
    const raw = data?.run?.report?.comparison;
    byId('compare-body').hidden = !cmp;
    byId('compare-empty').hidden = Boolean(cmp);
    if (!cmp) {
      byId('compare-intro').textContent = INTRO;
      byId('compare-empty-reason').textContent = !data
        ? 'Menunggu hasil worker untuk profil dan sumber ini.'
        : raw?.error ? String(raw.error) : 'Worker belum menulis perbandingan untuk profil dan sumber ini.';
      return;
    }
    const source = cmp.threshold_source === 'ai_settings' ? 'dari pengaturan kalibrasi' : 'nilai bawaan';
    byId('compare-intro').textContent = `${INTRO} Aturan: siram bila ${isNum(cmp.confirm_readings) ? cmp.confirm_readings : 3} pembacaan valid terakhir ≤ ${pct(cmp.threshold_pct)} (${source}), jeda ${isNum(cmp.cooldown_minutes) ? cmp.cooldown_minutes : 30} menit, maksimal ${isNum(cmp.max_waterings_per_day) ? cmp.max_waterings_per_day : 8} kali per hari.${data.source === 'simulation' ? ' Sumber: data simulasi.' : ''}`;
    renderVerdict(cmp);
    renderCards(cmp);
    renderTomorrow(cmp);
    renderNotes(cmp);
    drawChart();
    renderTable();
  }

  window.addEventListener('smartpot:ai-payload', ({ detail }) => render(detail));
  byId('compare-rows').closest('details').addEventListener('toggle', renderTable);
  if ('ResizeObserver' in window) {
    let frame = 0;
    new ResizeObserver(entries => {
      const width = Math.round(entries[0].contentRect.width);
      if (!comparisonOf(payload) || Math.abs(width - lastWidth) < 8) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(drawChart);
    }).observe(byId('compare-chart-wrap'));
  }
  window.addEventListener('smartpot:collect-report', event => { event.detail.comparison = comparisonOf(payload); });
  render(null);
})();
