(() => {
  'use strict';

  const WIB = 'Asia/Jakarta';
  const METRICS = {
    soil_moisture: { label: 'Kelembapan tanah', unit: '%', color: '#4d966d', min: 0, max: 100, digits: 1 },
    temperature: { label: 'Suhu', unit: '°C', color: '#d58845', min: 16, max: 36, digits: 1 },
    humidity: { label: 'Kelembapan udara', unit: '%', color: '#6486ca', min: 35, max: 100, digits: 1 },
    water_level: { label: 'Level air', unit: '%', color: '#5296c6', min: 0, max: 100, digits: 1 }
  };
  const els = Object.fromEntries([
    'source-badge', 'source-label', 'refresh-button', 'health-state', 'health-title', 'health-description',
    'updated-label', 'metric-soil', 'metric-temp', 'metric-humidity', 'metric-water', 'metric-battery',
    'soil-note', 'water-note', 'spark-soil', 'spark-temp', 'spark-humidity', 'spark-water', 'spark-battery',
    'chart-title', 'chart-current', 'chart-period', 'trend-chart', 'axis-start', 'axis-quarter1', 'axis-mid', 'axis-quarter3', 'axis-end', 'play-button',
    'timeline', 'timeline-time', 'simulation-label', 'insight-title', 'insight-description', 'device-state',
    'device-description', 'notice', 'connection-note'
  ].map((id) => [id, document.getElementById(id)]));

  let records = [];
  let source = 'snapshot';
  let selectedMetric = 'soil_moisture';
  let cursorIndex = 0;
  let playFrame = 0;
  let playStartedAt = 0;
  let playStartIndex = 0;
  const numberFmt = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dateFmt = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, day: 'numeric', month: 'short', year: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dateTimeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  const svgEl = (name, attrs = {}) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    return el;
  };

  function seededNoiseFactory(seed) {
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function makePreviewData() {
    const random = seededNoiseFactory(310726);
    const end = Math.floor(Date.now() / 60000) * 60000;
    const start = end - (1439 * 60000);
    let tempNoise = 0;
    let humidityNoise = 0;
    let soil = 56;
    let water = 95;
    let battery = 96;
    const data = [];
    for (let i = 0; i < 1440; i += 1) {
      const hour = new Date(start + (i * 60000)).getUTCHours() + 7;
      const normalizedHour = hour % 24;
      const ts = start + (i * 60000);
      tempNoise = (0.72 * tempNoise) + ((random() - 0.5) * 0.72);
      humidityNoise = (0.66 * humidityNoise) + ((random() - 0.5) * 2.4);
      const temperature = 28 + (3.7 * Math.sin((normalizedHour - 8) * Math.PI / 12)) + tempNoise;
      const humidity = 78 - (1.25 * (temperature - 24)) + humidityNoise;
      if (i === 360 || i === 930) soil += 13;
      soil -= 0.0065 + (normalizedHour > 9 && normalizedHour < 17 ? 0.006 : 0);
      soil += (random() - 0.5) * 0.55;
      soil = Math.max(28, Math.min(74, soil));
      if (i === 360 || i === 930) water -= 2.7;
      water = Math.max(48, water - 0.0015 - (random() * 0.002));
      battery = Math.max(79, battery - 0.007 - (random() * 0.002));
      data.push({
        ts,
        device_id: 'smartpot-01',
        temperature: Number(temperature.toFixed(1)),
        humidity: Number(Math.max(48, Math.min(96, humidity)).toFixed(1)),
        soil_moisture: Number(soil.toFixed(1)),
        water_level: Number((water + ((random() - 0.5) * 0.28)).toFixed(1)),
        battery: Number((battery + ((random() - 0.5) * 0.08)).toFixed(1))
      });
    }
    return data;
  }

  function normalizeRows(rows) {
    if (!Array.isArray(rows)) throw new Error('Format data dari EMQX tidak sesuai.');
    return rows.map((row) => ({
      ...row,
      ts: typeof row.ts === 'number' ? row.ts : Date.parse(row.ts),
      temperature: Number(row.temperature),
      humidity: Number(row.humidity),
      soil_moisture: Number(row.soil_moisture),
      water_level: Number(row.water_level),
      battery: Number(row.battery)
    })).filter((row) => Number.isFinite(row.ts) && ['temperature', 'humidity', 'soil_moisture', 'water_level', 'battery'].every((key) => Number.isFinite(row[key])))
      .sort((a, b) => a.ts - b.ts);
  }

  async function loadData() {
    els['refresh-button'].classList.add('is-loading');
    els['refresh-button'].disabled = true;
    try {
      const response = await fetch('data.json', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(`Snapshot gagal dibaca (${response.status}).`);
      const loaded = normalizeRows(payload.data);
      if (!loaded.length) throw new Error('Snapshot belum berisi data.');
      records = loaded;
      source = 'snapshot';
      cursorIndex = records.length - 1;
      updateConnectionState();
      render();
    } catch (error) {
      records = makePreviewData();
      source = 'preview';
      cursorIndex = records.length - 1;
      updateConnectionState();
      render();
    } finally {
      els['refresh-button'].classList.remove('is-loading');
      els['refresh-button'].disabled = false;
    }
  }

  function updateConnectionState() {
    els['source-badge'].classList.remove('is-live', 'is-error');
    els['source-badge'].classList.add('is-preview');
    els['source-label'].textContent = source === 'snapshot' ? 'Snapshot simulasi' : 'Pratinjau simulasi';
    els['connection-note'].hidden = false;
    els['connection-note'].textContent = source === 'snapshot'
      ? 'Data pada situs publik ini adalah snapshot simulasi 24 jam, bukan pembacaan langsung dari EMQX atau perangkat.'
      : 'File snapshot tidak tersedia; grafik memakai pratinjau simulasi lokal.';
  }

  function atCursor() { return records[Math.max(0, Math.min(records.length - 1, cursorIndex))]; }
  function fmt(value) { return numberFmt.format(value); }
  function wibTime(ts) { return timeFmt.format(new Date(ts)); }
  function addSvgText(parent, x, y, text, className, anchor = 'start') {
    const node = svgEl('text', { x, y, class: className, 'text-anchor': anchor });
    node.textContent = text;
    parent.append(node);
    return node;
  }

  function makeLinePath(values, xFor, yFor) {
    return values.map((point, index) => `${index ? 'L' : 'M'}${xFor(index).toFixed(2)},${yFor(point).toFixed(2)}`).join(' ');
  }

  function drawSparkline(svg, rows, field, color) {
    svg.replaceChildren();
    const values = rows.slice(-36).map((row) => row[field]);
    if (values.length < 2) return;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);
    const xFor = (index) => 2 + (index * 108 / (values.length - 1));
    const yFor = (value) => 27 - ((value - min) / range) * 22;
    svg.append(svgEl('path', { d: makeLinePath(values, xFor, yFor), fill: 'none', stroke: color, 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  function drawChart() {
    const svg = els['trend-chart'];
    const metric = METRICS[selectedMetric];
    svg.replaceChildren();
    svg.setAttribute('aria-label', `${metric.label} selama 24 jam, waktu ${wibTime(atCursor().ts)} WIB menunjukkan ${fmt(atCursor()[selectedMetric])} ${metric.unit}`);
    const defs = svgEl('defs');
    const gradient = svgEl('linearGradient', { id: 'chart-fill', x1: '0', x2: '0', y1: '0', y2: '1' });
    gradient.append(svgEl('stop', { offset: '0%', 'stop-color': metric.color, 'stop-opacity': '.25' }));
    gradient.append(svgEl('stop', { offset: '100%', 'stop-color': metric.color, 'stop-opacity': '0' }));
    defs.append(gradient);
    svg.append(defs);

    const plot = { left: 42, right: 991, top: 12, bottom: 234 };
    const min = metric.min;
    const max = metric.max;
    const xFor = (index) => plot.left + ((plot.right - plot.left) * index / Math.max(records.length - 1, 1));
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
    svg.append(svgEl('path', { d: area, fill: 'url(#chart-fill)', class: 'chart-area' }));
    svg.append(svgEl('path', { d: line, class: 'chart-line', style: `stroke:${metric.color}` }));

    const x = xFor(cursorIndex);
    const y = yFor(atCursor()[selectedMetric]);
    svg.append(svgEl('line', { x1: x, y1: plot.top, x2: x, y2: plot.bottom, class: 'chart-x-guide' }));
    svg.append(svgEl('circle', { cx: x, cy: y, r: 5.5, class: 'chart-cursor', style: `stroke:${metric.color}` }));
    els['chart-title'].firstChild.textContent = metric.label;
    els['chart-current'].textContent = `${fmt(atCursor()[selectedMetric])} ${metric.unit}`;
    els['chart-period'].textContent = `${dateFmt.format(new Date(records[0].ts))} – ${dateFmt.format(new Date(records[records.length - 1].ts))} · WIB`;
    els['axis-start'].textContent = wibTime(records[0].ts);
    els['axis-end'].textContent = wibTime(records[records.length - 1].ts);
    els['axis-quarter1'].textContent = wibTime(records[Math.floor((records.length - 1) / 4)].ts);
    els['axis-mid'].textContent = wibTime(records[Math.floor((records.length - 1) / 2)].ts);
    els['axis-quarter3'].textContent = wibTime(records[Math.floor(((records.length - 1) * 3) / 4)].ts);
  }

  function renderHealth(row) {
    const healthy = row.soil_moisture >= 35 && row.soil_moisture <= 70 && row.temperature >= 18 && row.temperature <= 34 && row.water_level >= 20 && row.battery >= 20;
    document.querySelector('.health-status').classList.toggle('is-warn', !healthy);
    els['health-state'].textContent = healthy ? 'Kondisi dalam rentang' : 'Perlu diperhatikan';
    els['health-title'].textContent = healthy ? 'Tanaman Anda tampak nyaman.' : 'Ada parameter yang perlu dicek.';
    els['health-description'].textContent = 'Nilai berasal dari simulasi, bukan sensor langsung.';
    els['soil-note'].textContent = row.soil_moisture < 35 ? 'Mulai mengering' : row.soil_moisture > 70 ? 'Cukup basah' : 'Dalam rentang';
    els['water-note'].textContent = row.water_level < 25 ? 'Perlu diisi' : 'Reservoir';
  }

  function renderInsights() {
    let irrigations = 0;
    let largestDrop = 0;
    for (let i = 1; i < records.length; i += 1) {
      const rise = records[i].soil_moisture - records[i - 1].soil_moisture;
      if (rise >= 4) { irrigations += 1; largestDrop = Math.max(largestDrop, rise); }
    }
    els['insight-title'].textContent = irrigations ? `${irrigations} perubahan kelembapan terdeteksi` : 'Pola penyiraman';
    els['insight-description'].textContent = irrigations
      ? `Lonjakan terbesar ${fmt(largestDrop)}% pada kelembapan tanah dalam periode ini.`
      : 'Belum terlihat lonjakan kelembapan tanah yang menandakan penyiraman.';
    els['device-state'].textContent = 'Mode simulasi';
    els['device-description'].textContent = `${records.length.toLocaleString('id-ID')} titik simulasi · data terakhir ${dateTimeFmt.format(new Date(records[records.length - 1].ts))} WIB.`;
  }

  function render() {
    if (!records.length) return;
    const row = atCursor();
    els['metric-soil'].textContent = fmt(row.soil_moisture);
    els['metric-temp'].textContent = fmt(row.temperature);
    els['metric-humidity'].textContent = fmt(row.humidity);
    els['metric-water'].textContent = fmt(row.water_level);
    els['metric-battery'].textContent = fmt(row.battery);
    els['updated-label'].textContent = source === 'snapshot' ? `Snapshot · ${dateTimeFmt.format(new Date(row.ts))} WIB` : 'Pratinjau simulasi';
    els['timeline'].value = String(cursorIndex);
    els['timeline'].max = String(records.length - 1);
    els['timeline-time'].textContent = wibTime(row.ts);
    els['timeline'].setAttribute('aria-valuetext', `${dateFmt.format(new Date(row.ts))} ${wibTime(row.ts)} WIB`);
    renderHealth(row);
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
    els['play-button'].setAttribute('aria-label', 'Putar simulasi 24 jam dalam 1 menit');
    els['play-button'].title = 'Putar simulasi 24 jam dalam 1 menit';
    els['simulation-label'].textContent = 'Putar 24 jam dalam 1 menit';
  }

  function animatePlayback(now) {
    const elapsed = now - playStartedAt;
    const next = Math.min(records.length - 1, Math.floor(playStartIndex + (elapsed / 60000) * (records.length - 1)));
    if (next !== cursorIndex) { cursorIndex = next; render(); }
    if (next >= records.length - 1) { stopPlayback(); return; }
    playFrame = requestAnimationFrame(animatePlayback);
  }

  els['refresh-button'].addEventListener('click', loadData);
  els['timeline'].addEventListener('input', () => {
    stopPlayback();
    cursorIndex = Number(els['timeline'].value);
    render();
  });
  els['play-button'].addEventListener('click', () => {
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
      drawChart();
    });
  });

  document.querySelector('.eyebrow').firstChild.textContent = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).toLocaleUpperCase('id-ID');
  const localHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: WIB, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  document.getElementById('welcome-title').firstChild.textContent = `${localHour < 11 ? 'Selamat pagi' : localHour < 15 ? 'Selamat siang' : localHour < 18 ? 'Selamat sore' : 'Selamat malam'} `;
  loadData();
})();
