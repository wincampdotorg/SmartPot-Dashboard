# SmartPot Dashboard

Dashboard statis HTML, CSS, dan JavaScript yang diterbitkan melalui GitHub Pages.

- `index.html`: ringkasan sensor dan simulasi data satu hari (1.440 titik per menit). Data ini adalah **simulasi**, bukan data aktual dari ESP32. Demo dan visualisasi perangkat tersedia dari menu samping.
- `live-demo.html`: pemutaran simulasi data sensor secara real-time.
- `device.html`: visualisasi perangkat, jadwal harian, serta riwayat penyiraman dan grow light 3 hari dari MQTT over WSS. Masukkan kredensial EMQX di halaman untuk menghubungkan sesi.

Aplikasi Android menyimpan riwayat aktuator di SQLite dan menerbitkan snapshot retained pada `smartpot/history/watering` dan `smartpot/history/grow-light`. Dashboard menampilkan dua tabel riwayat terpisah dan menyimpan cache lokal browser. Riwayat mulai tersedia setelah aplikasi Android yang mendukung snapshot ini berjalan; catatan sebelum itu tidak dapat dipulihkan.

GitHub Pages memakai branch `main` dari root repository.
