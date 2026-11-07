# SmartPot Dashboard

Dashboard statis HTML, CSS, dan JavaScript tanpa framework dan tanpa langkah build. Situs diterbitkan ke GitHub Pages (domain `smartpotbinus.com`) oleh workflow `.github/workflows/pages.yml` setiap ada push ke branch `main`.

## Versi

- `https://smartpotbinus.com/` (berkas di root): dashboard versi 1, tidak diubah.
- `https://smartpotbinus.com/v2/` (folder `v2/`): dashboard versi 2 dengan tampilan sederhana, ekspor CSV, dan perbandingan hari aturan vs hari AI. Kedua versi memakai API, broker MQTT, dan login yang sama.

Bagian di bawah menjelaskan versi 2; nama berkas relatif terhadap folder `v2/`.

## Halaman

- `login.html`: halaman masuk.
- `index.html`: Ringkasan dengan bagian Tren, Prediksi AI, Perangkat, dan Data.
- `live-demo.html`: pemutaran simulasi data sensor secara real-time.
- `device.html`: tautan lama yang diarahkan ke `index.html#perangkat`.

## Tampilan

Gaya sederhana: font sistem (`-apple-system`/SF), satu warna aksen hijau, kartu membulat dengan bayangan tipis, kontrol segmen untuk Sumber, Periode, dan parameter grafik. Mode terang dan gelap mengikuti `prefers-color-scheme`. Animasi pompa, lampu, dan tombol dimatikan saat `prefers-reduced-motion` aktif; aliran air tetap tampil statis. Rincian yang jarang dibutuhkan (pengaturan broker, detail model, event, evaluasi, tabel per jam) berada di bagian yang dapat dibuka-tutup.

Gaya ada di `app.css` (dashboard dan login) serta `export-pdf.css` (pratinjau dan cetak PDF). Bootstrap tidak lagi dipakai pada `index.html` dan `login.html`. Pilihan Sumber dan Periode tetap disimpan di elemen `<select>` tersembunyi (`#history-source`, `#history-hours`); `segmented.js` menyinkronkan kontrol segmen dengan select tersebut sehingga skrip lain tidak berubah.

Tabel dan grafik lebar memiliki area gulir sendiri pada ponsel. Grafik perbandingan menyesuaikan lebar layar.

## Riwayat sensor

Grafik dan tabel membaca telemetry dari MySQL OVH (`Smartport.telemetry`) melalui API HTTPS. Pilih Simulasi atau Alat serta periode 24 jam, 2 hari, atau 3 hari. Simulasi tiga hari berisi satu titik per menit dan diberi label terpisah dari data alat. Riwayat diperbarui setiap 30 detik; tabel menampilkan 10 data per halaman. Mode alat menampilkan keadaan kosong saat belum ada telemetry dan tidak mengganti data asli dengan simulasi. Pada sumber Alat, kotak centang **Sertakan isian simulasi** (bawaan tidak dicentang) menentukan apakah baris pengisi celah saat Wi-Fi alat mati (`isian_simulasi_tdr2`) ikut ditampilkan; pilihan ini juga berlaku untuk tautan Data JSON, Ekspor PDF, dan ekspor CSV data sensor. Kredensial MySQL tetap di server.

API baca: `https://wincamp.web.id/smartpot/api/telemetry?source=simulation&hours=72`. Ganti `source` menjadi `device` untuk data alat; tambahkan `isian=0` untuk membuang baris isian simulasi; `profile=tdr2` memakai device `smartpot-tdr2`, `profile=web-panel` memakai `smartpot-01`. Timestamp dalam epoch milidetik; UI memakai WIB. Maksimal 5.000 baris terbaru.

## Perangkat dan MQTT

Bagian Perangkat menampilkan visualisasi grow light dan pompa, jadwal harian, serta riwayat penyiraman dan grow light 3 hari dari MQTT over WSS dan katalog Smartport. Dashboard memulihkan status grow light dan level air dari cache browser, lalu memperbaruinya dari MQTT. Android menerbitkan status grow light/RGB sebagai retained di `smartpot/control/light` dan level air di `smartpot/state/water`.

