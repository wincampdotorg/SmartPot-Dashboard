const test = require('node:test');
const assert = require('node:assert/strict');
const csv = require('../v2/csv-core.js');

const HOUR = 3600000;
// 6 November 2026 00:00 WIB = 5 November 2026 17:00 UTC.
const DAY = Date.UTC(2026, 10, 5, 17, 0, 0);

test('waktu memakai WIB (UTC+7)', () => {
  assert.equal(csv.wibDateTime(DAY), '2026-11-06 00:00:00');
  assert.equal(csv.wibDateTime(DAY - 1000), '2026-11-05 23:59:59');
  assert.equal(csv.wibClock(DAY + 13 * HOUR + 5 * 60000), '13:05');
});

test('angka: titik untuk standar, koma untuk Excel Indonesia', () => {
  assert.equal(csv.formatNumber(45.678), '45.68');
  assert.equal(csv.formatNumber(45.678, ','), '45,68');
  assert.equal(csv.formatNumber(100), '100');
  assert.equal(csv.formatNumber(40.5, ','), '40,5');
  assert.equal(csv.formatNumber(-0.001), '0');
  assert.equal(csv.formatNumber(null), '');
  assert.equal(csv.formatNumber(''), '');
  assert.equal(csv.formatNumber('abc'), '');
});

test('escape RFC 4180 dan netralisasi rumus', () => {
  assert.equal(csv.escapeCell('a,b', 'standar'), '"a,b"');
  assert.equal(csv.escapeCell('a,b', 'excel'), 'a,b');
  assert.equal(csv.escapeCell('a;b', 'excel'), '"a;b"');
  assert.equal(csv.escapeCell('kata "kutip"', 'standar'), '"kata ""kutip"""');
  assert.equal(csv.escapeCell('baris\nbaru', 'standar'), '"baris\nbaru"');
  assert.equal(csv.escapeCell('=1+1', 'standar'), "'=1+1");
  assert.equal(csv.escapeCell('+62', 'standar'), "'+62");
  assert.equal(csv.escapeCell('-x', 'standar'), "'-x");
  assert.equal(csv.escapeCell('@cmd', 'standar'), "'@cmd");
  assert.equal(csv.escapeCell('=SUM(A1,A2)', 'standar'), '"\'=SUM(A1,A2)"');
  assert.equal(csv.escapeCell(-1.5, 'excel'), '-1,5', 'angka negatif tetap angka');
  assert.equal(csv.escapeCell(null, 'standar'), '');
});

test('buildCsv: pemisah, BOM, dan CRLF', () => {
  const standard = csv.buildCsv(['a', 'b'], [[1.5, 'x'], [null, 'y']], 'standar');
  assert.equal(standard, 'a,b\r\n1.5,x\r\n,y\r\n');
  const excel = csv.buildCsv(['a', 'b'], [[1.5, 'x']], 'excel');
  assert.equal(excel, '﻿a;b\r\n1,5;x\r\n');
  assert.equal(csv.buildCsv(['a'], [], 'tidak-dikenal'), 'a\r\n', 'format tak dikenal memakai CSV standar');
});

test('sensorRows: urut naik, kolom sesuai header', () => {
  const rows = csv.sensorRows([
    { ts: DAY + 60000, device_id: 'smartpot-tdr2', soil_moisture: '41.2', temperature: 27.1, humidity: 60, water_level: 55, battery: 99 },
    { ts: DAY, soil_moisture: 42, temperature: null, humidity: 61, water_level: 56, battery: null }
  ], { source: 'device', deviceId: 'cadangan' });
  assert.equal(csv.SENSOR_HEADERS.length, rows[0].length);
  assert.deepEqual(rows[0], ['2026-11-06 00:00:00', 'cadangan', 'alat', 42, null, 61, 56, null]);
  assert.deepEqual(rows[1], ['2026-11-06 00:01:00', 'smartpot-tdr2', 'alat', 41.2, 27.1, 60, 55, 99]);
  assert.equal(csv.sensorRows([{ ts: DAY, soil_moisture: 1 }], { source: 'simulation' })[0][2], 'simulasi');
  assert.equal(csv.sensorRows([{ ts: DAY, soil_moisture: 1, data_source: 'isian_simulasi_tdr2' }], { source: 'device' })[0][2], 'isian_simulasi_tdr2', 'data_source dari database diutamakan');
  const text = csv.buildCsv(csv.SENSOR_HEADERS, rows, 'excel');
  assert.ok(text.startsWith('﻿waktu_wib;device_id;sumber_data;tanah_pct;suhu_c;udara_pct;air_pct;baterai_pct\r\n'));
  assert.ok(text.includes('2026-11-06 00:01:00;smartpot-tdr2;alat;41,2;27,1;60;55;99\r\n'));
});

test('validReadings: buang tanah 0 dan deretan tanah == air >= 10 baris', () => {
  const records = [];
  for (let i = 0; i < 12; i += 1) records.push({ ts: DAY + i * 60000, soil_moisture: 30, water_level: 30 });
  for (let i = 12; i < 21; i += 1) records.push({ ts: DAY + i * 60000, soil_moisture: 25, water_level: 25 });
  records.push({ ts: DAY + 21 * 60000, soil_moisture: 0, water_level: 50 });
  records.push({ ts: DAY + 22 * 60000, soil_moisture: 101, water_level: 50 });
  records.push({ ts: DAY + 23 * 60000, soil_moisture: 44, water_level: 50 });
  // Dua deret berbeda nilai tetap dihitung sebagai satu deret tanah == air (21 baris).
  const valid = csv.validReadings(records);
  assert.deepEqual(valid.map(r => r.soil), [44]);
  const shortRun = [];
  for (let i = 0; i < 9; i += 1) shortRun.push({ ts: DAY + i * 60000, soil_moisture: 30, water_level: 30 });
  assert.equal(csv.validReadings(shortRun).length, 9, 'deret < 10 baris tetap valid');
});

