(function(root) {
  'use strict';
  function parse(raw) {
    let value = raw;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (_) { value = value.trim(); }
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      value = value.state ?? value.status_pump ?? value.pump ?? value.action;
    }
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    if (typeof value !== 'string') return null;
    if (/^(on|true|1|yes)$/i.test(value.trim())) return true;
    if (/^(off|false|0|no)$/i.test(value.trim())) return false;
    return null;
  }
  function createVisualPulse(onChange, timers = globalThis) {
    let active = false, lastOn = false, timer = null;
    return {
      receive(on) {
        const rising = on && !lastOn;
        lastOn = Boolean(on);
        if (!rising || active) return;
        active = true;
        onChange(true);
        timer = timers.setTimeout(() => { active = false; timer = null; onChange(false); }, 5000);
      },
      reset() {
        if (timer !== null) timers.clearTimeout(timer);
        timer = null; active = false; lastOn = false;
        onChange(false);
      }
    };
  }
  if (typeof module === 'object' && module.exports) module.exports = {parse, createVisualPulse};
  else root.SmartPotPumpSignal = {parse, createVisualPulse};
})(globalThis);