Pilihan Profil ada di bagian atas halaman. Profil TDR2 memakai broker `ifb44421.ala.asia-southeast1.emqxsl.com`; profil Web Panel memakai broker `af2f1247.ala.asia-southeast1.emqxsl.com` (device `smartpot-01`). Kredensial kedua profil tertanam di `device.js`, sehingga dapat dibaca siapa pun yang membuka JavaScript situs; broker tersebut khusus untuk proyek ini. Profil tersimpan setelah broker mengonfirmasi koneksi, dipulihkan dari cookie preferensi 30 hari, localStorage, atau sessionStorage (cookie tidak memuat username/password). Saat profil berubah, sumber berpindah ke Alat dan status/riwayat profil sebelumnya tidak dipakai. Alamat broker, username, password, serta tombol Hubungkan/Putuskan ada di bagian **Pengaturan broker MQTT**.

Collector TDR2 di OVH memperbarui satu baris per menit menggunakan telemetry terbaru. Pembacaan 0 adalah nilai yang dikirim alat, bukan keadaan kosong.

**Pratinjau aliran · 5 detik** hanya menampilkan visual aliran air tanpa mengirim MQTT, menulis riwayat, atau mengubah persentase air. `pump-signal.js` menerima ON/OFF mentah, JSON string, boolean, angka 1/0, serta objek state/status_pump/pump/action. Sisi naik ON memulai visual lima detik penuh; OFF lebih awal tidak memotong animasi dan ON berulang tidak memperpanjangnya.

## Login demo

`login.html` memakai akun hardcode `admin` / `admin`. Cookie `smartpot_demo_session` menyimpan penanda login tanpa password. Pilihan Ingat saya memberi Max-Age 30 hari; tanpa pilihan ini cookie berlaku untuk sesi browser. Cookie memakai SameSite=Lax, path repository, dan Secure pada HTTPS. Tombol Keluar menghapus cookie. Tujuan setelah login dibatasi pada halaman situs sendiri.

Login ini hanya pembatas tampilan untuk tugas kuliah di GitHub Pages. JavaScript, aset, dan API baca tetap publik; cookie dapat diubah pengguna. Ini bukan autentikasi server untuk data privat.

## Prediksi AI

Bagian **Prediksi AI** mengikuti Profil dan Sumber yang dipilih. Semua hasil bersifat bayangan (*shadow*): perangkat lunak tidak pernah menyalakan pompa.

Endpoint baca: `https://wincamp.web.id/smartpot/api/ai?profile=tdr2&source=device`. Worker OVH berjalan setiap lima menit; halaman memperbarui hasil setiap menit saat aktif.

### Perbandingan aturan sensor vs prediksi AI

Dibaca dari `run.report.comparison` (metode `replay_harian_v1`):

- Kartu **Kemarin · aturan sensor**: aturan ambang tanah (default 40%, 3 pembacaan valid berturut-turut, jeda 30 menit, maksimal 8 kali per hari) diputar ulang pada data sensor nyata hari tersebut.
- Kartu **Hari ini · prediksi AI**: model yang hanya dilatih dengan data sampai akhir hari aturan memprediksi kelembapan tanah dan waktu siram hari ini, lalu dibandingkan dengan data nyata dan dengan aturan yang diterapkan pada data nyata hari ini. MAE model ditampilkan bersama MAE persistensi (nilai awal dipertahankan).
- Label Kemarin/Hari ini dipakai bila tanggalnya cocok dengan tanggal WIB saat ini; selain itu (misalnya data simulasi) ditampilkan Hari pertama/Hari kedua beserta tanggalnya.
- Setiap kartu menampilkan cakupan data (menit valid dari 1.440 menit). Pembacaan valid: 0 < tanah ≤ 100 dan bukan bagian dari ≥ 10 baris berturut-turut dengan tanah = level air.
- Grafik SVG menampilkan prediksi vs aktual per jam, garis ambang, serta jalur waktu siram AI dan aturan. Tabel per jam tersedia di bagian yang dapat dibuka.
- Kesimpulan, **Rencana besok**, dan catatan (termasuk peringatan cakupan data) berasal dari server. Jika perbandingan belum ada atau berisi `error`, halaman menampilkan "Perbandingan belum tersedia".

Pot uji saat ini tanpa tanaman dan alat belum terpasang sempurna, sehingga hasil perbandingan perlu dibaca bersama cakupan data dan catatannya.

