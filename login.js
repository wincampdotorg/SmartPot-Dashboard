(() => {
  'use strict';
  const form = document.getElementById('login-form');
  const password = document.getElementById('password');
  const error = document.getElementById('login-error');
  const submit = document.getElementById('login-submit');
  form.addEventListener('submit', event => {
    event.preventDefault();
    error.textContent = '';
    try {
      if (!window.SmartPotAuth.login(document.getElementById('username').value.trim(), password.value, document.getElementById('remember').checked)) {
        error.textContent = 'Username atau password belum sesuai. Silakan coba lagi.';
        password.setAttribute('aria-invalid', 'true');
        password.focus();
        return;
      }
      password.removeAttribute('aria-invalid');
      submit.disabled = true;
      submit.textContent = 'Membuka dashboard…';
      location.replace(window.SmartPotAuth.next());
    } catch (e) { error.textContent = e.message; }
  });
  document.getElementById('toggle-password').addEventListener('click', event => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    event.currentTarget.textContent = visible ? 'Sembunyikan' : 'Tampilkan';
    event.currentTarget.setAttribute('aria-pressed', String(visible));
  });
  document.getElementById('motion-toggle').addEventListener('click', event => {
    const paused = document.body.classList.toggle('motion-paused');
    event.currentTarget.textContent = paused ? 'Putar animasi' : 'Jeda animasi';
    event.currentTarget.setAttribute('aria-pressed', String(paused));
  });
})();
