# SmartPot Dashboard

Dashboard statis HTML, CSS, dan JavaScript. Tidak memakai PHP, framework, build step, atau kredensial browser.

Dashboard memvisualisasikan 1.440 baris pada [`data.json`](data.json), satu titik tiap menit selama sehari. Dataset ini adalah **simulasi** dan tidak diperbarui otomatis dari EMQX Tables.

## GitHub Pages

Workflow di `.github/workflows/pages.yml` menerbitkan situs setiap ada perubahan ke branch `main`. Aktifkan **Settings → Pages → Build and deployment → Source: GitHub Actions** pada repository.

## Pengembangan lokal

Buka `index.html` melalui server file statis lokal agar browser bisa mengambil `data.json`. Tidak diperlukan PHP.