### Prediksi singkat dan detail

Prediksi kelembapan tanah 30/60/120 menit memakai regresi ridge per sumber/perangkat dengan MAE model dibandingkan pembanding persistensi. Model yang tidak mengungguli pembanding diberi label belum layak. Detail model, enam tahap pengolahan, waktu event 24 jam (10 data per halaman), pola waktu event untuk rencana besok, evaluasi jadwal, dan MAE aktual 3 hari ada di bagian **Detail model, event, dan evaluasi**. Simulasi adalah replay dari akhir data historis dengan batas demonstrasi 45%; data simulasi tidak dipakai sebagai pengganti data alat.

## Ekspor CSV

Tombol **Ekspor CSV** di samping **Ekspor PDF** membuka pilihan:

- **Data sensor**: baris telemetry untuk profil, sumber, dan periode yang dipilih, diambil ulang dari API saat diunduh (bukan dari pembaruan MQTT di memori browser). Kolom: `waktu_wib, device_id, sumber_data, tanah_pct, suhu_c, udara_pct, air_pct, baterai_pct`, urut dari lama ke baru. `sumber_data` berisi `data_source` dari database (misalnya `mqtt_tdr2`, `isian_simulasi_tdr2`, `simulation_3days`). Baris isian simulasi hanya ikut bila **Sertakan isian simulasi** dicentang. Perbandingan aturan vs AI tetap memakai data alat dan isian untuk nilai aktual hari aturan, sama dengan perhitungan server.
- **Perbandingan aturan vs AI**: 24 baris per jam untuk hari aturan dan 24 baris untuk hari AI. Kolom: `tanggal, jam_wib, hari (aturan|ai), tanah_aktual_pct, prediksi_ai_pct, aturan_siram, ai_siram` (jumlah siram dalam jam tersebut). Nilai aktual hari AI berasal dari `forecast_vs_actual` apa adanya (jam tanpa titik server diisi dari telemetry); nilai aktual hari aturan dihitung dari telemetry 72 jam dengan aturan validitas, pembulatan per menit, dan median ±5 menit di dalam hari yang sama dengan server. Karena API telemetry membaca 72 jam terakhir dari waktu sekarang, simulasi lama dapat membuat kolom aktual hari aturan kosong; pesan status menyebutkannya. Kolom yang tidak berlaku dikosongkan.

Format:

- **CSV standar**: pemisah koma, desimal titik, UTF-8 tanpa BOM (pandas, Python, Google Sheets).
- **CSV Excel Indonesia**: pemisah titik koma, desimal koma, UTF-8 dengan BOM.

Akhir baris CRLF dan kutipan mengikuti RFC 4180. Teks yang diawali `=`, `+`, `-`, atau `@` diberi awalan apostrof agar tidak dibaca sebagai rumus; nilai angka tidak diubah. Nama file: `smartpot_<profil>_<alat|simulasi>_<sensor|perbandingan>_<YYYYMMDD>_WIB.csv`, misalnya `smartpot_tdr2_alat_sensor_20261106_WIB.csv`.

Logika CSV murni berada di `csv-core.js` (dapat di-`require` dari Node); antarmuka unduhan ada di `export-csv.js`.

## Ekspor PDF

**Ekspor PDF** membuka pratinjau laporan sesuai profil, sumber, dan periode yang dipilih: ringkasan sensor, grafik parameter terpilih, jadwal harian, riwayat penyiraman/grow light, hasil AI termasuk ringkasan perbandingan aturan vs AI, serta semua baris sensor yang dimuat (maksimal 5.000). Klik **Simpan sebagai PDF**, lalu pilih tujuan Save as PDF pada dialog cetak browser. Format A4 dengan header tabel berulang dan waktu WIB; ekspor berjalan di browser tanpa pustaka tambahan.

## Pengujian

```
node --test tests/
```

`tests/pump-signal.test.cjs` menguji parser sinyal pompa dan durasi visual; `tests/csv-core.test.cjs` menguji format angka, escape RFC 4180, netralisasi rumus, BOM, aturan validitas pembacaan, median per jam, baris perbandingan, dan nama file. Setelah mengubah file JS/CSS, naikkan nilai `?v=` di `index.html` atau `login.html`.
