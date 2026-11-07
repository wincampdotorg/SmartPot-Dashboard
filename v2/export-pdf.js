(() => {
  'use strict';
  if (!window.SmartPotAuth?.authenticated) return;
  const dialog = document.getElementById('pdf-export');
  const report = document.getElementById('pdf-report');
  const date = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const fmt = value => Number.isFinite(value) ? number.format(value) : '—';
  const when = value => Number.isFinite(Number(value)) ? `${date.format(new Date(Number(value)))} WIB` : '—';
  function node(tag, text, parent = report, className) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (className) el.className = className;
    parent.append(el);
    return el;
  }
  function table(headers, rows, parent = report) {
    const el = node('table', null, parent);
    const tr = node('tr', null, node('thead', null, el));
    headers.forEach(text => { node('th', text, tr).scope = 'col'; });
    const tbody = node('tbody', null, el);
    if (!rows.length) {
      const cell = node('td', 'Belum ada data dalam periode ini.', node('tr', null, tbody));
      cell.colSpan = headers.length;
    }
    rows.forEach(row => { const tr = node('tr', null, tbody); row.forEach(value => node('td', String(value ?? '—'), tr)); });
  }
  const enabled = value => value === true || value === 1 || /^(on|true|1)$/i.test(String(value));
  function buildReport() {
    const snapshot = {};
    window.dispatchEvent(new CustomEvent('smartpot:collect-report', { detail: snapshot }));
    const sensors = snapshot.sensors || { records: [], hours: 72, simulation: false };
    const device = snapshot.device || { schedules: [], watering: [], growLight: [] };
    const rows = sensors.records;
    const now = Date.now();
    const cutoff = now - sensors.hours * 3600000;
    const inRange = event => Number(event.timestamp) >= cutoff && Number(event.timestamp) <= now;
    report.replaceChildren();
    const heading = node('header', null, report, 'pdf-heading');
    const logo = node('img', null, heading); logo.src = 'assets/smartpot-mark.svg'; logo.alt = '';
    const title = node('div', null, heading);
    node('p', 'SMARTPOT · LAPORAN PEMANTAUAN', title, 'pdf-overline');
    node('h1', 'Riwayat tanaman & perangkat', title);
    const metadata = node('div', null, report, 'pdf-metadata');
    node('p', `Profil: ${device.profile === 'tdr2' ? 'TDR2' : 'SmartPot Web Panel'} · Periode: ${sensors.hours} jam terakhir`, metadata);
    node('p', `Data sensor: ${sensors.simulation ? 'SIMULASI' : sensors.fill ? 'DATA ALAT + ISIAN SIMULASI' : 'DATA ALAT (tanpa isian simulasi)'} · ${rows.length.toLocaleString('id-ID')} catatan · Sumber: MySQL OVH / MQTT`, metadata);
    node('p', `Dibuat: ${when(now)}`, metadata);
    if (rows.length) node('p', `Rentang pembacaan: ${when(rows[0].ts)} — ${when(rows[rows.length-1].ts)}`, metadata);
    node('p', sensors.simulation ? 'Data sensor pada laporan ini merupakan simulasi. Jadwal dan riwayat aktuator di bawah berasal dari profil MQTT alat yang dipilih.' : 'Data sensor berasal dari telemetry alat; pembacaan belum tersedia ditandai dengan —. Status koneksi broker tidak membuktikan alat sedang online.', report, 'pdf-note');
    if (sensors.error) node('p', 'Pembaruan database terakhir gagal. Laporan memakai data terakhir yang tersedia di dashboard.', report, 'pdf-note');
    node('h2', 'Ringkasan sensor');
    const metrics = [['soil_moisture','Kelembapan tanah','%'],['temperature','Suhu','°C'],['humidity','Kelembapan udara','%'],['water_level','Level air','%'],['battery','Baterai','%']];
    table(['Parameter','Terakhir','Minimum','Maksimum','Rata-rata'], metrics.map(([key,label,unit]) => {
      const values = rows.map(row => row[key]).filter(Number.isFinite);
      return [label, `${fmt(rows[rows.length-1]?.[key])} ${unit}`, `${fmt(values.length ? Math.min(...values) : null)} ${unit}`, `${fmt(values.length ? Math.max(...values) : null)} ${unit}`, `${fmt(values.length ? values.reduce((a,b)=>a+b,0)/values.length : null)} ${unit}`];
    }));
    if (rows.length) {
      const figure = node('figure', null, report, 'pdf-figure');
      node('h2', `Grafik ${sensors.metricLabel || 'sensor'}`, figure);
      const svg = document.getElementById('trend-chart').cloneNode(true);
      svg.id = 'pdf-sensor-chart';
      svg.querySelectorAll('.chart-cursor,.chart-x-guide').forEach(el=>el.remove());
      const ids = new Map();
      svg.querySelectorAll('[id]').forEach(el=>{ const old=el.id; el.id=`pdf-${old}`; ids.set(old,el.id); });
      svg.querySelectorAll('*').forEach(el=>{ for (const attr of ['fill','stroke','filter','clip-path']) { let v=el.getAttribute(attr); if(v) { for(const [old,id] of ids) v=v.replace(`url(#${old})`,`url(#${id})`); el.setAttribute(attr,v); } } });
      figure.append(svg);
      node('figcaption', `${when(rows[0].ts)} — ${when(rows[rows.length-1].ts)}`, figure);
    }
    node('h2', 'Jadwal harian · data alat');
    node('p', 'Jadwal berlaku berulang setiap hari. Penyiraman bergantung pada ketersediaan air di alat.', report, 'pdf-note');
    table(['Waktu WIB','Penyiraman','Grow light'], [...device.schedules].sort((a,b)=>String(a.time).localeCompare(String(b.time))).map(row=>[row.time, enabled(row.status_pump ?? row.pumpOn) ? 'Aktif' : 'Tidak aktif', enabled(row.growLight ?? row.grow_light) ? 'Menyala' : 'Mati']));
    const watering = device.watering.filter(inRange);
    node('h2', `Riwayat penyiraman · ${watering.length} catatan`);
    table(['Waktu WIB','Pemicu','Level air','Hasil'], watering.map(row=>{
      const level = row.waterLevel == null ? null : Number(row.waterLevel);
      return [when(row.timestamp), row.source === 'android_manual' ? 'Tombol Pump' : row.source === 'mqtt_device' ? 'Perangkat / MQTT' : 'Jadwal otomatis', level === null ? '—' : `${fmt(level)}%`, level === null ? 'Level air tidak tersedia' : level<=20 ? 'Air Rendah' : 'Sukses Menyiram'];
    }));
    const light = device.growLight.filter(inRange);
    node('h2', `Riwayat grow light · ${light.length} catatan`);
    table(['Waktu WIB','Status','Warna RGB'],light.map(row=>[when(row.timestamp), enabled(row.state) ? 'Menyala' : 'Mati', `${row.red ?? '—'}, ${row.green ?? '—'}, ${row.blue ?? '—'}`]));
    const ai = snapshot.ai;
    if (ai?.run) {
      node('h2', 'Prediksi AI & jadwal rekomendasi');
      node('p', `${ai.source === 'simulation' ? 'SIMULASI HISTORIS' : 'DATA ALAT'} · Regresi ridge multivariat · Latihan hingga 14 hari · Mode rekomendasi, tanpa eksekusi pompa.`, report, 'pdf-note');
      node('p', ai.run.report.reason, report, 'pdf-note');
      node('h3', `Rekomendasi jadwal besok · ${ai.tomorrow_date || '—'}`);
      node('p', 'Rencana awal dari pola aktivitas 24 jam; bukan prediksi kelembapan 24 jam. Tidak menjalankan aktuator.', report, 'pdf-note');
      table(['Jam WIB','Aksi','Pendukung','Status'], (ai.daily_plan || []).map(row => [`${String(row.hour).padStart(2,'0')}.${String(row.minute).padStart(2,'0')}`,row.action==='pump'?'Pump':row.action==='pump_grow_light'?'Pump + Grow light ON':`Grow light ${row.light_state?'ON':'OFF'}`,`${row.sample_count} event`,row.status]));
      table(['Horizon','Waktu WIB','Prediksi tanah'], ai.predictions.map(row => [`${row.horizon_minutes} menit`,when(row.predicted_for),`${fmt(row.predicted_pct)}%`]));
      table(['Catatan','Usulan waktu WIB','Status','Alasan'], ai.schedules.map(row => [`#${row.id}`,row.proposed_at == null ? 'Belum ditentukan' : when(row.proposed_at),row.status,row.reason]));
    }
    const cmp = snapshot.comparison;
    if (cmp) {
      const day = (value, digits = true) => value == null || !Number.isFinite(Number(value)) ? '—' : digits ? `${fmt(Number(value))}%` : String(value);
      const hm = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const clock = list => (Array.isArray(list) && list.length) ? list.map(item => hm.format(new Date(Number(item.at)))).join(', ') : 'Tidak ada';
      const rule = cmp.rule_day || {}, aiDay = cmp.ai_day;
      node('h2', 'Aturan sensor vs prediksi AI');
      node('p', `Mode bayangan, tanpa perintah pompa. Ambang ${day(cmp.threshold_pct)}, konfirmasi ${cmp.confirm_readings ?? 3} pembacaan, jeda ${cmp.cooldown_minutes ?? 30} menit, maksimal ${cmp.max_waterings_per_day ?? 8} kali per hari.`, report, 'pdf-note');
      table(['Ukuran', `Aturan · ${rule.date || '—'}`, `AI · ${aiDay.date || '—'}`], [
        ['Cakupan data', day(rule.coverage_pct), day(aiDay.coverage_pct)],
        ['Menit valid', day(rule.valid_minutes, false), day(aiDay.valid_minutes, false)],
        ['Tanah min / rata-rata / maks', `${day(rule.soil_min)} / ${day(rule.soil_avg)} / ${day(rule.soil_max)}`, `${day(aiDay.soil_min)} / ${day(aiDay.soil_avg)} / ${day(aiDay.soil_max)}`],
        ['Menit di bawah ambang', day(rule.minutes_below_threshold, false), day(aiDay.minutes_below_threshold, false)],
        ['Waktu siram aturan (data nyata)', clock(rule.would_water), clock(aiDay.rule_on_actual?.would_water)],
        ['Waktu siram rencana AI', '—', clock(aiDay.planned_waterings)],
        ['MAE model / persistensi', '—', `${fmt(aiDay.mae_pct == null ? NaN : Number(aiDay.mae_pct))} / ${fmt(aiDay.persistence_mae_pct == null ? NaN : Number(aiDay.persistence_mae_pct))} poin`],
        ['Pompa menyala (catatan alat)', day(rule.actual_pump_on, false), day(aiDay.actual_pump_on, false)]
      ]);
      if (cmp.verdict?.text) node('p', `Kesimpulan: ${cmp.verdict.text}`, report, 'pdf-note');
      if (cmp.tomorrow) node('p', `Rencana ${cmp.tomorrow.date || 'besok'}: ${clock(cmp.tomorrow.planned_waterings)}.`, report, 'pdf-note');
      (Array.isArray(cmp.notes) ? cmp.notes : []).forEach(text => node('p', `Catatan: ${text}`, report, 'pdf-note'));
    }
    node('h2', `Seluruh data sensor · ${rows.length.toLocaleString('id-ID')} catatan`);
    node('p', 'Urutan terbaru ke terlama. Semua catatan yang dimuat untuk profil dan periode terpilih disertakan, bukan hanya halaman tabel yang sedang tampil. Maksimal 5.000 catatan sesuai batas API.', report, 'pdf-note');
    table(['Waktu WIB','Suhu °C','Udara %','Tanah %','Air %','Baterai %'], [...rows].reverse().map(row=>[when(row.ts), ...['temperature','humidity','soil_moisture','water_level','battery'].map(key=>fmt(row[key]))]));
    node('footer', 'SmartPot · Waktu Asia/Jakarta (WIB) · Laporan dibuat dari data yang tersedia saat ekspor.', report, 'pdf-footer');
    document.getElementById('pdf-report-info').textContent = `${rows.length.toLocaleString('id-ID')} data sensor · ${sensors.hours} jam · ${sensors.simulation ? 'Simulasi' : 'Data alat'}. Pilih Simpan sebagai PDF pada dialog cetak.`;
  }
  document.getElementById('export-pdf').addEventListener('click', () => { buildReport(); dialog.showModal(); });
  document.getElementById('pdf-save').addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', () => {
    if (!dialog.open) return;
    document.body.classList.add('pdf-printing');
    document.body.append(report);
  });
  window.addEventListener('afterprint', () => {
    if (!document.body.classList.contains('pdf-printing')) return;
    dialog.append(report);
    document.body.classList.remove('pdf-printing');
  });
  document.getElementById('pdf-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => report.replaceChildren());
})();
