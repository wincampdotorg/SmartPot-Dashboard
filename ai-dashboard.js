(() => {
  'use strict';
  if (!window.SmartPotAuth?.authenticated) return;
  const byId = id => document.getElementById(id);
  const profile = byId('broker-profile');
  const source = byId('history-source');
  const number = new Intl.NumberFormat('id-ID', {maximumFractionDigits:1});
  const date = new Intl.DateTimeFormat('id-ID', {timeZone:'Asia/Jakarta', day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const when = value => value == null ? 'Belum ditentukan' : `${date.format(new Date(value))} WIB`;
  const fmt = value => Number.isFinite(value) ? number.format(value) : '—';
  const labels = {ready:'Model tersedia', insufficient_data:'Data belum cukup', validation_failed:'Model belum lolos evaluasi', awaiting_calibration:'Menunggu kalibrasi', stale_data:'Data belum segar',low_water:'Air rendah',not_needed:'Belum perlu menyiram',recommendation:'Rekomendasi',simulation_recommendation:'Rekomendasi simulasi',simulation_plan:'Rencana simulasi',review_required:'Perlu ditinjau'};
  let controller, sequence = 0, currentReport = null, observedPage = 1, eventRefresh;
  const lastSignals = new Map();
  const actionLabel = row => row.action==='pump' ? 'Pump' : row.action==='pump_grow_light' ? 'Pump + Grow light ON' : `Grow light ${row.light_state?'ON':'OFF'}`;
  const clock = row => `${String(row.hour).padStart(2,'0')}.${String(row.minute).padStart(2,'0')}`;
  function cell(tag,text,parent) { const el=document.createElement(tag); el.textContent=text; if(tag==='th') el.scope='row'; parent.append(el); return el; }
  function rows(id, data, empty, columns) {
    const body=byId(id); body.replaceChildren();
    if(!data.length) {const row=cell('tr','',body);cell('td',empty,row).colSpan=columns;return;}
    data.forEach(values=>{const row=cell('tr','',body); values.forEach((value,index)=>cell(index===0?'th':'td',value,row));});
  }
  function chart(payload) {
    const svg=byId('ai-chart'); svg.replaceChildren();
    const predictions=payload.predictions, latest=payload.run?.report.latest;
    svg.hidden=!predictions.length || !latest || !Number.isFinite(latest.soil_moisture);
    svg.parentElement.hidden=svg.hidden;
    if(svg.hidden) return;
    const points=[{t:payload.run.data_as_of,value:latest.soil_moisture},...predictions.map(f=>({t:f.predicted_for,value:f.predicted_pct}))];
    const start=points[0].t, span=Math.max(1,points[points.length-1].t-start);
    const x=t=>60+(t-start)/span*690, y=v=>180-v*1.5;
    const add=(tag,attrs,text)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([key,value])=>el.setAttribute(key,String(value)));if(text)el.textContent=text;svg.append(el);return el;};
    [0,25,50,75,100].forEach(value=>{add('line',{x1:60,x2:750,y1:y(value),y2:y(value),stroke:'#e4eae4'});add('text',{x:12,y:y(value)+4},`${value}%`);});
    add('path',{d:points.map((p,i)=>`${i?'L':'M'}${x(p.t)} ${y(p.value)}`).join(' '),fill:'none',stroke:'#448564','stroke-width':3,'stroke-dasharray':'7 5'});
    points.forEach((point,index)=>{add('circle',{cx:x(point.t),cy:y(point.value),r:4,fill:index?'#448564':'#2b5679'});add('text',{x:x(point.t),y:207,'text-anchor':index===points.length-1?'end':index===0?'start':'middle'},`${date.format(new Date(point.t))}`);});
    svg.setAttribute('aria-label',`Prediksi kelembapan tanah. Aktual terakhir ${fmt(latest.soil_moisture)} persen. ${predictions.map(p=>`${p.horizon_minutes} menit: ${fmt(p.predicted_pct)} persen`).join('. ')}`);
  }
  function render(payload) {
    currentReport=payload;
    const run=payload.run, report=run?.report, schedule=payload.schedules.find(row=>row.run_id===run?.id);
    byId('ai-model-state').textContent=labels[run?.status] || 'Menunggu worker';
    byId('ai-data-count').textContent=report ? `${report.samples_5m || 0} titik / 5 menit` : '—';
    byId('ai-next-time').textContent=when(schedule?.proposed_at);
    byId('ai-summary').textContent=payload.source==='simulation'
      ? `SIMULASI HISTORIS · Prediksi dihitung dari akhir data simulasi, bukan kondisi pot sekarang. Batas ${fmt(payload.settings?.threshold_pct)}% hanya contoh demonstrasi. Tidak menjalankan pompa.`
      : `MODE REKOMENDASI · ${payload.settings?.calibrated ? 'Batas tanaman telah ditetapkan; semua usulan masih memerlukan peninjauan.' : 'Sensor belum dikalibrasi; waktu penyiraman ditahan sampai batas tanaman ditetapkan.'} Jadwal evaluasi disimpan otomatis di Smartport. Tidak mengirim perintah pompa.`;
    byId('ai-model-note').textContent=report ? `${report.method || 'Regresi ridge multivariat'}. ${report.reason} ${report.features_note || ''}${payload.source==='device' && run.data_as_of && payload.server_time-run.data_as_of>300000 ? ' Data alat sudah lebih dari lima menit; prediksi ini tidak menggambarkan kondisi sekarang.' : ''}` : 'Worker belum menyelesaikan analisis profil ini.';
    byId('ai-calibration-note').textContent=schedule?.reason || 'Menunggu hasil evaluasi terjadwal.';
    rows('ai-observed-rows',(payload.observed_events || []).map(row=>[when(row.occurred_at),actionLabel(row),({mqtt_command_or_status:'Perintah/status MQTT',telemetry_transition:'Perubahan status sensor',paired_within_5s:'Dua event berdekatan ≤5 detik',simulation_generator:'Generator simulasi'})[row.evidence] || row.evidence]),'Belum ada event baru yang tercatat dalam jendela 24 jam ini.',3);
    observedPage=payload.events_page || 1;
    byId('ai-events-prev').disabled=observedPage<=1;
    byId('ai-events-next').disabled=observedPage>=(payload.events_pages || 1);
    byId('ai-events-page').textContent=`${observedPage} / ${payload.events_pages || 1}`;
    byId('ai-observed-note').textContent=`${payload.observed_count || 0} event · ${when(payload.evidence_window_start)} – ${when(payload.evidence_window_end)}. Jam dan menit disimpan saat event diterima. Status awal setelah koneksi tidak dianggap aktivitas baru; perubahan RGB tanpa perubahan ON/OFF juga tidak membuat jadwal baru. Pencatatan event ini dimulai saat fitur aktif; snapshot riwayat lama tetap terpisah dan tidak dihapus.`;
    rows('ai-daily-plan-rows',(payload.daily_plan || []).map(row=>[clock(row),actionLabel(row),String(row.sample_count),labels[row.status]||row.status,row.reason]),'Belum ada pola event dalam 24 jam yang dapat dijadikan rencana besok.',5);
    byId('ai-tomorrow-note').textContent=`Untuk ${payload.tomorrow_date || 'besok'} · ${(payload.daily_plan_method || 'Pola waktu 24 jam').replace(/\.$/,'')}. Satu hari adalah rencana awal, belum membuktikan kebutuhan tanaman. Semua rencana tersimpan di MySQL dan tidak dijalankan otomatis.${payload.source==='simulation'?' Pola ini berasal dari simulasi historis.':''}`;
    rows('ai-forecast-rows',payload.predictions.map(row=>{
      const validation=report.forecasts.find(f=>f.horizon_minutes===row.horizon_minutes);
      return [`${row.horizon_minutes} menit`,when(row.predicted_for),`${fmt(row.predicted_pct)}%`,`${fmt(validation?.mae)} / ${fmt(validation?.baseline_mae)} poin %`,validation?.usable_for_recommendation?'Lolos evaluasi':'Hanya ditampilkan; belum layak'];
    }),'Belum ada prediksi yang dapat diuji dengan riwayat tersedia.',5);
    rows('ai-schedule-rows',payload.schedules.map(row=>[`#${row.id}`,when(row.proposed_at),labels[row.status]||row.status,row.reason]),'Belum ada evaluasi jadwal di database.',4);
    rows('ai-evaluation-rows',payload.evaluation.map(row=>[`${row.horizon_minutes} menit`,String(row.count),`${fmt(row.mae)} poin %`]),'Evaluasi prediksi baru terisi setelah waktunya tiba dan sensor aktual tersedia.',3);
    const stages=[when(run?.data_as_of),`${report?.event_count || 0} arsip pesan · ${report?.manual_schedule_count || 0} jadwal manual diarsipkan`,labels[run?.status]||'Menunggu data',`${payload.predictions.length} horizon prediksi`,schedule?`Evaluasi #${schedule.id} · ${(payload.daily_plan || []).length} slot besok tersimpan`:'Menunggu worker','Wajib periksa data/air sebelum tindakan · mode rekomendasi'];
    stages.forEach((text,index)=>byId(`ai-flow-${index+1}`).textContent=text);
    byId('ai-proof').textContent=`Smartport.ai_runs / ai_predictions / ai_schedules · ${payload.device_id} · ${payload.source==='simulation'?'SIMULASI':'DATA ALAT'} · analisis ${when(run?.generated_at)} · data ${when(run?.data_as_of)} · worker setiap 5 menit`;
    chart(payload);
  }
  async function load() {
    const id=++sequence;
    controller?.abort(); const request=new AbortController(); controller=request;
    const timer=setTimeout(()=>request.abort(),12000);
    const button=byId('ai-refresh'); button.disabled=true;
    byId('ai-error').hidden=true;
    // Jangan biarkan hasil profil sebelumnya terlihat sebagai hasil profil baru.
    const key=`${profile.value}:${source.value}`;
    if(currentReport && `${currentReport.profile}:${currentReport.source}`!==key) {
      currentReport=null; byId('ai-results').hidden=true;
    }
    try {
      const url=new URL('https://wincamp.web.id/smartpot/api/ai');
      url.searchParams.set('profile',profile.value);url.searchParams.set('source',source.value);url.searchParams.set('events_page',String(observedPage));
      const response=await fetch(url,{signal:request.signal,cache:'no-store',credentials:'omit'});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.error || 'Rekomendasi belum dapat dimuat.');
      if(payload.database!=='Smartport' || !Array.isArray(payload.schedules))throw new Error('Format rekomendasi tidak sesuai.');
      if(id!==sequence)return;
      render(payload); byId('ai-results').hidden=false;
    } catch(error) {
      if(id!==sequence)return;
      byId('ai-error').hidden=false;
      byId('ai-error').textContent=`${error.name==='AbortError'?'Koneksi rekomendasi melewati batas waktu.':error.message} Tekan Muat ulang AI untuk mencoba kembali.${currentReport?' Hasil sebelumnya masih ditampilkan.':''}`;
    } finally {clearTimeout(timer);if(id===sequence)button.disabled=false;}
  }
  byId('ai-refresh').addEventListener('click',load);
  source.addEventListener('change',()=>{observedPage=1;lastSignals.clear();load();});profile.addEventListener('change',()=>{observedPage=1;lastSignals.clear();load();});
  byId('ai-events-prev').addEventListener('click',()=>{observedPage=Math.max(1,observedPage-1);load();});
  byId('ai-events-next').addEventListener('click',()=>{observedPage++;load();});
  window.addEventListener('smartpot:mqtt-message',({detail})=>{
    if(document.hidden || source.value!=='device' || detail.profile!==profile.value)return;
    let packet; try{packet=JSON.parse(detail.message);}catch{packet=detail.message;}
    let key, state;
    if(detail.topic==='smartpot/pump/status') {key='pump';state=typeof packet==='object'?packet?.state ?? packet?.status_pump:packet;}
    else if(detail.topic==='smartpot/led/status' || detail.topic==='smartpot/control/light') {key='light-command';state=typeof packet==='object'?packet?.state ?? packet?.growLight:packet;}
    else if(detail.topic==='smartpot/telemetry') {key='light-telemetry';state=packet?.growLight ?? packet?.grow_light;}
    if(state==null)return;
    const signature=/^(true|on|1)$/i.test(String(state));
    if(lastSignals.get(key)===signature)return;
    lastSignals.set(key,signature);
    clearTimeout(eventRefresh);
    eventRefresh=setTimeout(load,1000);
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  const poll=setInterval(()=>{if(!document.hidden)load();},60000);
  window.addEventListener('pagehide',()=>{controller?.abort();clearInterval(poll);clearTimeout(eventRefresh);});
  window.addEventListener('smartpot:collect-report',event=>{event.detail.ai=currentReport;});
  load();
})();
