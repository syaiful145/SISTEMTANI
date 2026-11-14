# Sistem Manajemen Pertanian

Aplikasi web untuk mengelola kegiatan pertanian: tanaman, penanaman, panen, gudang, pegawai, dan laporan. Dibuat dengan HTML, CSS, dan JavaScript murni, tanpa instalasi tambahan.

## Cara menjalankan

Cara paling mudah: buka file `index.html` langsung di browser (Chrome, Edge, Firefox).

Atau jalankan server lokal, misalnya dengan Python:

```
cd sistem-pertanian
python -m http.server 8080
```

Lalu buka `http://localhost:8080`.

Koneksi internet dibutuhkan untuk memuat Chart.js (grafik di dashboard). Fitur lain tetap berjalan tanpa internet.

## Akun demo

| Peran   | Username | Password  |
|---------|----------|-----------|
| Admin   | admin    | admin123  |
| Pegawai | budi     | budi123   |
| Pegawai | siti     | siti123   |

Budi hanya bisa mengakses Penanaman dan Panen. Siti juga bisa mengakses Gudang.

## Hak akses

| Fitur                    | Admin | Pegawai                    |
|--------------------------|-------|----------------------------|
| Dashboard                | ✅    | ✅                         |
| Melihat data tanaman     | ✅    | ✅                         |
| Menambah data tanaman    | ✅    | ❌                         |
| Mengelola penanaman      | ✅    | ✅ (jika diizinkan admin)  |
| Mengelola hasil panen    | ✅    | ✅ (jika diizinkan admin)  |
| Mengelola stok gudang    | ✅    | ✅ (jika diizinkan admin)  |
| Melihat data pegawai     | ✅    | ❌                         |
| Mengirim laporan harian  | ❌    | ✅                         |
| Melihat laporan keseluruhan | ✅ | ❌                         |
| Mengelola akun pegawai   | ✅    | ❌                         |

## Fitur

- **Dashboard**: total tanaman, tanaman sedang ditanam, siap panen, total hasil panen, jumlah barang, jumlah pegawai, grafik 6 bulan, dan aktivitas terbaru.
- **Tanaman**: data master tanaman dengan status (Ditanam, Dalam perawatan, Siap panen, Selesai) dan prediksi panen dari tanggal tanam dan umur panen.
- **Penanaman**: jadwal tanam, jumlah bibit, lokasi lahan, dan penanggung jawab.
- **Panen**: tanggal, hasil dalam kg, grade A/B/C, lokasi, pemanen, dan foto dokumentasi (maks. 350 KB).
- **Gudang**: barang per kategori (pupuk, bibit, pestisida, peralatan, lainnya), stok, satuan, catatan barang masuk dan keluar yang bisa dikaitkan ke penanaman, serta peringatan stok menipis.
- **Pegawai**: data kepegawaian, akun login, hak akses per fitur, dan riwayat aktivitas.
- **Laporan Harian**: pegawai mengirim laporan kegiatan di lapangan. Admin melihat semuanya.
- **Laporan**: penanaman, perkembangan tanaman, hasil panen, stok gudang, barang masuk dan keluar, serta aktivitas pegawai. Bisa difilter berdasarkan tanggal dari dan sampai, bulan, tahun, dan jenis tanaman. Ekspor ke CSV (dibuka di Excel) atau cetak ke PDF lewat dialog cetak browser.
- **Notifikasi** (admin): tanaman siap panen atau memasuki masa panen, jadwal tanam, stok menipis, laporan baru dari pegawai, dan tanaman yang belum diperbarui lebih dari 30 hari.
- **Kalender**: jadwal tanam, panen, dan prediksi panen dalam tampilan bulanan.
- **Riwayat aktivitas**: setiap tambah, ubah, dan hapus data dicatat dengan nama pelaku dan waktunya.

## Struktur folder

```
sistem-pertanian/
├── index.html       Halaman utama (login dan kerangka aplikasi)
├── css/
│   └── style.css    Gaya visual, responsif, dan gaya cetak
├── js/
│   ├── db.js        Penyimpanan data (localStorage) dan data contoh
│   └── app.js       Login, hak akses, halaman, form, laporan, notifikasi
└── README.md
```

## Catatan penting

Ini adalah prototipe front-end. Data disimpan di localStorage browser, jadi:

- Data hanya ada di browser dan perangkat tempat aplikasi dipakai. Data tidak ikut ke perangkat lain.
- Password disimpan apa adanya (plain text) dan belum dienkripsi.
- Menghapus data browser akan menghapus semua data aplikasi.

Untuk pemakaian sungguhan dengan banyak pengguna, data perlu dipindahkan ke server dengan database (misalnya PostgreSQL atau MySQL), dengan login yang aman di sisi server.

Reset ke data contoh: hapus key `sistem-pertanian-v1` dari localStorage lewat developer tools browser, lalu muat ulang halaman.
