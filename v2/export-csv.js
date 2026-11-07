// Ekspor CSV: data sensor periode terpilih dan perbandingan aturan vs AI per jam.
(() => {
  'use strict';
  if (!window.SmartPotAuth?.authenticated) return;
  const core = window.SmartPotCsv;
  const byId = id => document.getElementById(id);
  const dialog = byId('csv-export');
  const form = byId('csv-form');
  const status = byId('csv-status');
  const save = byId('csv-save');
  const compareInput = byId('csv-dataset-compare');
  const FORMAT_KEY = 'smartpot-csv-format';
  const integer = new Intl.NumberFormat('id-ID');
  let busy = false;

  const context = () => ({ profile: byId('broker-profile').value || 'tdr2', source: byId('history-source').value, hours: Number(byId('history-hours').value) || 72,
    isian: byId('history-fill').checked ? '1' : '0' });
  function snapshot() {
    const detail = {};
    window.dispatchEvent(new CustomEvent('smartpot:collect-report', { detail }));
    return detail;
  }
  function currentComparison() {
    const { payload, comparison } = window.SmartPotComparison?.current() || {};
    const { profile, source } = context();
    return comparison && payload?.profile === profile && payload?.source === source ? comparison : null;
  }
  const selected = name => form.querySelector(`input[name="${name}"]:checked`)?.value;
  function savedFormat() {
    try { const value = localStorage.getItem(FORMAT_KEY); if (core.FORMATS[value]) return value; } catch (_) { /* Penyimpanan browser tidak tersedia. */ }
    return /^id\b/i.test(navigator.language || '') ? 'excel' : 'standar';
  }
  function rememberFormat(value) { try { localStorage.setItem(FORMAT_KEY, value); } catch (_) { /* Abaikan. */ } }

  function refresh() {
    const ctx = context();
    const loaded = snapshot().sensors?.records?.length || 0;
    byId('csv-sensor-info').textContent = `${ctx.hours} jam terakhir · ${ctx.source === 'simulation' ? 'simulasi' : ctx.isian === '1' ? 'data alat + isian simulasi' : 'data alat tanpa isian simulasi'} · ${integer.format(loaded)} baris tampil, diambil ulang dari database saat diunduh`;
    const comparison = currentComparison();
    compareInput.disabled = !comparison;
    byId('csv-compare-info').textContent = comparison
      ? `${comparison.rule_day?.date || '—'} (aturan) dan ${comparison.ai_day.date || '—'} (AI) · 48 baris per jam`
      : 'Perbandingan belum tersedia untuk profil dan sumber ini';
    if (compareInput.disabled && compareInput.checked) form.querySelector('input[name="csv-dataset"][value="sensor"]').checked = true;
    const dataset = selected('csv-dataset') === 'perbandingan' ? 'perbandingan' : 'sensor';
    byId('csv-filename').textContent = `Nama file: ${core.filename({ ...ctx, dataset })}`;
  }

  function download(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function exportCsv() {
    if (busy) return;
    const ctx = context();
    const dataset = selected('csv-dataset') === 'perbandingan' ? 'perbandingan' : 'sensor';
    const format = core.FORMATS[selected('csv-format')] ? selected('csv-format') : 'standar';
    rememberFormat(format);
    busy = true; save.disabled = true;
    status.textContent = 'Mengambil data dari database…';
    try {
      const filename = core.filename({ ...ctx, dataset });
      let text, count, note = '';
      if (dataset === 'perbandingan') {
        const comparison = currentComparison();
        if (!comparison) throw new Error('Perbandingan belum tersedia untuk profil dan sumber ini.');
        let records = [];
        try { records = (await window.SmartPotTelemetry.load({ ...ctx, hours: 72, isian: '1' })).rows; }
        catch (error) { note = ` ${error.message} Nilai aktual hari aturan dikosongkan.`; }
        const rows = core.comparisonRows(comparison, records);
        if (!note && !core.ruleActualHours(rows)) note = ' Telemetry 72 jam terakhir tidak mencakup hari aturan; kolom tanah aktual hari aturan kosong.';
        text = core.buildCsv(core.COMPARISON_HEADERS, rows, format);
        count = rows.length;
      } else {
        const telemetry = await window.SmartPotTelemetry.load(ctx);
        const rows = core.sensorRows(telemetry.rows, { source: ctx.source, deviceId: telemetry.deviceId });
        text = core.buildCsv(core.SENSOR_HEADERS, rows, format);
        count = rows.length;
        if (telemetry.truncated) note = ' Dibatasi 5.000 baris terbaru sesuai batas API.';
      }
      download(text, filename);
      status.textContent = `${integer.format(count)} baris diunduh sebagai ${filename}.${note}`;
    } catch (error) {
      status.textContent = `${error.message || 'Ekspor gagal.'} Coba lagi.`;
    } finally {
      busy = false; save.disabled = false;
    }
  }

  byId('export-csv').addEventListener('click', () => {
    const format = savedFormat();
    form.querySelector(`input[name="csv-format"][value="${format}"]`).checked = true;
    status.textContent = '';
    refresh();
    dialog.showModal();
  });
  form.addEventListener('change', refresh);
  form.addEventListener('submit', event => { event.preventDefault(); exportCsv(); });
  byId('csv-cancel').addEventListener('click', () => dialog.close());
})();
