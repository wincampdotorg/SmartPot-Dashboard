(() => {
  'use strict';
  if (!window.SmartPotAuth?.authenticated) return;

  const WIB = 'Asia/Jakarta';
  const METRICS = {
    soil_moisture: { label: 'Kelembapan tanah', unit: '%', color: '#4d966d', min: 0, max: 100, digits: 1 },
    temperature: { label: 'Suhu', unit: '°C', color: '#d58845', min: 16, max: 36, digits: 1 },
    humidity: { label: 'Kelembapan udara', unit: '%', color: '#6486ca', min: 35, max: 100, digits: 1 },
    water_level: { label: 'Level air', unit: '%', color: '#5296c6', min: 0, max: 100, digits: 1 }
  };
  const els = Object.fromEntries([
    'source-badge', 'source-label', 'refresh-button',
    'updated-label', 'metric-soil', 'metric-temp', 'metric-humidity', 'metric-water', 'metric-battery',
    'soil-note', 'water-note', 'spark-soil', 'spark-temp', 'spark-humidity', 'spark-water', 'spark-battery',
    'chart-title', 'chart-current', 'chart-period', 'trend-chart', 'axis-start', 'axis-quarter1', 'axis-mid', 'axis-quarter3', 'axis-end', 'play-button',
    'timeline', 'timeline-time', 'simulation-label', 'insight-title', 'insight-description', 'device-state',
    'device-description', 'notice', 'connection-note', 'watering-chart', 'watering-total',
    'watering-history-source', 'watering-history-source-label', 'watering-chart-summary'
  ].map((id) => [id, document.getElementById(id)]));

  let records = [];
  let historyPage = 0;
  let loading = false;
  let requestId = 0;
  let requestAbort = null;
  let lastError = '';
  const historySource = document.getElementById('history-source');
  const historyHours = document.getElementById('history-hours');
  // Isian simulasi (pengisi celah saat Wi-Fi alat mati) bawaan tidak ditampilkan; dicentang = ikut ditampilkan dan diekspor.
  const historyFill = document.getElementById('history-fill');
  const includeFill = () => !isSimulation() && historyFill.checked;
  const API_URL = 'https://wincamp.web.id/smartpot/api/telemetry';
  const isSimulation = () => historySource.value === 'simulation';
  let selectedMetric = 'soil_moisture';
  let cursorIndex = 0;
  let playFrame = 0;
  let playStartedAt = 0;
  let playStartIndex = 0;
  let wateringEvents = [];
  const WATERING_HISTORY_KEY = 'smartpot-actuator-history-v1';
  const wateringStorageKey = () => `${WATERING_HISTORY_KEY}:${document.getElementById('broker-profile').value || 'web-panel'}`;
  const WATERING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;
  const numberFmt = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dateFmt = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, day: 'numeric', month: 'short', year: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dateTimeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  const svgEl = (name, attrs = {}) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    return el;
  };

  function normalizeRows(rows) {
    if (!Array.isArray(rows)) throw new Error('Format riwayat database tidak sesuai.');
    return rows.map((row) => ({
      ...row,
      ts: typeof row.ts === 'number' ? row.ts : Date.parse(row.ts),
      temperature: row.temperature == null ? null : Number(row.temperature),
      humidity: row.humidity == null ? null : Number(row.humidity),
      soil_moisture: row.soil_moisture == null ? null : Number(row.soil_moisture),
      water_level: row.water_level == null ? null : Number(row.water_level),
      battery: row.battery == null ? null : Number(row.battery)
    })).filter((row) => Number.isFinite(row.ts) && ['temperature', 'humidity', 'soil_moisture', 'water_level', 'battery'].some((key) => Number.isFinite(row[key])))
      .sort((a, b) => a.ts - b.ts);
  }

  async function loadData(background = false) {
    const id = ++requestId;
    if (requestAbort) requestAbort.abort();
    requestAbort = new AbortController();
    const timeout = setTimeout(() => requestAbort?.abort(), 12000);
    loading = true;
    const wasLatest = cursorIndex >= records.length - 1;
    const oldTime = records[cursorIndex]?.ts;
    const url = new URL(API_URL);
    url.searchParams.set('source', historySource.value);
    url.searchParams.set('hours', historyHours.value);
    url.searchParams.set('profile', document.getElementById('broker-profile').value || 'web-panel');
    if (!isSimulation()) url.searchParams.set('isian', includeFill() ? '1' : '0');
    document.getElementById('history-fill-wrap').hidden = isSimulation();
    document.getElementById('history-json').href = url.href;
    els['refresh-button'].classList.add('is-loading');
    els['refresh-button'].disabled = true;
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: requestAbort.signal, ...(background ? { priority: 'low' } : {}) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Database gagal dibaca (${response.status}).`);
      if (payload.database !== 'Smartport') throw new Error('Sumber database tidak sesuai.');
      const loaded = normalizeRows(payload.data);
      if (id !== requestId) return;
      records = loaded;
      lastError = '';
      if (!background) historyPage = 0;
      cursorIndex = background && !wasLatest && oldTime ? Math.max(0, records.findIndex(row => row.ts >= oldTime)) : records.length - 1;
      updateConnectionState();
      if (records.length) render(); else renderEmpty();
      renderSensorHistory();
      document.getElementById('database-proof').textContent = `MySQL OVH · Smartport.telemetry · ${payload.count.toLocaleString('id-ID')} catatan · ${isSimulation() ? 'SIMULASI' : includeFill() ? 'DATA ALAT + ISIAN SIMULASI' : 'DATA ALAT'} · diperbarui ${timeFmt.format(new Date(payload.server_time))} WIB${payload.truncated ? ' · menampilkan 5.000 catatan terbaru' : ''}`;
    } catch (error) {
      if (id !== requestId) return;
      lastError = 'Database belum dapat dimuat. Tekan Muat ulang untuk mencoba kembali.';
      updateConnectionState();
      if (!records.length) renderEmpty();
      renderSensorHistory();
      document.getElementById('database-proof').textContent = lastError;
    } finally {
      clearTimeout(timeout);
      if (id === requestId) {
        loading = false;
        els['refresh-button'].classList.remove('is-loading');
        els['refresh-button'].disabled = false;
      }
    }
  }

  function updateConnectionState() {
    els['source-badge'].classList.remove('is-live', 'is-error', 'is-preview');
    els['source-badge'].classList.add(lastError ? 'is-error' : isSimulation() ? 'is-preview' : 'is-live');
    els['source-label'].textContent = lastError ? 'Gagal memuat database' : isSimulation() ? 'Simulasi · MySQL OVH' : 'Riwayat alat · MySQL OVH';
    els['connection-note'].hidden = false;
    els['connection-note'].textContent = lastError || (isSimulation()
      ? 'SIMULASI: data tiga hari disimpan di MySQL OVH, interval satu menit. Pilih Data alat untuk melihat pembacaan ESP32.'
      : 'Data asli dari MQTT disimpan di MySQL OVH. Riwayat diperbarui setiap 30 detik; data simulasi dipisahkan.'
        + (includeFill() ? ' Isian simulasi pengisi celah Wi-Fi ikut ditampilkan dengan label sumber_data isian_simulasi_tdr2.' : ' Isian simulasi pengisi celah Wi-Fi tidak ditampilkan.'));
  }

  function renderEmpty() {
    ['metric-soil','metric-temp','metric-humidity','metric-water','metric-battery','chart-current'].forEach(key => { els[key].textContent = '—'; });
    ['spark-soil','spark-temp','spark-humidity','spark-water','spark-battery','trend-chart'].forEach(key => els[key].replaceChildren());
    els['updated-label'].textContent = lastError ? 'Data tidak tersedia' : 'Belum ada data dalam periode ini';
    els['device-state'].textContent = 'Menunggu data alat';
    els['device-description'].textContent = 'Belum ada telemetry pada periode yang dipilih.';
    els['chart-period'].textContent = `${Number(historyHours.value)/24} hari terakhir · belum ada data`;
    els['insight-title'].textContent = 'Menunggu data';
    els['insight-description'].textContent = 'Analisis tersedia setelah telemetry masuk.';
    ['axis-start','axis-quarter1','axis-mid','axis-quarter3','axis-end','timeline-time'].forEach(key => { els[key].textContent = '—'; });
    els['timeline'].disabled = true;
    els['play-button'].disabled = true;
  }

  function renderSensorHistory() {
    const totalPages = Math.max(1, Math.ceil(records.length/10));
    historyPage = Math.min(historyPage, totalPages-1);
    const tbody = document.getElementById('sensor-history-rows');
    tbody.replaceChildren();
    const end = records.length-historyPage*10;
    records.slice(Math.max(0,end-10),end).reverse().forEach(row => {
      const tr = document.createElement('tr');
      [dateTimeFmt.format(new Date(row.ts)), ...['temperature','humidity','soil_moisture','water_level','battery'].map(key => fmt(row[key]))].forEach(value => {
        const cell = document.createElement('td'); cell.textContent = value; tr.append(cell);
      });
      tbody.append(tr);
    });
    document.getElementById('sensor-history-count').textContent = `${records.length.toLocaleString('id-ID')} catatan · ${isSimulation() ? 'simulasi' : 'data alat'} · 10 data per halaman`;
    document.getElementById('history-page').textContent = `${historyPage+1} / ${totalPages}`;
    document.getElementById('history-prev').disabled = historyPage === 0;
    document.getElementById('history-next').disabled = historyPage >= totalPages-1;
  }

  function atCursor() { return records[Math.max(0, Math.min(records.length - 1, cursorIndex))]; }
  function fmt(value) { return Number.isFinite(value) ? numberFmt.format(value) : '—'; }
  function wibTime(ts) { return timeFmt.format(new Date(ts)); }
  function addSvgText(parent, x, y, text, className, anchor = 'start') {
    const node = svgEl('text', { x, y, class: className, 'text-anchor': anchor });
    node.textContent = text;
    parent.append(node);
    return node;
  }

  function setWateringSource(mode, label) {
    els['watering-history-source'].classList.remove('is-live', 'is-error', 'is-preview');
    els['watering-history-source'].classList.add(mode);
    els['watering-history-source-label'].textContent = label;
  }

  function normalizeWateringEvents(events) {
    const cutoff = Date.now() - WATERING_WINDOW_MS;
    const byId = new Map();
    events.forEach((event) => {
      const timestamp = typeof event?.timestamp === 'number' ? event.timestamp : Date.parse(event?.timestamp);
      if (!event || !Number.isFinite(timestamp) || timestamp < cutoff || timestamp > Date.now() + 5 * 60 * 1000) return;
      const normalized = { ...event, timestamp, waterLevel: (event.waterLevel ?? event.water_level) == null ? null : Number(event.waterLevel ?? event.water_level) };
      const key = String(event.id ?? `${timestamp}:${event.source || ''}:${normalized.waterLevel}:${event.outcome || ''}`);
      byId.set(key, normalized);
    });
    return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, 500);
  }

  function persistWateringEvents() {
    try {
      const saved = JSON.parse(localStorage.getItem(wateringStorageKey()) || '{}');
      localStorage.setItem(wateringStorageKey(), JSON.stringify({ ...saved, watering: wateringEvents }));
    } catch (_) { /* Keep the live chart usable when browser storage is unavailable. */ }
  }

  function renderWateringChart() {
    const svg = els['watering-chart'];
    svg.replaceChildren();
    const currentHour = Math.floor(Date.now() / HOUR_MS);
    const firstHour = currentHour - 23;
    const buckets = Array.from({ length: 24 }, () => ({ success: 0, low: 0, unknown: 0 }));
    const events = wateringEvents.filter((event) => {
      const hour = Math.floor(event.timestamp / HOUR_MS);
      return hour >= firstHour && hour <= currentHour;
    });

    events.forEach((event) => {
      const hour = Math.floor(event.timestamp / HOUR_MS);
      const bucket = buckets[hour - firstHour];
      if (event.waterLevel == null) bucket.unknown += 1;
      else if (Number(event.waterLevel) <= 20) bucket.low += 1;
      else bucket.success += 1;
    });

    const successCount = events.filter((event) => Number(event.waterLevel) > 20).length;
    const unknownCount=events.filter(event=>event.waterLevel==null).length;
    const lowCount = events.length - successCount - unknownCount;
    els['watering-total'].textContent = `${events.length} ${events.length === 1 ? 'tindakan' : 'tindakan'}`;
    els['watering-chart-summary'].textContent = wateringEvents.length
      ? `${successCount} sukses menyiram · ${lowCount} air rendah (≤20%) · ${unknownCount} tanpa level air · ${wateringEvents.length} catatan dalam 3 hari.`
      : 'Belum ada catatan penyiraman dari perangkat dalam 3 hari terakhir.';

    if (!events.length) {
      svg.setAttribute('aria-label', 'Belum ada penyiraman dalam 24 jam terakhir.');
      addSvgText(svg, 500, 118, wateringEvents.length ? 'Tidak ada penyiraman dalam 24 jam terakhir' : 'Menunggu riwayat penyiraman dari perangkat', 'chart-y-label', 'middle');
      return;
    }

    const plot = { left: 52, right: 986, top: 18, bottom: 185 };
    const maxBucket = Math.max(...buckets.map((bucket) => bucket.success + bucket.low + bucket.unknown), 1);
    const scaleMax = Math.max(2, Math.ceil(maxBucket / 2) * 2);
    const plotHeight = plot.bottom - plot.top;
    const slotWidth = (plot.right - plot.left) / 24;
    const barWidth = Math.min(21, slotWidth * 0.56);

    for (let step = 0; step <= 2; step += 1) {
      const value = scaleMax - (scaleMax * step / 2);
      const y = plot.top + (plotHeight * step / 2);
      svg.append(svgEl('line', { x1: plot.left, y1: y, x2: plot.right, y2: y, class: 'grid-line' }));
      addSvgText(svg, plot.left - 10, y + 4, String(value), 'chart-y-label', 'end');
    }

    buckets.forEach((bucket, index) => {
      const x = plot.left + (index * slotWidth) + ((slotWidth - barWidth) / 2);
      const successHeight = (bucket.success / scaleMax) * plotHeight;
      const lowHeight = (bucket.low / scaleMax) * plotHeight;
      const unknownHeight=(bucket.unknown/scaleMax)*plotHeight;
      if(unknownHeight>0)svg.append(svgEl('rect',{x,y:plot.bottom-successHeight-lowHeight-unknownHeight,width:barWidth,height:unknownHeight,rx:3,fill:'#92999b'}));
      const total = bucket.success + bucket.low + bucket.unknown;
      if (successHeight > 0) svg.append(svgEl('rect', { x, y: plot.bottom - successHeight, width: barWidth, height: successHeight, rx: 3, fill: '#4d966d' }));
      if (lowHeight > 0) svg.append(svgEl('rect', { x, y: plot.bottom - successHeight - lowHeight, width: barWidth, height: lowHeight, rx: 3, fill: '#d45e5e' }));
      if (total > 0) {
        const bar = svgEl('g', { 'aria-label': `${wibTime((firstHour + index) * HOUR_MS)} WIB · ${bucket.success} sukses · ${bucket.low} air rendah · ${bucket.unknown} tanpa level air` });
        const title = svgEl('title');
        title.textContent = `${wibTime((firstHour + index) * HOUR_MS)} WIB · ${bucket.success} sukses · ${bucket.low} air rendah · ${bucket.unknown} tanpa level air`;
        bar.append(title);
        svg.append(bar);
      }
      if (index % 4 === 0) addSvgText(svg, x + (barWidth / 2), 212, wibTime((firstHour + index) * HOUR_MS), 'chart-y-label', 'middle');
    });

    svg.setAttribute('aria-label', `Grafik penyiraman per jam dalam 24 jam terakhir: ${successCount} sukses dan ${lowCount} air rendah.`);
  }

  function restoreWateringHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(wateringStorageKey()) || '{}');
      wateringEvents = normalizeWateringEvents(Array.isArray(saved.watering) ? saved.watering : []);
    } catch (_) { wateringEvents = []; }
    renderWateringChart();
    setWateringSource(wateringEvents.length ? 'is-preview' : 'is-preview', wateringEvents.length ? 'Cache lokal · menyambungkan' : 'Menunggu riwayat MQTT');
  }

  function acceptWateringSnapshot(raw) {
    let payload;
    try { payload = JSON.parse(raw); } catch (_) { return; }
    if (!payload || payload.type !== 'snapshot' || !Array.isArray(payload.events)) return;
    wateringEvents = normalizeWateringEvents([...wateringEvents, ...payload.events]);
    persistWateringEvents();
    renderWateringChart();
    setWateringSource('is-live', 'Riwayat MQTT langsung');
  }

  function acceptLiveTelemetry(detail) {
    if (isSimulation() || detail.topic !== 'smartpot/telemetry') return;
    let payload;
    try { payload = JSON.parse(detail.message); } catch (_) { return; }
    if (!payload || typeof payload !== 'object') return;
    const numeric = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    const now = Date.now();
    const row = { ts: now, device_id: detail.profile === 'tdr2' ? 'smartpot-tdr2' : 'smartpot-01',
      temperature: numeric(payload.temperature), humidity: numeric(payload.humidity),
      soil_moisture: numeric(payload.soil_moisture ?? payload.moisture ?? payload.soil),
      water_level: numeric(payload.water_level ?? payload.waterLevel ?? payload.water), battery: numeric(payload.battery ?? payload.batt) };
    if (!['temperature','humidity','soil_moisture','water_level','battery'].some(key => row[key] !== null)) return;
    const latest = !records.length || cursorIndex >= records.length - 1;
    const minute = Math.floor(now/60000);
    if (records.length && Math.floor(records[records.length-1].ts/60000) === minute) records[records.length-1] = row;
    else records.push(row);
    records = records.filter(item => item.ts >= now - Number(historyHours.value)*3600000).slice(-5000);
    if (!playFrame && latest) cursorIndex = records.length-1;
    else cursorIndex = Math.min(Math.max(0,cursorIndex),records.length-1);
    lastError = ''; updateConnectionState(); render(); renderSensorHistory();
    document.getElementById('database-proof').textContent = `MQTT langsung · ${detail.profile === 'tdr2' ? 'TDR2' : 'Web Panel'} · sensor diperbarui ${timeFmt.format(new Date(now))} WIB · riwayat disimpan ke MySQL OVH`;
  }

  function connectWateringHistory() {
    let databaseHistory = false;
    window.addEventListener('smartpot:history-db', ({detail}) => {
      databaseHistory=true;
      wateringEvents=normalizeWateringEvents(detail.watering);
      persistWateringEvents(); renderWateringChart();
      setWateringSource('is-live','Riwayat database Smartport');
    });
    window.addEventListener('smartpot:mqtt-message', ({ detail }) => {
      acceptLiveTelemetry(detail);
      if (!databaseHistory && detail.topic === 'smartpot/history/watering') acceptWateringSnapshot(detail.message);
    });
    window.addEventListener('smartpot:mqtt-profile', ({ detail }) => {
      databaseHistory=false;
      wateringEvents = []; restoreWateringHistory();
      if (!detail.initial || detail.profile === 'tdr2') historySource.value = 'device';
      const option = historySource.querySelector('option[value="device"]');
      option.textContent = detail.profile === 'tdr2' ? 'Data alat · TDR2' : 'Data alat · SmartPot 01';
      stopPlayback(); records = []; cursorIndex = 0; historyPage = 0; lastError = '';
      renderEmpty(); renderSensorHistory(); loadData();
    });
    window.addEventListener('smartpot:mqtt-state', ({ detail }) => {
      if(databaseHistory)return;
      setWateringSource(detail.mode === 'live' ? 'is-live' : detail.mode === 'error' ? 'is-error' : 'is-preview', detail.label);
    });
  }

  function makeLinePath(values, xFor, yFor) {
    return values.map((point, index) => Number.isFinite(point) ? `${index && Number.isFinite(values[index-1]) ? 'L' : 'M'}${xFor(index).toFixed(2)},${yFor(point).toFixed(2)}` : '').join(' ');
  }

  function drawSparkline(svg, rows, field, color) {
    svg.replaceChildren();
    const values = rows.slice(-36).map((row) => row[field]);
    if (values.length < 2) return;
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return;
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const range = Math.max(max - min, 1);
    const xFor = (index) => 2 + (index * 108 / (values.length - 1));
    const yFor = (value) => 27 - ((value - min) / range) * 22;
    svg.append(svgEl('path', { d: makeLinePath(values, xFor, yFor), fill: 'none', stroke: color, 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  function drawChart() {
    const svg = els['trend-chart'];
    const metric = METRICS[selectedMetric];
    svg.replaceChildren();
    svg.setAttribute('aria-label', `${metric.label} selama ${historyHours.value} jam, waktu ${wibTime(atCursor().ts)} WIB menunjukkan ${fmt(atCursor()[selectedMetric])} ${metric.unit}`);
    const defs = svgEl('defs');
    const gradient = svgEl('linearGradient', { id: 'chart-fill', x1: '0', x2: '0', y1: '0', y2: '1' });
    gradient.append(svgEl('stop', { offset: '0%', 'stop-color': metric.color, 'stop-opacity': '.25' }));
    gradient.append(svgEl('stop', { offset: '100%', 'stop-color': metric.color, 'stop-opacity': '0' }));
    defs.append(gradient);
    svg.append(defs);

    const plot = { left: 42, right: 991, top: 12, bottom: 234 };
    const min = metric.min;
    const max = metric.max;
    const xFor = (index) => plot.left + (plot.right-plot.left)*(records[index].ts-records[0].ts)/Math.max(1,records[records.length-1].ts-records[0].ts);
    const yFor = (value) => plot.bottom - ((value - min) / (max - min)) * (plot.bottom - plot.top);
    for (let step = 0; step <= 4; step += 1) {
      const y = plot.top + ((plot.bottom - plot.top) * step / 4);
      const value = max - ((max - min) * step / 4);
      svg.append(svgEl('line', { x1: plot.left, y1: y, x2: plot.right, y2: y, class: 'grid-line' }));
      addSvgText(svg, plot.left - 9, y + 4, `${Math.round(value)}`, 'chart-y-label', 'end');
    }
    const values = records.map((row) => row[selectedMetric]);
    const line = makeLinePath(values, xFor, yFor);
    const area = `${line} L${xFor(values.length - 1)},${plot.bottom} L${xFor(0)},${plot.bottom} Z`;
    if (values.every(Number.isFinite)) svg.append(svgEl('path', { d: area, fill: 'url(#chart-fill)', class: 'chart-area' }));
    svg.append(svgEl('path', { d: line, class: 'chart-line', stroke: metric.color }));

    const x = xFor(cursorIndex);
    const y = yFor(atCursor()[selectedMetric]);
    svg.append(svgEl('line', { x1: x, y1: plot.top, x2: x, y2: plot.bottom, class: 'chart-x-guide' }));
    if (Number.isFinite(atCursor()[selectedMetric])) svg.append(svgEl('circle', { cx: x, cy: y, r: 5.5, class: 'chart-cursor', stroke: metric.color }));
    els['chart-title'].firstChild.textContent = metric.label;
    els['chart-current'].textContent = `${fmt(atCursor()[selectedMetric])} ${metric.unit}`;
    els['chart-period'].textContent = `${dateFmt.format(new Date(records[0].ts))} – ${dateFmt.format(new Date(records[records.length - 1].ts))} · WIB`;
    els['axis-start'].textContent = wibTime(records[0].ts);
    els['axis-end'].textContent = wibTime(records[records.length - 1].ts);
    els['axis-quarter1'].textContent = wibTime(records[Math.floor((records.length - 1) / 4)].ts);
    els['axis-mid'].textContent = wibTime(records[Math.floor((records.length - 1) / 2)].ts);
    els['axis-quarter3'].textContent = wibTime(records[Math.floor(((records.length - 1) * 3) / 4)].ts);
  }

  function renderMetricNotes(row) {
    els['soil-note'].textContent = row.soil_moisture < 35 ? 'Mulai mengering' : row.soil_moisture > 70 ? 'Cukup basah' : 'Dalam rentang';
    els['water-note'].textContent = row.water_level < 25 ? 'Perlu diisi' : 'Reservoir';
  }

  function renderInsights() {
    let irrigations = 0;
    let largestDrop = 0;
    for (let i = 1; i < records.length; i += 1) {
      const rise = records[i].soil_moisture - records[i - 1].soil_moisture;
      if (Number.isFinite(records[i].soil_moisture) && Number.isFinite(records[i-1].soil_moisture) && rise >= 4) { irrigations += 1; largestDrop = Math.max(largestDrop, rise); }
    }
    els['insight-title'].textContent = irrigations ? `${irrigations} perubahan kelembapan terdeteksi` : 'Pola penyiraman';
    els['insight-description'].textContent = irrigations
      ? `Lonjakan terbesar ${fmt(largestDrop)}% pada kelembapan tanah dalam periode ini.`
      : 'Belum terlihat lonjakan kelembapan tanah yang menandakan penyiraman.';
    els['device-state'].textContent = isSimulation() ? 'Simulasi · MySQL OVH' : Date.now()-records[records.length-1].ts > 300000 ? 'Data alat belum diperbarui' : 'Telemetry alat terbaru';
    els['device-description'].textContent = `${records.length.toLocaleString('id-ID')} catatan database · data terakhir ${dateTimeFmt.format(new Date(records[records.length - 1].ts))} WIB.`;
  }

  function render() {
    if (!records.length) return;
    const row = atCursor();
    els['metric-soil'].textContent = fmt(row.soil_moisture);
    els['metric-temp'].textContent = fmt(row.temperature);
    els['metric-humidity'].textContent = fmt(row.humidity);
    els['metric-water'].textContent = fmt(row.water_level);
    els['metric-battery'].textContent = fmt(row.battery);
    els['updated-label'].textContent = `${isSimulation() ? 'Simulasi' : 'Sensor'} · ${dateTimeFmt.format(new Date(row.ts))} WIB`;
    els['timeline'].disabled = false;
    els['play-button'].disabled = false;
    els['timeline'].max = String(records.length - 1);
    els['timeline'].value = String(cursorIndex);
    els['timeline-time'].textContent = wibTime(row.ts);
    els['timeline'].setAttribute('aria-valuetext', `${dateFmt.format(new Date(row.ts))} ${wibTime(row.ts)} WIB`);
    renderMetricNotes(row);
    renderInsights();
    drawSparkline(els['spark-soil'], records.slice(0, cursorIndex + 1), 'soil_moisture', '#4d966d');
    drawSparkline(els['spark-temp'], records.slice(0, cursorIndex + 1), 'temperature', '#d58845');
    drawSparkline(els['spark-humidity'], records.slice(0, cursorIndex + 1), 'humidity', '#6486ca');
    drawSparkline(els['spark-water'], records.slice(0, cursorIndex + 1), 'water_level', '#5296c6');
    drawSparkline(els['spark-battery'], records.slice(0, cursorIndex + 1), 'battery', '#8871d6');
    drawChart();
  }

  function stopPlayback() {
    if (playFrame) cancelAnimationFrame(playFrame);
    playFrame = 0;
    els['play-button'].classList.remove('is-playing');
    els['play-button'].setAttribute('aria-label', 'Putar riwayat dalam 1 menit');
    els['play-button'].title = 'Putar riwayat dalam 1 menit';
    els['simulation-label'].textContent = 'Putar riwayat dalam 1 menit';
  }

  function animatePlayback(now) {
    const elapsed = now - playStartedAt;
    const next = Math.min(records.length - 1, Math.floor(playStartIndex + (elapsed / 60000) * (records.length - 1)));
    if (next !== cursorIndex) { cursorIndex = next; render(); }
    if (next >= records.length - 1) { stopPlayback(); return; }
    playFrame = requestAnimationFrame(animatePlayback);
  }

  els['refresh-button'].addEventListener('click', () => { stopPlayback(); loadData(); });
  [historySource, historyHours, historyFill].forEach(select => select.addEventListener('change', () => {
    stopPlayback(); records = []; cursorIndex = 0; historyPage = 0; lastError = ''; renderEmpty(); renderSensorHistory(); loadData();
  }));
  document.getElementById('history-prev').addEventListener('click', () => { historyPage--; renderSensorHistory(); });
  document.getElementById('history-next').addEventListener('click', () => { historyPage++; renderSensorHistory(); });
  setInterval(() => { if (!document.hidden && !playFrame && !loading) loadData(true); }, 30000);
  els['timeline'].addEventListener('input', () => {
    stopPlayback();
    cursorIndex = Number(els['timeline'].value);
    render();
  });
  els['play-button'].addEventListener('click', () => {
    if (!records.length) return;
    if (playFrame) { stopPlayback(); return; }
    if (cursorIndex >= records.length - 1) cursorIndex = 0;
    playStartIndex = cursorIndex;
    playStartedAt = performance.now();
    els['play-button'].classList.add('is-playing');
    els['play-button'].setAttribute('aria-label', 'Jeda simulasi');
    els['play-button'].title = 'Jeda simulasi';
    els['simulation-label'].textContent = 'Simulasi sedang berjalan';
    playFrame = requestAnimationFrame(animatePlayback);
    render();
  });
  document.querySelectorAll('.chart-tab').forEach((button) => {
    button.addEventListener('click', () => {
      selectedMetric = button.dataset.metric;
      document.querySelectorAll('.chart-tab').forEach((tab) => {
        const selected = tab === button;
        tab.classList.toggle('is-selected', selected);
        tab.setAttribute('aria-pressed', String(selected));
      });
      if (records.length) drawChart();
    });
  });

  window.addEventListener('smartpot:collect-report', event => {
    event.detail.sensors = { records: records.map(row => ({...row})), hours: Number(historyHours.value), simulation: isSimulation(), fill: includeFill(), metricLabel: METRICS[selectedMetric].label, error: lastError };
  });

  document.querySelector('#sensor .eyebrow').firstChild.textContent = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const localHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: WIB, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  document.getElementById('welcome-title').firstChild.textContent = `${localHour < 11 ? 'Selamat pagi' : localHour < 15 ? 'Selamat siang' : localHour < 18 ? 'Selamat sore' : 'Selamat malam'} `;
  restoreWateringHistory();
  connectWateringHistory();
  loadData();
})();
