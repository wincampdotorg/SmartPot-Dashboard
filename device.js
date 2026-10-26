(() => {
  'use strict';

  const els = Object.fromEntries([
    'connection-badge', 'connection-label', 'connection-form', 'broker-url', 'broker-username', 'broker-password',
    'connect-button', 'disconnect-button', 'connection-help', 'scene-wrap', 'light-state', 'light-heading',
    'light-status-note', 'color-chip', 'rgb-value', 'rgb-red-bar', 'rgb-green-bar', 'rgb-blue-bar',
    'rgb-red-value', 'rgb-green-value', 'rgb-blue-value', 'pump-state', 'pump-heading', 'pump-description',
    'last-topic', 'last-message-time', 'water-value', 'water-meter-fill', 'water-status-panel', 'water-warning', 'scene-water-level', 'reservoir-fill', 'reservoir-wave',
    'schedule-source', 'schedule-rows', 'watering-history-count', 'watering-history-rows',
    'grow-light-history-count', 'grow-light-history-rows'
  ].map((id) => [id, document.getElementById(id)]));

  const HISTORY_STORAGE_KEY = 'smartpot-actuator-history-v1';
  const HISTORY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
  const state = { client: null, lightOn: null, rgb: null, pumpOn: false, water: null, schedules: [], pumpTimer: 0, wateringHistory: [], growLightHistory: [] };
  const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const dateTimeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const truthy = (value) => value === true || value === 1 || /^(on|true|1|yes)$/i.test(String(value));

  function setConnection(mode, label, help) {
    els['connection-badge'].classList.remove('is-live', 'is-error', 'is-offline');
    els['connection-badge'].classList.add(mode === 'live' ? 'is-live' : mode === 'error' ? 'is-error' : 'is-offline');
    els['connection-label'].textContent = label;
    els['connection-help'].textContent = help;
  }

  function setRgb(red, green, blue) {
    const values = [red, green, blue].map((value) => Math.max(0, Math.min(255, Number(value) || 0)));
    state.rgb = values;
    const [r, g, b] = values;
    const color = `rgb(${r} ${g} ${b})`;
    const alpha = (opacity) => `rgba(${r}, ${g}, ${b}, ${opacity})`;
    els['scene-wrap'].style.setProperty('--live-light', color);
    document.getElementById('light-glow').setAttribute('fill', color);
    document.getElementById('light-glow').setAttribute('fill-opacity', state.lightOn ? '.45' : '.12');
    document.querySelectorAll('#leds circle').forEach((led) => led.setAttribute('fill', color));
    document.querySelectorAll('.light-rays path').forEach((ray) => ray.setAttribute('stroke', alpha('.75')));
    els['color-chip'].style.background = color;
    els['color-chip'].style.boxShadow = state.lightOn ? `0 0 18px ${alpha('.45')}, inset 0 0 0 3px #fff` : 'inset 0 0 0 3px #fff';
    els['rgb-value'].textContent = `RGB ${r}, ${g}, ${b}`;
    ['red', 'green', 'blue'].forEach((channel, index) => {
      els[`rgb-${channel}-bar`].style.width = `${(values[index] / 255) * 100}%`;
      els[`rgb-${channel}-value`].textContent = String(values[index]);
    });
  }

  function setLight(on, rgb) {
    state.lightOn = Boolean(on);
    if (Array.isArray(rgb)) setRgb(...rgb);
    els['scene-wrap'].classList.toggle('light-on', state.lightOn);
    els['light-state'].textContent = state.lightOn ? 'Grow light menyala' : 'Grow light mati';
    els['light-heading'].textContent = state.lightOn ? 'Menyala' : 'Mati';
    els['light-status-note'].textContent = state.rgb ? (state.lightOn ? 'Warna lampu aktif' : 'Warna tersimpan · lampu mati') : 'Menunggu status dari perangkat';
    if (!state.rgb) return;
    const [r, g, b] = state.rgb;
    document.getElementById('light-glow').setAttribute('fill-opacity', state.lightOn ? '.45' : '.12');
    els['color-chip'].style.boxShadow = state.lightOn ? `0 0 18px rgba(${r},${g},${b},.45), inset 0 0 0 3px #fff` : 'inset 0 0 0 3px #fff';
  }

  function setWater(value) {
    const water = Math.max(0, Math.min(100, Number(value)));
    if (!Number.isFinite(water)) return;
    state.water = water;
    const fillHeight = Math.round(60 * water / 100);
    const fillY = 514 - fillHeight;
    els['reservoir-fill'].setAttribute('y', String(fillY));
    els['reservoir-fill'].setAttribute('height', String(fillHeight + 12));
    els['reservoir-wave'].setAttribute('transform', `translate(0 ${Math.round(60 * (1 - water / 100))})`);
    const lowWater = water < 20;
    els['scene-wrap'].classList.toggle('water-low', lowWater);
    els['water-status-panel'].classList.toggle('water-low', lowWater);
    els['water-value'].textContent = `${Math.round(water)}%`;
    els['scene-water-level'].textContent = `${Math.round(water)}%`;
    els['water-meter-fill'].style.width = `${water}%`;
    els['water-warning'].textContent = water < 10
      ? 'Air sangat sedikit. Tombol Pump di aplikasi Android dinonaktifkan.'
      : lowWater ? 'Level air rendah. Isi ulang reservoir sebelum menyiram.' : '';
  }

  function setPump(on, message = '') {
    state.pumpOn = Boolean(on);
    window.clearTimeout(state.pumpTimer);
    els['scene-wrap'].classList.toggle('pump-on', state.pumpOn);
    els['pump-state'].textContent = state.pumpOn ? 'Air sedang mengalir' : 'Pompa siaga';
    els['pump-heading'].textContent = state.pumpOn ? 'Menyiram' : 'Siaga';
    els['pump-description'].textContent = state.pumpOn
      ? 'Perintah pompa diterima. Aliran air divisualisasikan dari reservoir ke tanaman.'
      : message || 'Aliran visual aktif saat pesan pompa ON diterima dari MQTT.';
  }

  function markMessage(topic) {
    els['last-topic'].textContent = topic;
    els['last-message-time'].textContent = `${timeFmt.format(new Date())} WIB · pesan MQTT diterima`;
  }

  function parseJson(raw) {
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function pruneHistory(events) {
    const cutoff = Date.now() - HISTORY_WINDOW_MS;
    const byId = new Map();
    events.forEach((event) => {
      const timestamp = Number(event && event.timestamp);
      if (!event || !Number.isFinite(timestamp) || timestamp < cutoff || timestamp > Date.now() + 5 * 60 * 1000) return;
      byId.set(String(event.id ?? `${timestamp}:${JSON.stringify(event)}`), { ...event, timestamp });
    });
    return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, 500);
  }

  function persistHistory() {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({
        watering: state.wateringHistory,
        growLight: state.growLightHistory
      }));
    } catch (_) { /* Storage may be unavailable in a restricted browser context. */ }
  }

  function renderHistoryTable(tbody, count, events, columns, emptyText) {
    tbody.replaceChildren();
    count.textContent = `${events.length} ${events.length === 1 ? 'catatan' : 'catatan'}`;
    if (!events.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = columns;
      cell.className = 'empty-row';
      cell.textContent = emptyText;
      row.append(cell);
      tbody.append(row);
      return;
    }
    events.forEach((event) => {
      const row = document.createElement('tr');
      const cells = columns === 4
        ? [dateTimeFmt.format(new Date(event.timestamp)) + ' WIB', event.source === 'android_manual' ? 'Tombol Pump' : 'Jadwal otomatis', `${Number(event.waterLevel) || 0}%`, event.outcome === 'failed_low_water' ? 'Gagal · air rendah' : 'Dimulai']
        : [dateTimeFmt.format(new Date(event.timestamp)) + ' WIB', truthy(event.state) ? 'Menyala' : 'Mati', `R ${Number(event.red) || 0} · G ${Number(event.green) || 0} · B ${Number(event.blue) || 0}`];
      cells.forEach((text) => {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      });
      tbody.append(row);
    });
  }

  function renderHistory() {
    state.wateringHistory = pruneHistory(state.wateringHistory);
    state.growLightHistory = pruneHistory(state.growLightHistory);
    renderHistoryTable(els['watering-history-rows'], els['watering-history-count'], state.wateringHistory, 4, 'Belum ada riwayat penyiraman dalam 3 hari terakhir.');
    renderHistoryTable(els['grow-light-history-rows'], els['grow-light-history-count'], state.growLightHistory, 3, 'Belum ada riwayat grow light dalam 3 hari terakhir.');
  }

  function mergeHistory(type, events) {
    if (!Array.isArray(events)) return;
    if (type === 'watering') state.wateringHistory = pruneHistory([...state.wateringHistory, ...events]);
    else state.growLightHistory = pruneHistory([...state.growLightHistory, ...events]);
    persistHistory();
    renderHistory();
  }

  function restoreHistory() {
    try {
      const saved = parseJson(localStorage.getItem(HISTORY_STORAGE_KEY) || '{}') || {};
      state.wateringHistory = pruneHistory(Array.isArray(saved.watering) ? saved.watering : []);
      state.growLightHistory = pruneHistory(Array.isArray(saved.growLight) ? saved.growLight : []);
    } catch (_) { /* Begin with empty history if local storage cannot be read. */ }
    renderHistory();
  }

  function renderSchedules() {
    els['schedule-rows'].replaceChildren();
    if (!state.schedules.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.className = 'empty-row';
      cell.textContent = 'Belum ada jadwal yang diterima dari perangkat.';
      row.append(cell);
      els['schedule-rows'].append(row);
      return;
    }
    [...state.schedules].sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))).forEach((item) => {
      const row = document.createElement('tr');
      const pump = Number(item.status_pump ?? item.pumpOn ?? 1) === 1 || item.pumpOn === true;
      const light = truthy(item.growLight ?? item.grow_light);
      const time = item.time || `${String(item.hour ?? 0).padStart(2, '0')}:${String(item.minute ?? 0).padStart(2, '0')}`;
      [time, pump ? (light ? 'Penyiraman + grow light' : 'Penyiraman saja') : 'Grow light saja', pump ? 'Pompa aktif' : 'Pompa mati', light ? 'Menyala' : 'Mati'].forEach((text) => {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      });
      els['schedule-rows'].append(row);
    });
  }

  function acceptScheduleSnapshot(payload) {
    if (!Array.isArray(payload.schedules)) return;
    state.schedules = payload.schedules.filter((item) => item && typeof item === 'object');
    els['schedule-source'].textContent = 'Snapshot retained perangkat';
    els['schedule-source'].classList.add('is-live');
    renderSchedules();
  }

  function acceptScheduleEvent(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (String(payload.action || '').toUpperCase() === 'DELETE_SCHEDULE') {
      state.schedules = state.schedules.filter((item) => item.id !== payload.id);
    } else if (payload.id) {
      const schedule = { ...payload, time: payload.time || `${String(payload.hour ?? 0).padStart(2, '0')}:${String(payload.minute ?? 0).padStart(2, '0')}` };
      const index = state.schedules.findIndex((item) => item.id === schedule.id || item.time === schedule.time);
      if (index >= 0) state.schedules[index] = schedule;
      else state.schedules.push(schedule);
    }
    els['schedule-source'].textContent = 'Pembaruan langsung MQTT';
    els['schedule-source'].classList.add('is-live');
    renderSchedules();
  }

  function handleMessage(topic, raw) {
    const message = raw.toString();
    const payload = parseJson(message);
    markMessage(topic);

    if (topic === 'smartpot/history/watering' && payload && payload.type === 'snapshot') {
      mergeHistory('watering', payload.events);
      return;
    }
    if (topic === 'smartpot/history/grow-light' && payload && payload.type === 'snapshot') {
      mergeHistory('growLight', payload.events);
      return;
    }

    if (topic === 'smartpot/pump/status') {
      const on = payload ? truthy(payload.state ?? payload.status_pump ?? payload.pump ?? payload.action) : truthy(message);
      setPump(on);
      if (on) state.pumpTimer = window.setTimeout(() => setPump(false, 'Animasi aliran selesai · menunggu status pompa berikutnya.'), 5000);
      return;
    }
    if (topic === 'smartpot/led/status') {
      setLight(truthy(payload ? (payload.state ?? payload.growLight ?? payload.status) : message), state.rgb);
      return;
    }
    if (topic === 'smartpot/control/light' || /\/(grow_?light|light)$/.test(topic)) {
      if (payload) {
        const on = payload.state ?? payload.growLight ?? payload.grow_light ?? payload.light;
        const r = payload.R ?? payload.r;
        const g = payload.G ?? payload.g;
        const b = payload.B ?? payload.b;
        if ([r, g, b].every((v) => Number.isFinite(Number(v)))) setRgb(r, g, b);
        if (on !== undefined) setLight(truthy(on), state.rgb);
      }
      return;
    }
    if (topic === 'smartpot/control/pump' || /\/pump\/control$/.test(topic)) {
      const command = payload ? (payload.state ?? payload.status_pump ?? payload.pump ?? payload.action) : message;
      if (command !== undefined) {
        const on = truthy(command);
        setPump(on);
        if (on) state.pumpTimer = window.setTimeout(() => setPump(false, 'Animasi aliran selesai · menunggu status pompa berikutnya.'), 5000);
      }
      return;
    }
    if (topic === 'smartpot/schedules/state') {
      acceptScheduleSnapshot(payload || {});
      return;
    }
    if (topic === 'smartpot/schedule') {
      if (payload) acceptScheduleEvent(payload);
      return;
    }

    if (!payload) return;
    const water = payload.water_level ?? payload.waterLevel ?? payload.water ?? payload.level;
    if (water !== undefined) setWater(water);
    if (payload.status_pump !== undefined || payload.pump !== undefined) setPump(truthy(payload.status_pump ?? payload.pump));
    const light = payload.growLight ?? payload.grow_light ?? payload.light;
    if (light !== undefined) setLight(truthy(light), [payload.R ?? payload.r ?? state.rgb?.[0] ?? 0, payload.G ?? payload.g ?? state.rgb?.[1] ?? 0, payload.B ?? payload.b ?? state.rgb?.[2] ?? 0]);
  }

  function disconnect() {
    if (state.client) {
      state.client.end(true);
      state.client = null;
    }
    els['connect-button'].disabled = false;
    els['disconnect-button'].disabled = true;
    setConnection('offline', 'Terputus', 'Hubungkan kembali untuk menerima pembaruan perangkat.');
  }

  els['connection-form'].addEventListener('submit', (event) => {
    event.preventDefault();
    if (!window.mqtt) {
      setConnection('error', 'Library MQTT gagal dimuat', 'Periksa koneksi internet untuk memuat MQTT.js dari unpkg.');
      return;
    }
    disconnect();
    const url = els['broker-url'].value.trim();
    if (!url.startsWith('wss://')) {
      setConnection('error', 'Alamat harus WSS', 'Dashboard publik memerlukan koneksi WebSocket terenkripsi.');
      return;
    }
    els['connect-button'].disabled = true;
    setConnection('offline', 'Menghubungkan…', 'Membuka sesi MQTT aman ke EMQX.');
    const clientId = `SmartPotWeb_${Math.random().toString(16).slice(2, 12)}`;
    state.client = window.mqtt.connect(url, {
      clientId,
      username: els['broker-username'].value.trim() || undefined,
      password: els['broker-password'].value || undefined,
      protocolVersion: 4,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 3000,
      keepalive: 30
    });
    state.client.on('connect', () => {
      els['connect-button'].disabled = true;
      els['disconnect-button'].disabled = false;
      setConnection('live', 'Terhubung ke EMQX', 'Mendengarkan topik smartpot/# untuk status aktual.');
      state.client.subscribe('smartpot/#', { qos: 1 }, (error) => {
        if (error) setConnection('error', 'Gagal berlangganan', 'User EMQX perlu izin baca topik smartpot/#.');
      });
    });
    state.client.on('message', handleMessage);
    state.client.on('reconnect', () => setConnection('offline', 'Menghubungkan ulang…', 'Sesi MQTT mencoba tersambung kembali.'));
    state.client.on('offline', () => setConnection('offline', 'Broker tidak tersambung', 'Periksa alamat WSS, jaringan, username, dan password.'));
    state.client.on('error', (error) => {
      setConnection('error', 'Koneksi gagal', error && error.message ? error.message : 'Periksa alamat WSS dan autentikasi EMQX.');
      els['connect-button'].disabled = false;
    });
    state.client.on('close', () => {
      if (state.client) setConnection('offline', 'Terputus', 'Koneksi MQTT ditutup.');
      els['connect-button'].disabled = false;
      els['disconnect-button'].disabled = true;
    });
  });
  els['disconnect-button'].addEventListener('click', disconnect);
  els['light-state'].textContent = 'Menunggu status grow light';
  els['pump-state'].textContent = 'Menunggu status pompa';
  els['water-value'].textContent = '—%';
  renderSchedules();
  restoreHistory();
  window.setInterval(() => {
    renderHistory();
    persistHistory();
  }, 60 * 1000);
})();