test('hourlyActual: median dalam +/-5 menit dari jam bulat, hanya di dalam hari', () => {
  const records = [
    { ts: DAY - 4 * 60000, soil_moisture: 40, water_level: 80 },
    { ts: DAY + 2 * 60000, soil_moisture: 50, water_level: 80 },
    { ts: DAY + 5 * 60000, soil_moisture: 60, water_level: 80 },
    { ts: DAY + 6 * 60000, soil_moisture: 99, water_level: 80 },
    { ts: DAY + HOUR + 60000, soil_moisture: 35, water_level: 80 }
  ];
  const values = csv.hourlyActual(records, DAY, 3);
  assert.deepEqual(values, [55, 35, null], 'bacaan sebelum awal hari tidak dihitung');
  const twice = [{ ts: DAY + 30000, soil_moisture: 10, water_level: 80 }, { ts: DAY + 45000, soil_moisture: 20, water_level: 80 }];
  assert.deepEqual(csv.hourlyActual(twice, DAY, 1), [20], 'baris terakhir dalam satu menit yang dipakai');
});

function sampleComparison() {
  const ruleStart = DAY - 24 * HOUR;
  return {
    method: 'replay_harian_v1', threshold_pct: 40,
    rule_day: { date: '2026-11-05', start: ruleStart, end: DAY, would_water: [{ at: ruleStart + 7 * HOUR + 12 * 60000, soil_pct: 39.5 }, { at: ruleStart + 7 * HOUR + 50 * 60000, soil_pct: 38 }] },
    ai_day: {
      date: '2026-11-06', start: DAY, end: DAY + 24 * HOUR,
      planned_waterings: [{ at: DAY + 9 * HOUR + 30 * 60000, predicted_soil_pct: 40 }],
      rule_on_actual: { would_water: [{ at: DAY + 10 * HOUR + 5 * 60000, soil_pct: 39 }] },
      forecast_vs_actual: [{ at: DAY, predicted_pct: 55.25, actual_pct: 54 }, { at: DAY + HOUR, predicted_pct: 54.5, actual_pct: null }]
    }
  };
}

test('comparisonRows: 24 baris aturan + 24 baris AI', () => {
  const records = [{ ts: DAY - 24 * HOUR + 60000, soil_moisture: 61, water_level: 90 }, { ts: DAY + HOUR - 60000, soil_moisture: 53, water_level: 90 }, { ts: DAY + 2 * HOUR + 60000, soil_moisture: 52, water_level: 90 }];
  const rows = csv.comparisonRows(sampleComparison(), records);
  assert.equal(rows.length, 48);
  assert.equal(rows[0].length, csv.COMPARISON_HEADERS.length);
  assert.deepEqual(rows[0], ['2026-11-05', '00:00', 'aturan', 61, null, 0, null]);
  assert.deepEqual(rows[7], ['2026-11-05', '07:00', 'aturan', null, null, 2, null]);
  assert.deepEqual(rows[24], ['2026-11-06', '00:00', 'ai', 54, 55.25, 0, 0]);
  assert.deepEqual(rows[25], ['2026-11-06', '01:00', 'ai', null, 54.5, 0, 0], 'titik server dipakai apa adanya');
  assert.deepEqual(rows[26], ['2026-11-06', '02:00', 'ai', 52, null, 0, 0], 'jam tanpa titik server diisi dari telemetry');
  assert.equal(csv.ruleActualHours(rows), 1);
  assert.equal(csv.ruleActualHours(csv.comparisonRows(sampleComparison(), [])), 0);
  assert.deepEqual(rows[33], ['2026-11-06', '09:00', 'ai', null, null, 0, 1]);
  assert.deepEqual(rows[34], ['2026-11-06', '10:00', 'ai', null, null, 1, 0]);
});

test('comparisonRows: perbandingan kosong atau error menghasilkan nol baris', () => {
  assert.deepEqual(csv.comparisonRows(null), []);
  assert.deepEqual(csv.comparisonRows({ error: 'data kurang' }), []);
  assert.deepEqual(csv.comparisonRows({ rule_day: {} }), []);
  const onlyAi = sampleComparison(); delete onlyAi.rule_day;
  assert.equal(csv.comparisonRows(onlyAi).length, 24);
});

test('nama file memuat profil, sumber, jenis data, dan tanggal WIB', () => {
  assert.equal(csv.filename({ profile: 'tdr2', source: 'device', dataset: 'sensor', at: DAY + 3 * HOUR }), 'smartpot_tdr2_alat_sensor_20261106_WIB.csv');
  assert.equal(csv.filename({ profile: 'web-panel', source: 'simulation', dataset: 'perbandingan', at: DAY - 1000 }), 'smartpot_web-panel_simulasi_perbandingan_20261105_WIB.csv');
  assert.equal(csv.filename({ profile: '../x', source: 'device', dataset: 'sensor', at: DAY }), 'smartpot_x_alat_sensor_20261106_WIB.csv');
});
