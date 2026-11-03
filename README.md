# SmartPot Dashboard

Dashboard statis HTML, CSS, dan JavaScript yang diterbitkan melalui GitHub Pages.

- `index.html`: grafik dan tabel telemetry dari MySQL OVH (`Smartport.telemetry`) melalui API HTTPS. Pilih Simulasi atau Data alat serta periode 24/48/72 jam. Simulasi tiga hari dibuat satu titik per menit, berlabel terpisah dari alat. Riwayat diperbarui setiap 30 detik, tabel 10 data per halaman. Mode alat menampilkan keadaan kosong saat belum ada telemetry; tidak mengganti data asli dengan simulasi. Kredensial MySQL tetap di OVH.

API baca: `https://wincamp.web.id/smartpot/api/telemetry?source=simulation&hours=72`. Ganti source menjadi `device` untuk alat `smartpot-01`; ID perangkat lain dapat diberikan lewat `device_id`. Timestamp epoch milidetik; UI menggunakan WIB. Maksimal 5.000 baris terbaru. Tidak lagi menggunakan data.json sebagai sumber halaman Ringkasan.
- `live-demo.html`: pemutaran simulasi data sensor secara real-time.
- `device.html`: visualisasi perangkat, jadwal harian, serta riwayat penyiraman dan grow light 3 hari dari MQTT over WSS. Profil MQTT web panel terpilih otomatis, dan halaman menyambung kembali saat dibuka atau jaringan pulih. Kredensial web panel tertanam di JavaScript publik sesuai persetujuan pemilik proyek.

Dashboard memulihkan status grow light dan level air dari cache browser, lalu memperbaruinya dari MQTT. Android menerbitkan status grow light/RGB sebagai retained di `smartpot/control/light` dan level air sebagai retained di `smartpot/state/water`; telemetry air juga diterima dari payload JSON atau topik water-level.

Aplikasi Android menyimpan riwayat aktuator di SQLite dan menerbitkan snapshot retained pada `smartpot/history/watering` dan `smartpot/history/grow-light`. Dashboard menampilkan dua tabel riwayat terpisah dan menyimpan cache lokal browser. Riwayat mulai tersedia setelah aplikasi Android yang mendukung snapshot ini berjalan; catatan sebelum itu tidak dapat dipulihkan.

GitHub Pages memakai branch `main` dari root repository.
