(() => {
  'use strict';
  const script = document.currentScript;
  const base = new URL('.', script.src);
  const loginPage = script.dataset.page === 'login';
  const COOKIE = 'smartpot_demo_session';
  const VALUE = 'admin-v1';
  // Login tampilan untuk tugas kuliah; kredensial memang berada di JavaScript publik.
  const USERNAME = 'admin';
  const PASSWORD = 'admin';
  const hasSession = () => document.cookie.split(';').some(part => part.trim() === `${COOKIE}=${VALUE}`);
  const cookieOptions = `; Path=${base.pathname}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  function destination(raw) {
    try {
      const url = new URL(raw || 'index.html', base);
      const allowed = ['index.html', 'live-demo.html', 'device.html'].map(name => new URL(name, base).pathname);
      return url.origin === base.origin && allowed.includes(url.pathname) ? url.href : new URL('index.html', base).href;
    } catch (_) { return new URL('index.html', base).href; }
  }
  function loginUrl() {
    const url = new URL('login.html', base);
    url.searchParams.set('next', location.pathname + location.search + location.hash);
    return url.href;
  }
  window.SmartPotAuth = {
    get authenticated() { return hasSession(); },
    login(username, password, remember) {
      if (username !== USERNAME || password !== PASSWORD) return false;
      document.cookie = `${COOKIE}=${VALUE}${remember ? '; Max-Age=2592000' : ''}${cookieOptions}`;
      if (!hasSession()) throw new Error('Cookie tidak dapat disimpan. Izinkan cookie situs ini untuk masuk.');
      return true;
    },
    next: () => destination(new URLSearchParams(location.search).get('next')),
    logout() {
      window.dispatchEvent(new Event('smartpot:logout'));
      document.cookie = `${COOKIE}=; Max-Age=0${cookieOptions}`;
      location.replace(new URL('login.html', base));
    }
  };
  function guard() {
    if (!loginPage && !hasSession()) {
      document.documentElement.dataset.authenticated = 'false';
      location.replace(loginUrl());
    } else if (!loginPage) document.documentElement.dataset.authenticated = 'true';
  }
  if (loginPage && hasSession()) location.replace(window.SmartPotAuth.next());
  else guard();
  window.addEventListener('pageshow', guard);
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', window.SmartPotAuth.logout));
  });
})();
