// Logika murni pembuatan CSV SmartPot. Dapat dipakai di browser (window.SmartPotCsv) dan Node (require).
(function(root) {
  'use strict';
  const MINUTE = 60000;
  const HOUR = 60 * MINUTE;
  const WIB_OFFSET = 7 * HOUR;
  const FORMATS = {
    standar: { separator: ',', decimal: '.', bom: false, label: 'CSV standar' },
    excel: { separator: ';', decimal: ',', bom: true, label: 'CSV Excel Indonesia' }
  };
  const SENSOR_HEADERS = ['waktu_wib', 'device_id', 'sumber_data', 'tanah_pct', 'suhu_c', 'udara_pct', 'air_pct', 'baterai_pct'];
  const COMPARISON_HEADERS = ['tanggal', 'jam_wib', 'hari', 'tanah_aktual_pct', 'prediksi_ai_pct', 'aturan_siram', 'ai_siram'];

  const pad = (value, size = 2) => String(value).padStart(size, '0');
  function wibParts(ms) {
    const d = new Date(Number(ms) + WIB_OFFSET);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), ss: d.getUTCSeconds() };
  }
  function wibDate(ms) { const p = wibParts(ms); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; }
  function wibDateTime(ms) { const p = wibParts(ms); return `${wibDate(ms)} ${pad(p.hh)}:${pad(p.mm)}:${pad(p.ss)}`; }
  function wibClock(ms) { const p = wibParts(ms); return `${pad(p.hh)}:${pad(p.mm)}`; }
  function wibCompactDate(ms) { return wibDate(ms).replace(/-/g, ''); }

  const finite = value => value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value));

  function formatNumber(value, decimal = '.', digits = 2) {
    if (!finite(value)) return '';
    const factor = 10 ** digits;
    let rounded = Math.round(Number(value) * factor) / factor;
    if (Object.is(rounded, -0)) rounded = 0;
    let text = rounded.toFixed(digits);
    if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
    return decimal === ',' ? text.replace('.', ',') : text;
  }

  // Teks yang diawali = + - @ (atau tab/CR) dapat dibaca sebagai rumus oleh aplikasi spreadsheet.
  function neutralizeFormula(text) { return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; }

  function escapeCell(cell, format) {
    let text;
    if (cell === null || cell === undefined) text = '';
    else if (typeof cell === 'number') text = formatNumber(cell, format.decimal);
    else text = neutralizeFormula(String(cell));
    const needsQuotes = text.includes(format.separator) || /["\r\n]/.test(text);
    return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function resolveFormat(key) { return FORMATS[key] || FORMATS.standar; }

  function buildCsv(headers, rows, formatKey) {
    const format = resolveFormat(formatKey);
    const lines = [headers, ...rows].map(row => row.map(cell => escapeCell(cell, format)).join(format.separator));
    return `${format.bom ? '\uFEFF' : ''}${lines.join('\r\n')}\r\n`;
  }

  const numberOrNull = value => finite(value) ? Number(value) : null;

  // sumber_data memakai data_source dari database bila ada, sehingga baris isian simulasi tetap terbedakan dari data alat.
  function sensorRows(records, options = {}) {
    const label = options.source === 'simulation' ? 'simulasi' : 'alat';
    return (Array.isArray(records) ? records : [])
      .filter(row => row && Number.isFinite(Number(row.ts)))
      .slice()
      .sort((a, b) => Number(a.ts) - Number(b.ts))
      .map(row => [
        wibDateTime(Number(row.ts)), row.device_id || options.deviceId || '', row.data_source || label,
        numberOrNull(row.soil_moisture), numberOrNull(row.temperature), numberOrNull(row.humidity),
        numberOrNull(row.water_level), numberOrNull(row.battery)
      ]);
  }

  // Pembacaan valid: 0 < tanah <= 100 dan bukan bagian dari >= 10 baris berurutan dengan tanah == level air.
  // Sama dengan server: waktu dibulatkan ke bawah per menit dan baris terakhir pada menit yang sama dipakai.
  function validReadings(records) {
    const rows = (Array.isArray(records) ? records : [])
      .map(row => ({ ts: Number(row && row.ts), soil: numberOrNull(row && row.soil_moisture), water: numberOrNull(row && row.water_level) }))
      .filter(row => Number.isFinite(row.ts))
      .sort((a, b) => a.ts - b.ts);
    const stuck = new Array(rows.length).fill(false);
    let runStart = 0;
    for (let i = 0; i <= rows.length; i += 1) {
      const same = i < rows.length && rows[i].soil !== null && rows[i].water !== null && Math.abs(rows[i].soil - rows[i].water) < 1e-9;
      if (same) continue;
      if (i - runStart >= 10) for (let j = runStart; j < i; j += 1) stuck[j] = true;
      runStart = i + 1;
    }
    const perMinute = new Map();
    rows.forEach((row, index) => {
      if (row.soil !== null && row.soil > 0 && row.soil <= 100 && !stuck[index]) {
        const ts = Math.floor(row.ts / MINUTE) * MINUTE;
        perMinute.set(ts, { ts, soil: row.soil });
      }
    });
    return [...perMinute.values()];
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // Median pembacaan valid dalam +/-5 menit dari setiap jam bulat; hanya pembacaan di dalam hari itu (sama dengan server).
  function hourlyActual(records, start, hours = 24) {
    const end = start + hours * HOUR;
    const valid = validReadings(records).filter(row => row.ts >= start && row.ts < end);
    return Array.from({ length: hours }, (_, index) => {
      const at = start + index * HOUR;
      return median(valid.filter(row => Math.abs(row.ts - at) <= 5 * MINUTE).map(row => row.soil));
    });
  }

  function countInHour(list, at) {
    return (Array.isArray(list) ? list : []).filter(item => Number(item && item.at) >= at && Number(item.at) < at + HOUR).length;
  }

  function usableComparison(comparison) {
    return Boolean(comparison && typeof comparison === 'object' && !comparison.error && comparison.ai_day && Number.isFinite(Number(comparison.ai_day.start)));
  }

  // Baris per jam untuk hari aturan dan hari AI. Nilai aktual hari aturan diambil dari telemetry yang diberikan.
  function comparisonRows(comparison, records = []) {
    if (!usableComparison(comparison)) return [];
    const rows = [];
    const ruleDay = comparison.rule_day;
    if (ruleDay && Number.isFinite(Number(ruleDay.start))) {
      const start = Number(ruleDay.start);
      const actual = hourlyActual(records, start);
      for (let i = 0; i < 24; i += 1) {
        const at = start + i * HOUR;
        rows.push([wibDate(at), wibClock(at), 'aturan', actual[i], null, countInHour(ruleDay.would_water, at), null]);
      }
    }
    const aiDay = comparison.ai_day;
    const start = Number(aiDay.start);
    const fallback = hourlyActual(records, start);
    const points = new Map((aiDay.forecast_vs_actual || []).map(point => [Number(point.at), point]));
    for (let i = 0; i < 24; i += 1) {
      const at = start + i * HOUR;
      const point = points.get(at);
      // Titik dari server dipakai apa adanya agar sama dengan MAE yang ditampilkan; telemetry hanya mengisi jam tanpa titik.
      const actual = point ? numberOrNull(point.actual_pct) : fallback[i];
      rows.push([wibDate(at), wibClock(at), 'ai', actual, point ? numberOrNull(point.predicted_pct) : null,
        countInHour(aiDay.rule_on_actual && aiDay.rule_on_actual.would_water, at), countInHour(aiDay.planned_waterings, at)]);
    }
    return rows;
  }

  // Jumlah jam hari aturan yang punya nilai aktual (0 berarti telemetry tidak mencakup hari aturan).
  function ruleActualHours(rows) {
    return (Array.isArray(rows) ? rows : []).filter(row => row[2] === 'aturan' && row[3] !== null).length;
  }

  function filename({ profile, source, dataset, at = Date.now() }) {
    const safe = value => String(value || '').toLowerCase().replace(/[^a-z0-9-]+/g, '') || 'data';
    return `smartpot_${safe(profile)}_${source === 'simulation' ? 'simulasi' : 'alat'}_${safe(dataset)}_${wibCompactDate(at)}_WIB.csv`;
  }

  const api = {
    FORMATS, SENSOR_HEADERS, COMPARISON_HEADERS, HOUR,
    wibDate, wibDateTime, wibClock, formatNumber, escapeCell: (cell, key) => escapeCell(cell, resolveFormat(key)),
    buildCsv, sensorRows, validReadings, hourlyActual, comparisonRows, ruleActualHours, usableComparison, filename
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmartPotCsv = api;
})(globalThis);
