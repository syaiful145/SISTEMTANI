/* ===== Penyimpanan data (localStorage) ===== */
const STORAGE_KEY = 'sistem-pertanian-v1';

// Helper tanggal (format YYYY-MM-DD, zona waktu lokal)
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = s => new Date(s + 'T00:00:00');
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
const selisih = (a, b) => Math.round((parse(a) - parse(b)) / 86400000); // a - b dalam hari
const hariIni = () => fmt(new Date());
const hariOffset = n => addDays(hariIni(), n);

function seedData() {
  return {
    users: [
      { id: 1, username: 'admin', password: 'admin123' }
    ],
    tanaman: [
      { id: 1, nama: 'Padi IR64', jenis: 'Serealia', tanggalTanam: hariOffset(-100), luas: 2, jumlah: 20000, lokasi: 'Blok A', status: 'Siap panen', umurPanen: 110, updatedAt: hariOffset(-3) },
      { id: 2, nama: 'Jagung Hibrida', jenis: 'Serealia', tanggalTanam: hariOffset(-30), luas: 1.5, jumlah: 45000, lokasi: 'Blok B', status: 'Dalam perawatan', umurPanen: 90, updatedAt: hariOffset(-40) },
      { id: 3, nama: 'Cabai Merah', jenis: 'Hortikultura', tanggalTanam: hariOffset(-20), luas: 0.5, jumlah: 6000, lokasi: 'Blok C', status: 'Ditanam', umurPanen: 75, updatedAt: hariOffset(-1) }
    ],
    penanaman: [
      { id: 1, tanamanId: 1, tanggal: hariOffset(-100), bibit: 20000, lokasi: 'Blok A', pegawaiId: 1, status: 'Ditanam' },
      { id: 2, tanamanId: 2, tanggal: hariOffset(-30), bibit: 45000, lokasi: 'Blok B', pegawaiId: 2, status: 'Ditanam' },
      { id: 3, tanamanId: 3, tanggal: hariOffset(-20), bibit: 6000, lokasi: 'Blok C', pegawaiId: 2, status: 'Ditanam' },
      { id: 4, tanamanId: 3, tanggal: hariOffset(5), bibit: 4000, lokasi: 'Blok D', pegawaiId: 1, status: 'Dijadwalkan' }
    ],
    panen: [
      { id: 1, penanamanId: 1, tanggal: hariOffset(-2), kg: 1200, kualitas: 'A', lokasi: 'Blok A', pegawaiId: 1, foto: '' },
      { id: 2, penanamanId: 3, tanggal: hariOffset(-5), kg: 350, kualitas: 'B', lokasi: 'Blok C', pegawaiId: 2, foto: '' }
    ],
    barang: [
      { id: 1, kode: 'PPK-001', nama: 'Pupuk Urea', kategori: 'Pupuk', stok: 150, satuan: 'kg', minStok: 50, tanggalMasuk: hariOffset(-30) },
      { id: 2, kode: 'BBT-001', nama: 'Benih Padi IR64', kategori: 'Bibit', stok: 40, satuan: 'kg', minStok: 50, tanggalMasuk: hariOffset(-45) },
      { id: 3, kode: 'PST-001', nama: 'Insektisida Dursban', kategori: 'Pestisida', stok: 12, satuan: 'botol', minStok: 5, tanggalMasuk: hariOffset(-60) },
      { id: 4, kode: 'ALT-001', nama: 'Cangkul', kategori: 'Peralatan pertanian', stok: 8, satuan: 'buah', minStok: 2, tanggalMasuk: hariOffset(-200) }
    ],
    transaksi: [
      { id: 1, barangId: 1, jenis: 'Masuk', jumlah: 200, tanggal: hariOffset(-30), keterangan: 'Pembelian', penanamanId: null },
      { id: 2, barangId: 1, jenis: 'Keluar', jumlah: 50, tanggal: hariOffset(-20), keterangan: 'Pemupukan dasar', penanamanId: 1 },
      { id: 3, barangId: 2, jenis: 'Masuk', jumlah: 50, tanggal: hariOffset(-45), keterangan: 'Pembelian', penanamanId: null },
      { id: 4, barangId: 2, jenis: 'Keluar', jumlah: 10, tanggal: hariOffset(-40), keterangan: 'Persemaian', penanamanId: 1 }
    ],
    pegawai: [
      { id: 1, nama: 'Budi Santoso', idPegawai: 'P-001', jabatan: 'Mandor Lapangan', telepon: '081200000001', alamat: 'Desa Sukamaju', statusKerja: 'Tetap', username: 'budi', password: 'budi123', akses: ['penanaman', 'panen'] },
      { id: 2, nama: 'Siti Aminah', idPegawai: 'P-002', jabatan: 'Staf Lapangan & Gudang', telepon: '081200000002', alamat: 'Desa Sukamaju', statusKerja: 'Kontrak', username: 'siti', password: 'siti123', akses: ['penanaman', 'panen', 'gudang'] }
    ],
    laporan: [
      { id: 1, pegawaiId: 2, tanggal: hariOffset(-1), jenis: 'Pemupukan', lokasi: 'Blok B', deskripsi: 'Pemupukan susulan urea 25 kg pada jagung.', dibaca: false },
      { id: 2, pegawaiId: 1, tanggal: hariIni(), jenis: 'Penyiraman', lokasi: 'Blok A', deskripsi: 'Penyiraman pagi. Kondisi padi baik, mulai persiapan panen.', dibaca: false }
    ],
    log: [
      { id: 1, waktu: new Date().toISOString(), aktorKey: 'sistem', aktorNama: 'Sistem', aksi: 'Data contoh dibuat', entitas: 'Awal' }
    ]
  };
}

const DB = {
  d: null,

  init() {
    const raw = localStorage.getItem(STORAGE_KEY);
    this.d = raw ? JSON.parse(raw) : seedData();
    this.simpan();
  },

  simpan() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.d));
  },

  all(tabel) {
    return this.d[tabel];
  },

  get(tabel, id) {
    return this.d[tabel].find(x => x.id === id);
  },

  add(tabel, obj) {
    const id = this.d[tabel].reduce((m, x) => Math.max(m, x.id), 0) + 1;
    const row = { id, ...obj };
    this.d[tabel].push(row);
    this.simpan();
    return row;
  },

  update(tabel, id, obj) {
    Object.assign(this.get(tabel, id), obj);
    this.simpan();
  },

  remove(tabel, id) {
    this.d[tabel] = this.d[tabel].filter(x => x.id !== id);
    this.simpan();
  },

  // Riwayat aktivitas: siapa melakukan apa dan kapan
  log(aktorKey, aktorNama, aksi, entitas) {
    this.d.log.unshift({ id: Date.now(), waktu: new Date().toISOString(), aktorKey, aktorNama, aksi, entitas });
    this.d.log = this.d.log.slice(0, 300);
    this.simpan();
  }
};
