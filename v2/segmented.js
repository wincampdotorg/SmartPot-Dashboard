// Kontrol segmen yang terhubung ke <select> tersembunyi; skrip lain tetap membaca nilai dan event change dari select.
(() => {
  'use strict';
  if (!window.SmartPotAuth?.authenticated) return;
  const groups = [...document.querySelectorAll('[data-segment-for]')].map(group => ({ group, select: document.getElementById(group.dataset.segmentFor) })).filter(item => item.select);
  function sync() {
    groups.forEach(({ group, select }) => {
      group.querySelectorAll('input[type="radio"]').forEach(input => { input.checked = input.value === select.value; });
    });
  }
  groups.forEach(({ group, select }) => {
    group.addEventListener('change', event => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.checked || select.value === input.value) return;
      select.value = input.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    select.addEventListener('change', sync);
  });
  // Skrip dasbor dapat mengganti sumber data secara program saat profil MQTT berubah.
  window.addEventListener('smartpot:mqtt-profile', () => setTimeout(sync, 0));
  document.addEventListener('DOMContentLoaded', sync);
  sync();
  // Grafik lebar pada ponsel dimulai dari ujung kanan (data terbaru).
  const scrollToEnd = () => document.querySelectorAll('[data-scroll-end]').forEach(area => { area.scrollLeft = area.scrollWidth; });
  window.addEventListener('load', scrollToEnd);
  window.addEventListener('smartpot:mqtt-profile', () => setTimeout(scrollToEnd, 1500));
})();
