(() => {
  'use strict';
  if (!window.SmartPotAuth?.authenticated) return;

  const els = Object.fromEntries([
    'connection-badge', 'connection-label', 'connection-form', 'broker-profile', 'broker-url', 'broker-username', 'broker-password',
    'connect-button', 'disconnect-button', 'connection-help', 'scene-wrap', 'light-state', 'light-heading',
    'light-status-note', 'color-chip', 'rgb-value', 'rgb-red-bar', 'rgb-green-bar', 'rgb-blue-bar',
    'rgb-red-value', 'rgb-green-value', 'rgb-blue-value', 'pump-state', 'pump-heading', 'pump-description',
    'last-topic', 'last-message-time', 'water-value', 'water-meter-fill', 'water-status-panel', 'water-warning', 'scene-water-level', 'reservoir-fill', 'reservoir-wave',
    'schedule-source', 'schedule-rows', 'watering-history-count', 'watering-history-rows',
    'watering-history-pagination', 'watering-history-prev', 'watering-history-page', 'watering-history-next',
    'grow-light-history-count', 'grow-light-history-rows', 'grow-light-history-pagination',
    'grow-light-history-prev', 'grow-light-history-page', 'grow-light-history-next'
  ].map((id) => [id, document.getElementById(id)]));

  const HISTORY_STORAGE_KEY = 'smartpot-actuator-history-v1';
  const DEVICE_STATE_STORAGE_KEY = 'smartpot-device-state-v1';
  const PROFILE_STORAGE_KEY = 'smartpot-mqtt-profile-v1';
  const historyStorageKey = () => `${HISTORY_STORAGE_KEY}:${els['broker-profile'].value || 'web-panel'}`;
  const MANUAL_DISCONNECT_KEY = 'smartpot-manual-disconnect';
  const PROFILE_COOKIE = 'smartpot_mqtt_profile';
  const profileCookiePath = new URL('.', document.currentScript.src).pathname;
  const HISTORY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
  const MQTT_PROFILES = {
    tdr2: {
      brokerUrl: 'wss://ifb44421.ala.asia-southeast1.emqxsl.com:8084/mqtt',
      username: 'TDR2',
      password: '1234567890'
    },
    'web-panel': {
      brokerUrl: 'wss://af2f1247.ala.asia-southeast1.emqxsl.com:8084/mqtt',
      username: 'binusiotgroup10',
      password: 'binusiotgroup10'
    }
  };
  const state = { client: null, lightOn: null, rgb: null, pumpOn: false, water: null, schedules: [], flowOn: false, previewOn: false, previewTimer: 0, wateringHistory: [], growLightHistory: [], wateringPage: 1, growLightPage: 1 };
  const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const dateTimeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const truthy = (value) => value === true || value === 1 || /^(on|true|1|yes)$/i.test(String(value));

  function saveConnectedProfile(profileId) {
    if (!MQTT_PROFILES[profileId]) return;
    try { localStorage.setItem(PROFILE_STORAGE_KEY, profileId); } catch (_) {}
    try { sessionStorage.setItem(PROFILE_STORAGE_KEY, profileId); } catch (_) {}
    document.cookie = `${PROFILE_COOKIE}=${profileId}; Max-Age=2592000; Path=${profileCookiePath}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }

  function restoreConnectedProfile() {
    const cookie = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${PROFILE_COOKIE}=`));
    const fromCookie = cookie?.slice(PROFILE_COOKIE.length + 1);
    if (MQTT_PROFILES[fromCookie]) return fromCookie;
    try { const saved = localStorage.getItem(PROFILE_STORAGE_KEY); if (MQTT_PROFILES[saved]) return saved; } catch (_) {}
    try { const saved = sessionStorage.getItem(PROFILE_STORAGE_KEY); if (MQTT_PROFILES[saved]) return saved; } catch (_) {}
    return 'tdr2';
  }

  function deviceStateStorageKey(type) {
    return `${DEVICE_STATE_STORAGE_KEY}:${els['broker-profile'].value || 'default'}:${type}`;
  }

  function persistLightState() {
    if (state.lightOn === null) return;
    try {
      localStorage.setItem(deviceStateStorageKey('grow-light'), JSON.stringify({ on: state.lightOn, rgb: state.rgb }));
    } catch (_) { /* Browser storage may be unavailable. */ }
  }

  function persistWaterState() {
    if (state.water === null) return;
    try {
      localStorage.setItem(deviceStateStorageKey('water'), JSON.stringify({ level: state.water }));
    } catch (_) { /* Browser storage may be unavailable. */ }
  }

  function setConnection(mode, label, help) {
    els['connection-badge'].classList.remove('is-live', 'is-error', 'is-offline');
    els['connection-badge'].classList.add(mode === 'live' ? 'is-live' : mode === 'error' ? 'is-error' : 'is-offline');
    els['connection-label'].textContent = label;
    els['connection-help'].textContent = help;
    window.dispatchEvent(new CustomEvent('smartpot:mqtt-state', { detail: { mode, label } }));
  }

  function applyMqttProfile(profileId) {
    const profile = MQTT_PROFILES[profileId];
    if (!profile) return;
    els['broker-url'].value = profile.brokerUrl;
    els['broker-username'].value = profile.username;
    els['broker-password'].value = profile.password;
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
    persistLightState();
  }

  function setLight(on, rgb) {
    state.lightOn = Boolean(on);
    if (Array.isArray(rgb)) setRgb(...rgb);
    persistLightState();
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
    persistWaterState();
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

  const pumpVisual = window.SmartPotPumpSignal.createVisualPulse(active => {
    state.flowOn = active;
    renderPumpVisual();
  });

  function renderPumpVisual() {
    const active = state.flowOn || state.previewOn;
    els['scene-wrap'].classList.toggle('pump-on', active);
    const badge = document.getElementById('pump-visual-status');
    badge.hidden = !active;
    badge.textContent = state.flowOn ? `Visualisasi aliran · 5 detik · status pompa ${state.pumpOn ? 'ON' : 'OFF'}` : 'Pratinjau aliran · tanpa perintah ke alat';
    const button = document.getElementById('preview-water-flow');
    button.disabled = active;
    button.textContent = state.previewOn ? 'Pratinjau sedang berjalan…' : 'Pratinjau aliran · 5 detik';
  }

  function setPump(on, message = '') {
    state.pumpOn = Boolean(on);
    if (state.pumpOn) {
      state.previewOn = false;
      window.clearTimeout(state.previewTimer);
    }
    pumpVisual.receive(state.pumpOn);
    renderPumpVisual();
    els['pump-state'].textContent = state.pumpOn ? 'Perintah penyiraman aktif' : 'Pompa siaga';
    els['pump-heading'].textContent = state.pumpOn ? 'Menyiram' : 'Siaga';
    els['pump-description'].textContent = state.pumpOn
      ? 'Perintah pompa diterima. Aliran air divisualisasikan dari reservoir ke tanaman.'
      : message || 'Aliran visual aktif saat pesan pompa ON diterima dari MQTT.';
  }

  document.getElementById('preview-water-flow').addEventListener('click', () => {
    if (state.pumpOn || state.flowOn) return;
    window.clearTimeout(state.previewTimer);
    state.previewOn = true;
    renderPumpVisual();
    state.previewTimer = window.setTimeout(() => {
      state.previewOn = false;
      renderPumpVisual();
    }, 5000);
  });

  function markMessage(topic) {
    els['last-topic'].textContent = topic;
    els['last-message-time'].textContent = `${timeFmt.format(new Date())} WIB · pesan MQTT diterima`;
  }

  function parseJson(raw) {
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function parsePercentage(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !/^\s*\d+(?:\.\d+)?\s*%?\s*$/.test(value)) return null;
    const parsed = Number(value.replace('%', '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  function restoreDeviceState() {
    try {
      const cachedLight = parseJson(localStorage.getItem(deviceStateStorageKey('grow-light')) || 'null');
      if (cachedLight && typeof cachedLight.on === 'boolean') {
        setLight(cachedLight.on, Array.isArray(cachedLight.rgb) ? cachedLight.rgb : undefined);
      }
      const cachedWater = parseJson(localStorage.getItem(deviceStateStorageKey('water')) || 'null');
      const level = parsePercentage(cachedWater && cachedWater.level);
      if (level !== null) setWater(level);
    } catch (_) { /* Continue waiting for current MQTT state if storage is unavailable. */ }
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
      localStorage.setItem(historyStorageKey(), JSON.stringify({
        watering: state.wateringHistory,
        growLight: state.growLightHistory
      }));
    } catch (_) { /* Storage may be unavailable in a restricted browser context. */ }
  }

  let catalogReady = false;
  let catalogRequest = null;
  let catalogTimer;
  function requestCatalogSoon() {
    clearTimeout(catalogTimer);
    catalogTimer = setTimeout(loadCatalog, 500);
  }
  async function loadCatalog() {
    if (catalogRequest) return;
    const profile = els['broker-profile'].value;
    const controller = new AbortController();
    catalogRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`https://wincamp.web.id/smartpot/api/catalog?profile=${encodeURIComponent(profile)}`, {cache:'no-store',signal:controller.signal});
      if (!response.ok) throw new Error('API katalog tidak tersedia');
      const data = await response.json();
      if (profile !== els['broker-profile'].value || data.database !== 'Smartport' || data.profile !== profile) return;
      if (!Array.isArray(data.schedules) || !Array.isArray(data.watering) || !Array.isArray(data.grow_light)) throw new Error('Katalog tidak valid');
      catalogReady = true;
      state.schedules = data.schedules;
      state.wateringHistory = pruneHistory(data.watering);
      state.growLightHistory = pruneHistory(data.grow_light);
      els['schedule-source'].textContent = data.pending_device_updates ? 'Smartport · menunggu pengiriman MQTT' : 'Tersinkron · Smartport';
      els['schedule-source'].classList.add('is-live');
      renderSchedules(); renderHistory(); persistHistory();
      window.dispatchEvent(new CustomEvent('smartpot:history-db', {detail:{profile,watering:state.wateringHistory}}));
    } catch (_) {
      if(profile!==els['broker-profile'].value)return;
      els['schedule-source'].textContent = catalogReady ? 'Smartport · koneksi terputus, mencoba kembali' : 'Smartport belum tersedia · data cache/MQTT';
      els['schedule-source'].classList.remove('is-live');
    } finally {
      clearTimeout(timeout);
      if(catalogRequest===controller)catalogRequest=null;
    }
  }

  function renderHistoryTable(tbody, count, pagination, previousButton, pageLabel, nextButton, events, columns, emptyText, page, setPage) {
    tbody.replaceChildren();
    count.textContent = `${events.length} ${events.length === 1 ? 'catatan' : 'catatan'}`;
    const pageCount = Math.max(1, Math.ceil(events.length / 10));
    const currentPage = Math.min(page, pageCount);
    setPage(currentPage);
    pagination.hidden = pageCount <= 1;
    previousButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= pageCount;
    pageLabel.textContent = `Halaman ${currentPage} dari ${pageCount}`;
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
    events.slice((currentPage - 1) * 10, currentPage * 10).forEach((event) => {
      const row = document.createElement('tr');
      const cells = columns === 4
        ? [dateTimeFmt.format(new Date(event.timestamp)) + ' WIB', event.source === 'android_manual' ? 'Tombol Pump' : event.source === 'mqtt_device' ? 'Perangkat / MQTT' : 'Jadwal otomatis', event.waterLevel == null ? '—' : `${Number(event.waterLevel)}%`, event.waterLevel == null ? 'Level air tidak tersedia' : Number(event.waterLevel) <= 20 ? 'Air Rendah' : 'Sukses Menyiram']
        : [dateTimeFmt.format(new Date(event.timestamp)) + ' WIB', truthy(event.state) ? 'Menyala' : 'Mati', event.red == null ? 'Tidak dikirim alat' : `R ${Number(event.red) || 0} · G ${Number(event.green) || 0} · B ${Number(event.blue) || 0}`];
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
    renderHistoryTable(els['watering-history-rows'], els['watering-history-count'], els['watering-history-pagination'], els['watering-history-prev'], els['watering-history-page'], els['watering-history-next'], state.wateringHistory, 4, 'Belum ada riwayat penyiraman dalam 3 hari terakhir.', state.wateringPage, (page) => { state.wateringPage = page; });
    renderHistoryTable(els['grow-light-history-rows'], els['grow-light-history-count'], els['grow-light-history-pagination'], els['grow-light-history-prev'], els['grow-light-history-page'], els['grow-light-history-next'], state.growLightHistory, 3, 'Belum ada riwayat grow light dalam 3 hari terakhir.', state.growLightPage, (page) => { state.growLightPage = page; });
  }

  els['watering-history-prev'].addEventListener('click', () => { state.wateringPage -= 1; renderHistory(); });
  els['watering-history-next'].addEventListener('click', () => { state.wateringPage += 1; renderHistory(); });
  els['grow-light-history-prev'].addEventListener('click', () => { state.growLightPage -= 1; renderHistory(); });
  els['grow-light-history-next'].addEventListener('click', () => { state.growLightPage += 1; renderHistory(); });

  function mergeHistory(type, events) {
    if (catalogReady) { requestCatalogSoon(); return; }
    if (!Array.isArray(events)) return;
    if (type === 'watering') state.wateringHistory = pruneHistory([...state.wateringHistory, ...events]);
    else state.growLightHistory = pruneHistory([...state.growLightHistory, ...events]);
    persistHistory();
    renderHistory();
  }

  function restoreHistory() {
    try {
      const saved = parseJson(localStorage.getItem(historyStorageKey()) || (els['broker-profile'].value === 'web-panel' ? localStorage.getItem(HISTORY_STORAGE_KEY) : null) || '{}') || {};
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
      cell.colSpan = 5;
      cell.className = 'empty-row';
      cell.textContent = 'Belum ada jadwal di Smartport.';
      row.append(cell);
      els['schedule-rows'].append(row);
      return;
    }
    state.schedules.forEach((item) => {
      const row = document.createElement('tr');
      const pump = Number(item.status_pump ?? item.pumpOn ?? 1) === 1 || item.pumpOn === true;
      const light = truthy(item.growLight ?? item.grow_light);
      const time = item.time || `${String(item.hour ?? 0).padStart(2, '0')}:${String(item.minute ?? 0).padStart(2, '0')}`;
      [`${time} · ${item.planned_date || 'Setiap hari'}`, pump ? (item.action_type === 'pump_grow_light' || light ? 'Penyiraman + grow light' : 'Penyiraman saja') : 'Grow light saja', item.origin === 'ai' ? 'Usulan AI · belum dijalankan' : 'Manual · aktif', pump ? '5 detik' : '—', light ? 'Menyala' : 'Mati'].forEach((text) => {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      });
      els['schedule-rows'].append(row);
    });
  }

  function acceptScheduleSnapshot(payload) {
    requestCatalogSoon();
    if(catalogReady)return;
    if (!Array.isArray(payload.schedules)) return;
    state.schedules = payload.schedules.filter((item) => item && typeof item === 'object');
    els['schedule-source'].textContent = 'Snapshot retained perangkat';
    els['schedule-source'].classList.add('is-live');
    renderSchedules();
  }

  function acceptScheduleEvent(payload) {
    requestCatalogSoon();
    if(catalogReady)return;
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
    window.dispatchEvent(new CustomEvent('smartpot:mqtt-message', { detail: { topic, message, profile: els['broker-profile'].value } }));
    const payload = parseJson(message);
    markMessage(topic);
    if(topic === 'smartpot/db/schedules/ack' || topic === 'smartpot/pump/status' || topic === 'smartpot/control/light')requestCatalogSoon();

    if (topic === 'smartpot/history/watering' && payload && payload.type === 'snapshot') {
      mergeHistory('watering', payload.events);
      return;
    }
    if (topic === 'smartpot/history/grow-light' && payload && payload.type === 'snapshot') {
      mergeHistory('growLight', payload.events);
      return;
    }

    if (topic === 'smartpot/pump/status') {
      const on = window.SmartPotPumpSignal.parse(message);
      if (on !== null) setPump(on);
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
      const on = window.SmartPotPumpSignal.parse(message);
      if (on !== null) setPump(on);
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

    const scalarWater = parsePercentage(payload) ?? parsePercentage(message);
    if (/water|reservoir/i.test(topic) && scalarWater !== null) {
      setWater(scalarWater);
      return;
    }
    if (!payload || typeof payload !== 'object') return;
    const water = payload.water_level ?? payload.waterLevel ?? payload.waterLevelPercent
      ?? payload.water_level_percent ?? payload.water_percent ?? payload.water ?? payload.level ?? payload.w;
    const waterPercent = parsePercentage(water);
    if (waterPercent !== null) setWater(waterPercent);
    if (payload.status_pump !== undefined || payload.pump !== undefined) {
      const on = window.SmartPotPumpSignal.parse(payload);
      if (on !== null) setPump(on);
    }
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
    sessionStorage.removeItem(MANUAL_DISCONNECT_KEY);
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
    const profileId = els['broker-profile'].value;
    const clientId = `SmartPotWeb_${Math.random().toString(16).slice(2, 12)}`;
    const client = window.mqtt.connect(url, {
      clientId,
      username: els['broker-username'].value.trim() || undefined,
      password: els['broker-password'].value || undefined,
      protocolVersion: 4,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 3000,
      keepalive: 30
    });
    state.client = client;
    client.on('connect', () => {
      if (state.client !== client) return;
      saveConnectedProfile(profileId);
      els['connect-button'].disabled = true;
      els['disconnect-button'].disabled = false;
      setConnection('live', 'Terhubung ke EMQX', `Profil ${profileId === 'tdr2' ? 'TDR2' : 'SmartPot Web Panel'} tersimpan. Koneksi dipulihkan otomatis setelah refresh.`);
      client.subscribe('smartpot/#', { qos: 1 }, (error) => {
        if (error) setConnection('error', 'Gagal berlangganan', 'User EMQX perlu izin baca topik smartpot/#.');
      });
    });
    client.on('message', (topic, raw) => { if (state.client === client) handleMessage(topic, raw); });
    client.on('reconnect', () => state.client === client && setConnection('offline', 'Menghubungkan ulang…', 'Sesi MQTT mencoba tersambung kembali.'));
    client.on('offline', () => state.client === client && setConnection('offline', 'Broker tidak tersambung', 'Periksa alamat WSS, jaringan, username, dan password.'));
    client.on('error', (error) => {
      if (state.client !== client) return;
      setConnection('error', 'Koneksi gagal', error && error.message ? error.message : 'Periksa alamat WSS dan autentikasi EMQX.');
      els['connect-button'].disabled = false;
    });
    client.on('close', () => {
      if (state.client !== client) return;
      if (state.client) setConnection('offline', 'Terputus', 'Koneksi MQTT ditutup.');
      els['connect-button'].disabled = false;
      els['disconnect-button'].disabled = true;
    });
  });
  window.addEventListener('smartpot:collect-report', event => {
    event.detail.device = { profile: els['broker-profile'].value, schedules: state.schedules.map(row => ({...row})), watering: pruneHistory(state.wateringHistory).map(row => ({...row})), growLight: pruneHistory(state.growLightHistory).map(row => ({...row})) };
  });
  window.addEventListener('smartpot:logout', disconnect);
  els['disconnect-button'].addEventListener('click', () => {
    sessionStorage.setItem(MANUAL_DISCONNECT_KEY, '1');
    disconnect();
  });
  function resetProfileView() {
    pumpVisual.reset();
    state.previewOn = false;
    window.clearTimeout(state.previewTimer);
    state.lightOn = null; state.rgb = null; state.water = null;
    state.schedules = []; state.wateringHistory = []; state.growLightHistory = [];
    state.wateringPage = 1; state.growLightPage = 1;
    setPump(false);
    els['scene-wrap'].classList.remove('light-on','water-low');
    els['water-status-panel'].classList.remove('water-low');
    ['light-heading','pump-heading'].forEach(key => { els[key].textContent = 'Menunggu data'; });
    els['light-state'].textContent = 'Menunggu status grow light';
    els['pump-state'].textContent = 'Menunggu status pompa';
    els['water-value'].textContent = '—%';
    els['scene-water-level'].textContent = '—%';
    els['water-meter-fill'].style.width = '0%';
    els['water-warning'].textContent = '';
    els['rgb-value'].textContent = 'RGB —';
    els['light-status-note'].textContent = 'Menunggu pesan profil terpilih';
    els['last-topic'].textContent = 'Belum ada pesan';
    els['last-message-time'].textContent = '—';
    els['schedule-source'].textContent = 'Menunggu snapshot MQTT';
    els['schedule-source'].classList.remove('is-live');
    restoreDeviceState(); renderSchedules(); restoreHistory();
  }
  els['broker-profile'].addEventListener('change', (event) => {
    disconnect();
    catalogReady=false;
    if(catalogRequest)catalogRequest.abort();
    catalogRequest=null;
    applyMqttProfile(event.target.value);
    resetProfileView();
    window.dispatchEvent(new CustomEvent('smartpot:mqtt-profile', { detail: { profile: event.target.value } }));
    loadCatalog();
    els['connection-form'].requestSubmit();
  });
  const selectedProfile = restoreConnectedProfile();
  els['broker-profile'].value = selectedProfile;
  applyMqttProfile(selectedProfile);
  window.dispatchEvent(new CustomEvent('smartpot:mqtt-profile', { detail: { profile: selectedProfile, initial: true } }));
  els['light-state'].textContent = 'Menunggu status grow light';
  els['pump-state'].textContent = 'Menunggu status pompa';
  els['water-value'].textContent = '—%';
  restoreDeviceState();
  renderSchedules();
  restoreHistory();
  loadCatalog();
  window.setInterval(loadCatalog,15000);
  if (sessionStorage.getItem(MANUAL_DISCONNECT_KEY) !== '1') {
    window.addEventListener('load', () => els['connection-form'].requestSubmit(), { once: true });
  }
  window.setInterval(() => {
    renderHistory();
    persistHistory();
  }, 60 * 1000);
})();
