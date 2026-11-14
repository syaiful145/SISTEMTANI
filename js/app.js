/* ===== Utilitas ===== */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = n => Number(n || 0).toLocaleString('id-ID');
const tgl = s => s ? parse(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const namaTanaman = id => (DB.get('tanaman', id) || {}).nama || '-';
const namaPegawai = id => (DB.get('pegawai', id) || {}).nama || '-';
const jenisTanaman = id => (DB.get('tanaman', id) || {}).jenis || '-';
const tanamanDariPanen = p => { const pj = DB.get('penanaman', p.penanamanId); return pj ? namaTanaman(pj.tanamanId) : '-'; };
const penanamanLabel = p => `${namaTanaman(p.tanamanId)} · ${p.lokasi} · ${tgl(p.tanggal)}`;
const pegawaiOpts = () => DB.all('pegawai').map(p => [p.id, p.nama]);
const keluarTerakhir = id => DB.all('transaksi').filter(t => t.barangId === id && t.jenis === 'Keluar').map(t => t.tanggal).sort().pop() || '';

const JENIS_TANAMAN = ['Serealia', 'Hortikultura', 'Sayuran', 'Buah', 'Perkebunan', 'Lainnya'];
const STATUS_TANAMAN = ['Ditanam', 'Dalam perawatan', 'Siap panen', 'Selesai'];
const STATUS_PENANAMAN = ['Dijadwalkan', 'Ditanam', 'Selesai'];
const KATEGORI_BARANG = ['Pupuk', 'Bibit', 'Pestisida', 'Peralatan pertanian', 'Perlengkapan lainnya'];
const JENIS_KEGIATAN = ['Penanaman', 'Pemupukan', 'Penyiraman', 'Penyemprotan', 'Panen', 'Perawatan lainnya'];
const AKSES = { penanaman: 'Penanaman', panen: 'Panen', gudang: 'Gudang' };
const WARNA_STATUS = { 'Ditanam': 'blue', 'Dalam perawatan': 'amber', 'Siap panen': 'green', 'Selesai': 'gray', 'Dijadwalkan': 'amber' };
const JENIS_LAPORAN = {
  penanaman: 'Laporan penanaman',
  perkembangan: 'Laporan perkembangan tanaman',
  panen: 'Laporan hasil panen',
  stok: 'Laporan stok gudang',
  keluarmasuk: 'Laporan barang masuk & keluar',
  aktivitas: 'Laporan aktivitas pegawai'
};

const tagStatus = s => `<span class="tag ${WARNA_STATUS[s] || ''}">${esc(s)}</span>`;
const head = (judul, aksi = '') => `<div class="page-head"><h2>${judul}</h2><div class="page-actions">${aksi}</div></div>`;
const tabel = (kolom, baris, kosong = 'Belum ada data.') => {
  if (!baris.length) return `<div class="empty">${kosong}</div>`;
  return `<div class="table-wrap"><table>
    <thead><tr>${kolom.map(k => `<th>${esc(k)}</th>`).join('')}</tr></thead>
    <tbody>${baris.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
};

/* ===== Sesi & hak akses ===== */
const SESI_KEY = 'sp-sesi';

function me() {
  const s = JSON.parse(localStorage.getItem(SESI_KEY) || 'null');
  if (!s) return null;
  if (s.tipe === 'admin') return { tipe: 'admin', key: 'admin', nama: 'Administrator', akses: Object.keys(AKSES) };
  const p = DB.get('pegawai', s.id);
  return p ? { tipe: 'pegawai', key: 'p' + p.id, nama: p.nama, id: p.id, akses: p.akses || [] } : null;
}
const isAdmin = () => me()?.tipe === 'admin';
const bisa = fitur => { const u = me(); return !!u && (u.tipe === 'admin' || u.akses.includes(fitur)); };
const catat = (aksi, entitas) => { const u = me(); DB.log(u ? u.key : 'sistem', u ? u.nama : 'Sistem', aksi, entitas); };

/* ===== Menu ===== */
const MENU = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'tanaman', label: 'Tanaman', icon: '🌿' },
  { id: 'penanaman', label: 'Penanaman', icon: '🌱', akses: 'penanaman' },
  { id: 'panen', label: 'Panen', icon: '🧺', akses: 'panen' },
  { id: 'gudang', label: 'Gudang', icon: '📦', akses: 'gudang' },
  { id: 'pegawai', label: 'Pegawai', icon: '👥', adminOnly: true },
  { id: 'aktivitas', label: 'Laporan Harian', icon: '📝' },
  { id: 'laporan', label: 'Laporan', icon: '📊', adminOnly: true },
  { id: 'kalender', label: 'Kalender', icon: '📅' },
  { id: 'notifikasi', label: 'Notifikasi', icon: '🔔', adminOnly: true }
];

function menuVisible(m) {
  const u = me();
  if (!u) return false;
  if (u.tipe === 'admin') return true;
  if (m.adminOnly) return false;
  return !m.akses || u.akses.includes(m.akses);
}

function renderNav(r) {
  $('#nav').innerHTML = MENU.filter(menuVisible)
    .map(m => `<a href="#${m.id}" class="${m.id === r ? 'active' : ''}"><span>${m.icon}</span>${m.label}</a>`)
    .join('');
}

/* ===== Notifikasi (khusus admin) ===== */
function notifikasi() {
  const hari = hariIni();
  const list = [];

  DB.all('tanaman').forEach(t => {
    const pred = addDays(t.tanggalTanam, t.umurPanen);
    const s = selisih(pred, hari);
    if (t.status === 'Siap panen') {
      list.push({ jenis: 'Panen', judul: `${t.nama} siap panen`, detail: `${t.lokasi} · prediksi ${tgl(pred)}` });
    } else if (t.status !== 'Selesai' && s <= 7) {
      list.push({ jenis: 'Panen', judul: `${t.nama} memasuki masa panen`, detail: s < 0 ? `Lewat ${-s} hari dari prediksi` : `${s} hari lagi (${tgl(pred)})` });
    }
    if (t.status !== 'Selesai' && selisih(hari, t.updatedAt || t.tanggalTanam) > 30) {
      list.push({ jenis: 'Update', judul: `${t.nama} belum diperbarui`, detail: `Terakhir diperbarui ${tgl(t.updatedAt || t.tanggalTanam)}` });
    }
  });

  DB.all('penanaman').forEach(p => {
    const s = selisih(p.tanggal, hari);
    if (p.status === 'Dijadwalkan' && s <= 7) {
      list.push({ jenis: 'Jadwal', judul: `Jadwal tanam ${namaTanaman(p.tanamanId)}`, detail: `${p.lokasi} · ${tgl(p.tanggal)}${s < 0 ? ' (terlewat)' : ''}` });
    }
  });

  DB.all('barang').forEach(b => {
    if (b.stok <= b.minStok) list.push({ jenis: 'Stok', judul: `Stok ${b.nama} menipis`, detail: `Sisa ${rp(b.stok)} ${b.satuan} (batas ${rp(b.minStok)})` });
  });

  DB.all('laporan').filter(l => !l.dibaca).forEach(l => {
    list.push({ jenis: 'Laporan', judul: `Laporan baru dari ${namaPegawai(l.pegawaiId)}`, detail: `${l.jenis} · ${tgl(l.tanggal)}` });
  });

  return list;
}

/* ===== Form & modal ===== */
const opsi = f => (typeof f.options === 'function' ? f.options() : (f.options || [])).map(x => (Array.isArray(x) ? x : [x, x]));

function formHTML(fields, v) {
  return fields.map(f => {
    const val = v[f.name] ?? f.def ?? '';
    const req = f.req ? 'required' : '';
    let input;
    if (f.type === 'select') {
      input = `<select name="${f.name}" ${req}>
        ${f.kosong ? `<option value="">${esc(f.kosong)}</option>` : ''}
        ${opsi(f).map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select>`;
    } else if (f.type === 'checks') {
      input = `<div class="checks">${opsi(f).map(([k, l]) =>
        `<label><input type="checkbox" name="${f.name}" value="${esc(k)}" ${(val || []).includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>`;
    } else if (f.type === 'textarea') {
      input = `<textarea name="${f.name}" rows="3" ${req}>${esc(val)}</textarea>`;
    } else if (f.type === 'image') {
      input = `${val ? `<img src="${val}" class="thumb-lg" alt="Foto">` : ''}<input type="file" accept="image/*" data-img="${f.name}">`;
    } else {
      input = `<input type="${f.type || 'text'}" name="${f.name}" value="${esc(val)}" step="${f.step || 'any'}" ${f.type === 'number' ? 'min="0"' : ''} ${req}>`;
    }
    return `<label class="field ${f.full ? 'full' : ''}"><span>${esc(f.label)}${f.req ? ' *' : ''}</span>${input}</label>`;
  }).join('');
}

async function bacaForm(form, fields, lama) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'checks') {
      out[f.name] = [...form.querySelectorAll(`input[name="${f.name}"]:checked`)].map(i => i.value);
    } else if (f.type === 'image') {
      const file = form.querySelector(`input[data-img="${f.name}"]`).files[0];
      if (file) {
        if (file.size > 350 * 1024) throw new Error('Ukuran foto maksimal 350 KB. Kecilkan dulu fotonya.');
        out[f.name] = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(file); });
      } else {
        out[f.name] = lama[f.name] || '';
      }
    } else {
      const raw = form.elements[f.name].value;
      if (f.req && raw === '') throw new Error(`${f.label} wajib diisi.`);
      if (f.type === 'number') out[f.name] = raw === '' ? null : Number(raw);
      else if (f.num && raw !== '') out[f.name] = Number(raw);
      else out[f.name] = raw;
    }
  }
  return out;
}

const tutupModal = () => { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; };

function openModal(judul, fields, nilai, onSave) {
  const box = $('#modal');
  box.innerHTML = `<div class="modal-box">
    <div class="modal-head"><h3>${esc(judul)}</h3><button class="icon-btn" type="button" data-tutup>✕</button></div>
    <form id="mform" class="form-grid">
      ${formHTML(fields, nilai)}
      <p class="form-error" id="merr"></p>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-tutup>Batal</button>
        <button class="btn" type="submit">Simpan</button>
      </div>
    </form></div>`;
  box.classList.remove('hidden');
  box.querySelectorAll('[data-tutup]').forEach(b => (b.onclick = tutupModal));
  $('#mform').onsubmit = async e => {
    e.preventDefault();
    try {
      const data = await bacaForm($('#mform'), fields, nilai);
      const err = onSave(data);
      if (err) { $('#merr').textContent = err; return; }
      tutupModal();
      render();
    } catch (ex) {
      $('#merr').textContent = ex.message;
    }
  };
}

function openInfo(judul, html) {
  const box = $('#modal');
  box.innerHTML = `<div class="modal-box">
    <div class="modal-head"><h3>${esc(judul)}</h3><button class="icon-btn" type="button" data-tutup>✕</button></div>
    ${html}</div>`;
  box.classList.remove('hidden');
  box.querySelector('[data-tutup]').onclick = tutupModal;
}

/* ===== CRUD generik ===== */
const CFG = {};

const aksiBtn = (tbl, r, cfg) => `<div class="row-actions">
  ${cfg.extra ? cfg.extra(r) : ''}
  ${cfg.ubah ? `<button class="btn tiny ghost" data-act="edit" data-tbl="${tbl}" data-id="${r.id}">Ubah</button>` : ''}
  ${cfg.hapus ? `<button class="btn tiny danger" data-act="hapus" data-tbl="${tbl}" data-id="${r.id}">Hapus</button>` : ''}
</div>`;

function crud(tbl, cfg) {
  CFG[tbl] = cfg;
  const rows = DB.all(tbl).slice().sort((a, b) => b.id - a.id);
  const adaAksi = cfg.ubah || cfg.hapus || cfg.extra;
  const tombolTambah = cfg.tambah
    ? `<button class="btn" data-act="tambah" data-tbl="${tbl}">${cfg.labelTambah || '+ Tambah'}</button>`
    : '';
  const kolom = cfg.kolom.map(k => k.h).concat(adaAksi ? ['Aksi'] : []);
  const baris = rows.map(r => cfg.kolom.map(k => k.f(r)).concat(adaAksi ? [aksiBtn(tbl, r, cfg)] : []));
  return head(cfg.judul, tombolTambah) + (cfg.catatan || '') + tabel(kolom, baris, cfg.kosong || 'Belum ada data.') + (cfg.bawah || '');
}

function openCrud(tbl, id) {
  const cfg = CFG[tbl];
  const lama = id ? DB.get(tbl, id) : {};
  openModal(`${id ? 'Ubah' : 'Tambah'} ${cfg.judul}`, cfg.fields(!!id), lama, data => {
    if (cfg.olah) cfg.olah(data, lama);
    const err = cfg.validasi ? cfg.validasi(data, lama, id) : null;
    if (err) return err;
    if (id) DB.update(tbl, id, data); else DB.add(tbl, data);
    catat(`${id ? 'Ubah' : 'Tambah'} ${cfg.judul}`, cfg.nama({ ...lama, ...data }));
    return null;
  });
}

/* ----- Konfigurasi tiap modul ----- */
function cfgTanaman() {
  return {
    judul: 'Data Tanaman',
    tambah: isAdmin(), ubah: isAdmin(), hapus: isAdmin(),
    nama: r => r.nama,
    kolom: [
      { h: 'Nama', f: r => esc(r.nama) },
      { h: 'Jenis', f: r => esc(r.jenis) },
      { h: 'Tgl tanam', f: r => tgl(r.tanggalTanam) },
      { h: 'Luas (ha)', f: r => esc(r.luas) },
      { h: 'Jumlah', f: r => rp(r.jumlah) },
      { h: 'Lokasi', f: r => esc(r.lokasi) },
      { h: 'Status', f: r => tagStatus(r.status) },
      { h: 'Prediksi panen', f: r => tgl(addDays(r.tanggalTanam, r.umurPanen)) }
    ],
    fields: () => [
      { name: 'nama', label: 'Nama tanaman', req: true },
      { name: 'jenis', label: 'Jenis tanaman', type: 'select', options: JENIS_TANAMAN, req: true },
      { name: 'tanggalTanam', label: 'Tanggal penanaman', type: 'date', req: true, def: hariIni() },
      { name: 'luas', label: 'Luas lahan (ha)', type: 'number', req: true },
      { name: 'jumlah', label: 'Jumlah tanaman (batang/pohon)', type: 'number', req: true },
      { name: 'lokasi', label: 'Lokasi penanaman', req: true },
      { name: 'status', label: 'Status tanaman', type: 'select', options: STATUS_TANAMAN, req: true },
      { name: 'umurPanen', label: 'Umur panen standar (hari)', type: 'number', req: true }
    ],
    olah: d => { d.updatedAt = hariIni(); }
  };
}

function cfgPenanaman() {
  return {
    judul: 'Data Penanaman',
    tambah: true, ubah: true, hapus: true,
    nama: r => namaTanaman(r.tanamanId),
    kolom: [
      { h: 'Tanaman', f: r => esc(namaTanaman(r.tanamanId)) },
      { h: 'Jadwal / tanggal', f: r => tgl(r.tanggal) },
      { h: 'Jumlah bibit', f: r => rp(r.bibit) },
      { h: 'Lokasi', f: r => esc(r.lokasi) },
      { h: 'Penanggung jawab', f: r => esc(namaPegawai(r.pegawaiId)) },
      { h: 'Status', f: r => tagStatus(r.status) }
    ],
    fields: () => [
      { name: 'tanamanId', label: 'Tanaman', type: 'select', num: true, req: true, options: () => DB.all('tanaman').map(t => [t.id, t.nama]) },
      { name: 'tanggal', label: 'Jadwal / tanggal penanaman', type: 'date', req: true, def: hariIni() },
      { name: 'bibit', label: 'Jumlah bibit', type: 'number', req: true },
      { name: 'lokasi', label: 'Lokasi lahan', req: true },
      { name: 'pegawaiId', label: 'Pegawai penanggung jawab', type: 'select', num: true, req: true, options: pegawaiOpts },
      { name: 'status', label: 'Status penanaman', type: 'select', options: STATUS_PENANAMAN, req: true }
    ]
  };
}

function cfgPanen() {
  return {
    judul: 'Data Panen',
    tambah: true, ubah: true, hapus: true,
    nama: r => `Panen ${rp(r.kg)} kg`,
    kolom: [
      { h: 'Tanggal', f: r => tgl(r.tanggal) },
      { h: 'Tanaman', f: r => esc(tanamanDariPanen(r)) },
      { h: 'Hasil', f: r => `${rp(r.kg)} kg` },
      { h: 'Grade', f: r => `<span class="tag green">Grade ${esc(r.kualitas)}</span>` },
      { h: 'Lokasi', f: r => esc(r.lokasi) },
      { h: 'Pemanen', f: r => esc(namaPegawai(r.pegawaiId)) },
      { h: 'Dokumentasi', f: r => r.foto ? `<img class="thumb" src="${r.foto}" alt="Foto panen">` : '<span class="muted">-</span>' }
    ],
    fields: () => [
      { name: 'penanamanId', label: 'Penanaman', type: 'select', num: true, req: true, options: () => DB.all('penanaman').map(p => [p.id, penanamanLabel(p)]) },
      { name: 'tanggal', label: 'Tanggal panen', type: 'date', req: true, def: hariIni() },
      { name: 'kg', label: 'Jumlah hasil (kg)', type: 'number', req: true },
      { name: 'kualitas', label: 'Kualitas (grade)', type: 'select', req: true, options: [['A', 'Grade A - Super'], ['B', 'Grade B - Baik'], ['C', 'Grade C - Standar']] },
      { name: 'lokasi', label: 'Lokasi panen', req: true },
      { name: 'pegawaiId', label: 'Pegawai yang memanen', type: 'select', num: true, req: true, options: pegawaiOpts },
      { name: 'foto', label: 'Dokumentasi (foto, maks 350 KB)', type: 'image', full: true }
    ]
  };
}

function cfgBarang() {
  return {
    judul: 'Data Barang',
    tambah: isAdmin(), ubah: isAdmin(), hapus: isAdmin(),
    labelTambah: '+ Tambah Barang',
    nama: r => r.nama,
    kolom: [
      { h: 'Kode', f: r => esc(r.kode) },
      { h: 'Nama barang', f: r => esc(r.nama) },
      { h: 'Kategori', f: r => esc(r.kategori) },
      { h: 'Stok', f: r => `<span class="${r.stok <= r.minStok ? 'text-red' : ''}">${rp(r.stok)} ${esc(r.satuan)}</span>` },
      { h: 'Batas minimum', f: r => rp(r.minStok) },
      { h: 'Tgl masuk', f: r => tgl(r.tanggalMasuk) },
      { h: 'Terakhir keluar', f: r => tgl(keluarTerakhir(r.id)) }
    ],
    fields: () => [
      { name: 'kode', label: 'Kode barang', req: true },
      { name: 'nama', label: 'Nama barang', req: true },
      { name: 'kategori', label: 'Kategori', type: 'select', options: KATEGORI_BARANG, req: true },
      { name: 'stok', label: 'Jumlah stok', type: 'number', req: true },
      { name: 'satuan', label: 'Satuan (kg, botol, buah, ...)', req: true },
      { name: 'minStok', label: 'Batas stok menipis', type: 'number', req: true },
      { name: 'tanggalMasuk', label: 'Tanggal barang masuk', type: 'date', def: hariIni() }
    ]
  };
}

function cfgPegawai() {
  return {
    judul: 'Data Pegawai',
    tambah: true, ubah: true, hapus: true,
    nama: r => r.nama,
    extra: r => `<button class="btn tiny ghost" data-act="riwayat" data-id="${r.id}">Riwayat</button>`,
    kolom: [
      { h: 'Nama', f: r => esc(r.nama) },
      { h: 'ID', f: r => esc(r.idPegawai) },
      { h: 'Jabatan', f: r => esc(r.jabatan) },
      { h: 'Telepon', f: r => esc(r.telepon) },
      { h: 'Status kerja', f: r => esc(r.statusKerja) },
      { h: 'Akses', f: r => (r.akses || []).map(a => `<span class="tag">${AKSES[a]}</span>`).join(' ') || '<span class="muted">Laporan harian saja</span>' }
    ],
    fields: isEdit => [
      { name: 'nama', label: 'Nama pegawai', req: true },
      { name: 'idPegawai', label: 'ID pegawai', req: true },
      { name: 'jabatan', label: 'Jabatan', req: true },
      { name: 'telepon', label: 'Nomor telepon', type: 'tel', req: true },
      { name: 'alamat', label: 'Alamat', type: 'textarea', full: true },
      { name: 'statusKerja', label: 'Status kepegawaian', type: 'select', options: ['Tetap', 'Kontrak', 'Harian'], req: true },
      { name: 'username', label: 'Username login', req: true },
      { name: 'password', label: isEdit ? 'Password baru (kosongkan jika tidak diubah)' : 'Password', req: !isEdit },
      { name: 'akses', label: 'Fitur yang diizinkan admin', type: 'checks', full: true, options: [['penanaman', 'Penanaman'], ['panen', 'Panen'], ['gudang', 'Gudang']] }
    ],
    validasi: (d, lama, id) => {
      if (d.username === 'admin' || DB.all('pegawai').some(p => p.username === d.username && p.id !== id)) {
        return 'Username sudah dipakai. Pilih username lain.';
      }
      if (id && !d.password) d.password = lama.password;
      return null;
    }
  };
}

/* ----- Aksi transaksi gudang ----- */
function openTransaksi() {
  const fields = [
    { name: 'barangId', label: 'Barang', type: 'select', num: true, req: true,
      options: () => DB.all('barang').map(b => [b.id, `${b.nama} (stok ${rp(b.stok)} ${b.satuan})`]) },
    { name: 'jenis', label: 'Jenis transaksi', type: 'select', options: ['Masuk', 'Keluar'], req: true },
    { name: 'jumlah', label: 'Jumlah', type: 'number', req: true },
    { name: 'tanggal', label: 'Tanggal', type: 'date', req: true, def: hariIni() },
    { name: 'penanamanId', label: 'Dipakai untuk penanaman', type: 'select', num: true, kosong: '- Tidak terkait -',
      options: () => DB.all('penanaman').map(p => [p.id, penanamanLabel(p)]) },
    { name: 'keterangan', label: 'Keterangan', full: true }
  ];
  openModal('Catat Transaksi Stok', fields, { jenis: 'Keluar', tanggal: hariIni() }, data => {
    const b = DB.get('barang', data.barangId);
    if (!b) return 'Barang tidak ditemukan.';
    if (!(data.jumlah > 0)) return 'Jumlah harus lebih dari 0.';
    const stokBaru = data.jenis === 'Masuk' ? b.stok + data.jumlah : b.stok - data.jumlah;
    if (stokBaru < 0) return `Stok tidak cukup. Sisa ${rp(b.stok)} ${b.satuan}.`;
    DB.update('barang', b.id, data.jenis === 'Masuk' ? { stok: stokBaru, tanggalMasuk: data.tanggal } : { stok: stokBaru });
    DB.add('transaksi', { ...data, penanamanId: data.penanamanId || null });
    catat(`Transaksi stok ${data.jenis}`, `${b.nama} ${rp(data.jumlah)} ${b.satuan}`);
    return null;
  });
}

/* ----- Laporan harian pegawai ----- */
function openLapor() {
  const u = me();
  openModal('Kirim Laporan Harian', [
    { name: 'tanggal', label: 'Tanggal kegiatan', type: 'date', req: true, def: hariIni() },
    { name: 'jenis', label: 'Jenis kegiatan', type: 'select', options: JENIS_KEGIATAN, req: true },
    { name: 'lokasi', label: 'Lokasi lahan', req: true },
    { name: 'deskripsi', label: 'Deskripsi kegiatan', type: 'textarea', req: true, full: true }
  ], {}, data => {
    DB.add('laporan', { pegawaiId: u.id, ...data, dibaca: false });
    catat('Kirim laporan harian', `${data.jenis} · ${data.lokasi}`);
    return null;
  });
}

/* ----- Riwayat pegawai ----- */
function riwayatPegawai(id) {
  const p = DB.get('pegawai', id);
  const logs = DB.all('log').filter(l => l.aktorKey === 'p' + id).slice(0, 50);
  const jumlah = {
    tanam: DB.all('penanaman').filter(x => x.pegawaiId === id).length,
    panen: DB.all('panen').filter(x => x.pegawaiId === id).length,
    lap: DB.all('laporan').filter(x => x.pegawaiId === id).length
  };
  openInfo(`Riwayat · ${p.nama}`, `
    <div class="stats small">
      <div class="stat"><span>Penanaman</span><strong>${jumlah.tanam}</strong></div>
      <div class="stat"><span>Panen</span><strong>${jumlah.panen}</strong></div>
      <div class="stat"><span>Laporan harian</span><strong>${jumlah.lap}</strong></div>
    </div>
    <h4>Aktivitas di aplikasi</h4>
    <ul class="activity">${logs.map(l => `<li>${esc(l.aksi)} <span class="muted">${esc(l.entitas)}</span><br>
      <small class="muted">${new Date(l.waktu).toLocaleString('id-ID')}</small></li>`).join('') || '<li class="muted">Belum ada aktivitas.</li>'}</ul>`);
}

/* ===== Halaman ===== */
function pageDashboard() {
  const t = DB.all('tanaman'), pn = DB.all('panen'), b = DB.all('barang'), p = DB.all('pegawai');
  const totalKg = pn.reduce((s, x) => s + (x.kg || 0), 0);
  const kartu = [
    ['Total tanaman', t.length, 'jenis tanaman dikelola'],
    ['Sedang ditanam', t.filter(x => ['Ditanam', 'Dalam perawatan'].includes(x.status)).length, 'tanaman aktif di lahan'],
    ['Siap panen', t.filter(x => x.status === 'Siap panen').length, 'tanaman siap dipanen'],
    ['Total hasil panen', `${rp(totalKg)} kg`, `${pn.length} kali panen tercatat`],
    ['Barang di gudang', b.length, 'jenis barang terdaftar'],
    ['Jumlah pegawai', p.length, 'tenaga kerja terdaftar']
  ];
  const aktivitas = DB.all('log').slice(0, 8).map(l => `
    <li><strong>${esc(l.aktorNama)}</strong> ${esc(l.aksi)} <span class="muted">${esc(l.entitas)}</span><br>
    <small class="muted">${new Date(l.waktu).toLocaleString('id-ID')}</small></li>`).join('')
    || '<li class="muted">Belum ada aktivitas.</li>';

  return {
    html: head('Dashboard') + `
      <div class="stats">${kartu.map(c => `<div class="stat"><span>${c[0]}</span><strong>${c[1]}</strong><small>${c[2]}</small></div>`).join('')}</div>
      <div class="grid-2">
        <div class="card"><h3>Penanaman & panen, 6 bulan terakhir</h3><canvas id="chart-tren" height="180"></canvas></div>
        <div class="card"><h3>Aktivitas terbaru</h3><ul class="activity">${aktivitas}</ul></div>
      </div>`,
    after: gambarGrafik
  };
}

let grafik = null;
function gambarGrafik() {
  const canvas = $('#chart-tren');
  if (!canvas) return;
  if (!window.Chart) {
    canvas.outerHTML = '<p class="muted">Grafik membutuhkan koneksi internet untuk memuat Chart.js.</p>';
    return;
  }
  const bulan = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    bulan.push({ key: fmt(d).slice(0, 7), label: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }) });
  }
  const tanam = bulan.map(b => DB.all('penanaman').filter(p => p.tanggal.startsWith(b.key)).length);
  const panen = bulan.map(b => DB.all('panen').filter(p => p.tanggal.startsWith(b.key)).reduce((s, x) => s + (x.kg || 0), 0));
  if (grafik) grafik.destroy();
  grafik = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: bulan.map(b => b.label),
      datasets: [
        { label: 'Kegiatan penanaman', data: tanam, backgroundColor: '#7fb77e' },
        { label: 'Hasil panen (kg)', data: panen, backgroundColor: '#1f5d3a', yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Kegiatan' } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'kg' } }
      }
    }
  });
}

function pageGudang() {
  const b = DB.all('barang');
  const menipis = b.filter(x => x.stok <= x.minStok);
  const trx = DB.all('transaksi').slice().sort((a, c) => c.id - a.id).slice(0, 100);
  const bawah = `<div class="card">
    <div class="page-head"><h3>Riwayat transaksi stok</h3>
      <div class="page-actions">${bisa('gudang') ? '<button class="btn" data-act="transaksi">+ Catat transaksi</button>' : ''}</div></div>
    ${tabel(['Tanggal', 'Barang', 'Jenis', 'Jumlah', 'Penanaman', 'Keterangan'], trx.map(t => {
      const brg = DB.get('barang', t.barangId) || {};
      const pj = DB.get('penanaman', t.penanamanId);
      return [
        tgl(t.tanggal),
        esc(brg.nama || '-'),
        t.jenis === 'Masuk' ? '<span class="tag green">Masuk</span>' : '<span class="tag red">Keluar</span>',
        `${rp(t.jumlah)} ${esc(brg.satuan || '')}`,
        pj ? esc(penanamanLabel(pj)) : '-',
        esc(t.keterangan)
      ];
    }), 'Belum ada transaksi.')}
  </div>`;
  const cfg = cfgBarang();
  cfg.catatan = menipis.length
    ? `<div class="alert">⚠️ ${menipis.length} barang stoknya menipis: ${menipis.map(x => esc(x.nama)).join(', ')}</div>`
    : '';
  cfg.bawah = bawah;
  return { html: crud('barang', cfg) };
}

function pageAktivitas() {
  const u = me();
  if (u.tipe === 'pegawai') {
    const rows = DB.all('laporan').filter(l => l.pegawaiId === u.id).sort((a, b) => b.id - a.id);
    return {
      html: head('Laporan Harian', '<button class="btn" data-act="lapor">+ Kirim Laporan</button>') +
        tabel(['Tanggal', 'Jenis', 'Lokasi', 'Deskripsi'],
          rows.map(l => [tgl(l.tanggal), esc(l.jenis), esc(l.lokasi), esc(l.deskripsi)]),
          'Belum ada laporan yang dikirim. Gunakan tombol di atas untuk melapor kegiatan di lapangan.')
    };
  }
  const rows = DB.all('laporan').slice().sort((a, b) => b.id - a.id);
  return {
    html: head('Laporan Harian Pegawai') +
      tabel(['Tanggal', 'Pegawai', 'Jenis', 'Lokasi', 'Deskripsi', 'Status'],
        rows.map(l => [
          tgl(l.tanggal), esc(namaPegawai(l.pegawaiId)), esc(l.jenis), esc(l.lokasi), esc(l.deskripsi),
          l.dibaca ? '<span class="muted">Dibaca</span>' : '<span class="tag green">Baru</span>'
        ]), 'Belum ada laporan dari pegawai.'),
    after: () => { DB.all('laporan').forEach(l => (l.dibaca = true)); DB.simpan(); }
  };
}

function pageNotifikasi() {
  const list = notifikasi();
  const ikon = { Panen: '🧺', Jadwal: '🗓️', Stok: '📦', Laporan: '📝', Update: '⏳' };
  const html = head('Notifikasi') + (list.length
    ? `<div class="notif-list">${list.map(n => `
        <div class="notif">
          <span class="notif-ico">${ikon[n.jenis] || '🔔'}</span>
          <div><strong>${esc(n.judul)}</strong><div class="muted">${esc(n.detail)}</div></div>
          <span class="tag">${esc(n.jenis)}</span>
        </div>`).join('')}</div>`
    : '<div class="empty">Tidak ada notifikasi. Semua berjalan normal.</div>');
  return { html, after: () => { DB.all('laporan').forEach(l => (l.dibaca = true)); DB.simpan(); } };
}

/* ----- Laporan ----- */
const LAP_DEFAULT = { jenis: 'penanaman', dari: '', sampai: '', bulan: '', tahun: '', jenisTanaman: '' };
let LAP = { ...LAP_DEFAULT };
let LAP_DATA = null;

function cocokTgl(tg) {
  if (!tg) return true;
  if (LAP.dari && tg < LAP.dari) return false;
  if (LAP.sampai && tg > LAP.sampai) return false;
  if (LAP.bulan && !tg.startsWith(LAP.bulan)) return false;
  if (LAP.tahun && !tg.startsWith(LAP.tahun)) return false;
  return true;
}
const cocokJenis = tanamanId => !LAP.jenisTanaman || jenisTanaman(tanamanId) === LAP.jenisTanaman;
const urut = (arr, k) => arr.slice().sort((a, b) => String(b[k] || '').localeCompare(String(a[k] || '')));

function dataLaporan() {
  switch (LAP.jenis) {
    case 'penanaman': {
      const rows = urut(DB.all('penanaman').filter(p => cocokTgl(p.tanggal) && cocokJenis(p.tanamanId)), 'tanggal');
      return {
        judul: 'Laporan Penanaman', file: 'laporan-penanaman',
        kolom: ['Tanggal', 'Tanaman', 'Jenis', 'Lokasi', 'Bibit', 'Penanggung jawab', 'Status'],
        baris: rows.map(p => [p.tanggal, namaTanaman(p.tanamanId), jenisTanaman(p.tanamanId), p.lokasi, p.bibit, namaPegawai(p.pegawaiId), p.status])
      };
    }
    case 'perkembangan': {
      const rows = urut(DB.all('tanaman').filter(t => cocokTgl(t.tanggalTanam) && (!LAP.jenisTanaman || t.jenis === LAP.jenisTanaman)), 'tanggalTanam');
      return {
        judul: 'Laporan Perkembangan Tanaman', file: 'laporan-perkembangan',
        kolom: ['Tanaman', 'Jenis', 'Lokasi', 'Tgl tanam', 'Umur (hari)', 'Luas (ha)', 'Jumlah', 'Status', 'Prediksi panen'],
        baris: rows.map(t => [t.nama, t.jenis, t.lokasi, t.tanggalTanam, selisih(hariIni(), t.tanggalTanam), t.luas, t.jumlah, t.status, addDays(t.tanggalTanam, t.umurPanen)])
      };
    }
    case 'panen': {
      const rows = urut(DB.all('panen').filter(p => {
        const pj = DB.get('penanaman', p.penanamanId);
        return cocokTgl(p.tanggal) && (!pj || cocokJenis(pj.tanamanId));
      }), 'tanggal');
      const total = rows.reduce((s, x) => s + (x.kg || 0), 0);
      return {
        judul: 'Laporan Hasil Panen', file: 'laporan-panen',
        ringkas: `Total panen: ${rp(total)} kg dari ${rows.length} kali panen`,
        kolom: ['Tanggal', 'Tanaman', 'Jenis', 'Hasil (kg)', 'Grade', 'Lokasi', 'Pemanen'],
        baris: rows.map(p => {
          const pj = DB.get('penanaman', p.penanamanId);
          return [p.tanggal, tanamanDariPanen(p), pj ? jenisTanaman(pj.tanamanId) : '-', p.kg, p.kualitas, p.lokasi, namaPegawai(p.pegawaiId)];
        })
      };
    }
    case 'stok':
      return {
        judul: 'Laporan Stok Gudang', file: 'laporan-stok',
        ringkas: 'Filter tanggal dan jenis tanaman tidak berlaku untuk laporan stok.',
        kolom: ['Kode', 'Nama', 'Kategori', 'Stok', 'Satuan', 'Batas minimum', 'Keterangan', 'Tgl masuk', 'Terakhir keluar'],
        baris: DB.all('barang').map(b => [b.kode, b.nama, b.kategori, b.stok, b.satuan, b.minStok, b.stok <= b.minStok ? 'Menipis' : 'Aman', b.tanggalMasuk || '-', keluarTerakhir(b.id) || '-'])
      };
    case 'keluarmasuk': {
      const rows = urut(DB.all('transaksi').filter(t => cocokTgl(t.tanggal)), 'tanggal');
      return {
        judul: 'Laporan Barang Masuk dan Keluar', file: 'laporan-masuk-keluar',
        kolom: ['Tanggal', 'Barang', 'Jenis', 'Jumlah', 'Satuan', 'Penanaman', 'Keterangan'],
        baris: rows.map(t => {
          const b = DB.get('barang', t.barangId) || {};
          const p = DB.get('penanaman', t.penanamanId);
          return [t.tanggal, b.nama || '-', t.jenis, t.jumlah, b.satuan || '-', p ? penanamanLabel(p) : '-', t.keterangan || '-'];
        })
      };
    }
    case 'aktivitas': {
      const rows = urut(DB.all('laporan').filter(l => cocokTgl(l.tanggal)), 'tanggal');
      return {
        judul: 'Laporan Aktivitas Pegawai', file: 'laporan-aktivitas',
        kolom: ['Tanggal', 'Pegawai', 'Jenis kegiatan', 'Lokasi', 'Deskripsi'],
        baris: rows.map(l => [l.tanggal, namaPegawai(l.pegawaiId), l.jenis, l.lokasi, l.deskripsi])
      };
    }
  }
}

function pageLaporan() {
  const lap = dataLaporan();
  LAP_DATA = lap;
  const pilihan = Object.entries(JENIS_LAPORAN)
    .map(([k, l]) => `<option value="${k}" ${LAP.jenis === k ? 'selected' : ''}>${l}</option>`).join('');
  const opsiJenis = JENIS_TANAMAN
    .map(j => `<option value="${j}" ${LAP.jenisTanaman === j ? 'selected' : ''}>${j}</option>`).join('');

  return {
    html: head('Laporan', `
        <button class="btn ghost" data-act="csv">⬇ Excel (CSV)</button>
        <button class="btn" data-act="cetak">🖨 Cetak / PDF</button>`) + `
      <div class="filter-bar no-print">
        <label>Jenis laporan<select data-lap="jenis">${pilihan}</select></label>
        <label>Dari tanggal<input type="date" data-lap="dari" value="${LAP.dari}"></label>
        <label>Sampai tanggal<input type="date" data-lap="sampai" value="${LAP.sampai}"></label>
        <label>Bulan<input type="month" data-lap="bulan" value="${LAP.bulan}"></label>
        <label>Tahun<input type="number" data-lap="tahun" placeholder="2026" value="${LAP.tahun}"></label>
        <label>Jenis tanaman<select data-lap="jenisTanaman"><option value="">Semua</option>${opsiJenis}</select></label>
        <button class="btn ghost" data-act="resetLap">Reset filter</button>
      </div>
      <div class="card print-area">
        <h3>${lap.judul}</h3>
        <p class="muted">${lap.ringkas ? esc(lap.ringkas) : `Jumlah data: ${lap.baris.length}`}</p>
        ${tabel(lap.kolom, lap.baris.map(r => r.map(c => esc(c))), 'Tidak ada data untuk filter ini.')}
      </div>`
  };
}

function unduhCSV(d) {
  const sel = v => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const isi = [d.kolom, ...d.baris].map(r => r.map(sel).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + isi], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${d.file}_${hariIni()}.csv`;
  a.click();
}

/* ----- Kalender ----- */
let KAL = { y: new Date().getFullYear(), m: new Date().getMonth() };
function geserKal(d) {
  KAL.m += d;
  if (KAL.m < 0) { KAL.m = 11; KAL.y--; }
  if (KAL.m > 11) { KAL.m = 0; KAL.y++; }
}

function pageKalender() {
  const ev = {};
  const tambahEv = (tg, txt, cls) => { if (!tg) return; (ev[tg] = ev[tg] || []).push({ txt, cls }); };
  DB.all('penanaman').forEach(p => tambahEv(p.tanggal, `Tanam: ${namaTanaman(p.tanamanId)}`, 'c-tanam'));
  DB.all('panen').forEach(p => tambahEv(p.tanggal, `Panen: ${tanamanDariPanen(p)} (${rp(p.kg)} kg)`, 'c-panen'));
  DB.all('tanaman').filter(t => t.status !== 'Selesai').forEach(t =>
    tambahEv(addDays(t.tanggalTanam, t.umurPanen), `Prediksi panen: ${t.nama}`, 'c-prediksi'));

  const awal = new Date(KAL.y, KAL.m, 1);
  const offset = (awal.getDay() + 6) % 7; // minggu dimulai Senin
  const jumlahHari = new Date(KAL.y, KAL.m + 1, 0).getDate();
  const namaBulan = awal.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const hariHead = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(h => `<div class="cal-head">${h}</div>`).join('');
  let sel = hariHead;
  for (let i = 0; i < offset; i++) sel += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= jumlahHari; d++) {
    const key = fmt(new Date(KAL.y, KAL.m, d));
    const items = (ev[key] || []).map(e => `<div class="ev ${e.cls}">${esc(e.txt)}</div>`).join('');
    sel += `<div class="cal-cell ${key === hariIni() ? 'today' : ''}"><span class="cal-num">${d}</span>${items}</div>`;
  }

  return {
    html: head('Kalender Pertanian') + `
      <div class="card">
        <div class="cal-nav">
          <button class="btn ghost" data-act="kal" data-d="-1">‹ Sebelumnya</button>
          <strong>${namaBulan}</strong>
          <button class="btn ghost" data-act="kal" data-d="1">Berikutnya ›</button>
        </div>
        <div class="cal-grid">${sel}</div>
        <div class="legend">
          <span class="ev c-tanam">Jadwal tanam</span>
          <span class="ev c-panen">Panen</span>
          <span class="ev c-prediksi">Prediksi panen</span>
        </div>
      </div>`
  };
}

/* ===== Router & render ===== */
const PAGES = {
  dashboard: pageDashboard,
  tanaman: () => ({ html: crud('tanaman', cfgTanaman()) }),
  penanaman: () => ({ html: crud('penanaman', cfgPenanaman()) }),
  panen: () => ({ html: crud('panen', cfgPanen()) }),
  gudang: pageGudang,
  pegawai: () => ({ html: crud('pegawai', cfgPegawai()) }),
  aktivitas: pageAktivitas,
  laporan: pageLaporan,
  kalender: pageKalender,
  notifikasi: pageNotifikasi
};

function showLogin() {
  $('#app').classList.add('hidden');
  $('#login-page').classList.remove('hidden');
}

function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#overlay').classList.remove('show');
}

function render() {
  const u = me();
  if (!u) return showLogin();
  $('#login-page').classList.add('hidden');
  $('#app').classList.remove('hidden');

  let r = location.hash.slice(1) || 'dashboard';
  const m = MENU.find(x => x.id === r);
  if (!m || !menuVisible(m)) r = 'dashboard';

  const page = PAGES[r]();
  $('#content').innerHTML = page.html;
  if (page.after) page.after();

  $('#page-title').textContent = MENU.find(x => x.id === r).label;
  $('#user-name').textContent = `${u.nama} · ${u.tipe === 'admin' ? 'Admin' : 'Pegawai'}`;
  renderNav(r);

  const n = isAdmin() ? notifikasi().length : 0;
  $('#badge').textContent = n;
  $('#badge').classList.toggle('hidden', n === 0);
  $('#bell').classList.toggle('hidden', !isAdmin());

  closeSidebar();
  window.scrollTo(0, 0);
}

/* ===== Event handler ===== */
function aksiKlik(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act, tbl = b.dataset.tbl, id = Number(b.dataset.id);
  switch (act) {
    case 'tambah': return openCrud(tbl);
    case 'edit': return openCrud(tbl, id);
    case 'hapus': {
      const cfg = CFG[tbl], row = DB.get(tbl, id);
      if (!row || !confirm('Hapus data ini? Tindakan ini tidak bisa dibatalkan.')) return;
      DB.remove(tbl, id);
      catat(`Hapus ${cfg.judul}`, cfg.nama(row));
      return render();
    }
    case 'riwayat': return riwayatPegawai(id);
    case 'transaksi': return openTransaksi();
    case 'lapor': return openLapor();
    case 'kal': geserKal(Number(b.dataset.d)); return render();
    case 'csv': return unduhCSV(LAP_DATA);
    case 'cetak': return window.print();
    case 'resetLap': LAP = { ...LAP_DEFAULT }; return render();
  }
}

function login(e) {
  e.preventDefault();
  const u = $('#l-user').value.trim(), p = $('#l-pass').value;
  let sesi = null;
  const adm = DB.all('users').find(x => x.username === u && x.password === p);
  if (adm) sesi = { tipe: 'admin', id: adm.id };
  else {
    const pg = DB.all('pegawai').find(x => x.username === u && x.password === p);
    if (pg) sesi = { tipe: 'pegawai', id: pg.id };
  }
  if (!sesi) { $('#l-err').textContent = 'Username atau password salah.'; return; }
  localStorage.setItem(SESI_KEY, JSON.stringify(sesi));
  catat('Masuk ke sistem', '-');
  $('#l-err').textContent = '';
  $('#login-form').reset();
  location.hash = '#dashboard';
  render();
}

function setAuthMode(mode) {
  const isRegister = mode === 'register';
  $('#login-form').classList.toggle('hidden', isRegister);
  $('#register-form').classList.toggle('hidden', !isRegister);
  $('#login-hint').classList.toggle('hidden', isRegister);
  $('#show-login').classList.toggle('active', !isRegister);
  $('#show-register').classList.toggle('active', isRegister);
  $('#l-err').textContent = '';
  $('#r-msg').textContent = '';
  $('#r-msg').classList.remove('error');
}

async function daftarPegawai(e) {
  e.preventDefault();
  const nama = $('#r-nama').value.trim();
  const idPegawai = $('#r-id').value.trim();
  const email = $('#r-email').value.trim();
  const jabatan = $('#r-jabatan').value.trim();
  const telepon = $('#r-telepon').value.trim();
  const alamat = $('#r-alamat').value.trim();
  const password = $('#r-pass').value;
  const ulangi = $('#r-pass2').value;
  const msg = $('#r-msg');
  msg.classList.remove('error');
  if (password !== ulangi) {
    msg.textContent = 'Konfirmasi password tidak sama.';
    msg.classList.add('error');
    return;
  }
  const submit = $('#register-form button[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Mengirim...';
  msg.textContent = 'Sedang mengirim pendaftaran...';
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { nama, id_pegawai: idPegawai, jabatan, telepon, alamat } }
    });
    if (error) throw error;
    if (!data.user) throw new Error('Pendaftaran belum berhasil. Silakan coba lagi.');
    $('#register-form').reset();
    msg.textContent = data.session
      ? 'Pendaftaran terkirim. Akun menunggu verifikasi admin sebelum dapat digunakan.'
      : 'Pendaftaran terkirim. Periksa email untuk verifikasi akun. Setelah itu admin akan memeriksa pendaftaran pegawai.';
  } catch (err) {
    msg.textContent = err.message || 'Pendaftaran gagal. Periksa data dan koneksi, lalu coba lagi.';
    msg.classList.add('error');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Kirim Pendaftaran';
  }
}

function init() {
  DB.init();
  $('#login-form').onsubmit = login;
  $('#register-form').onsubmit = daftarPegawai;
  $('#show-login').onclick = () => setAuthMode('login');
  $('#show-register').onclick = () => setAuthMode('register');
  $('#logout').onclick = () => {
    catat('Keluar dari sistem', '-');
    localStorage.removeItem(SESI_KEY);
    location.hash = '';
    render();
  };
  $('#menu-btn').onclick = () => {
    $('#sidebar').classList.add('open');
    $('#overlay').classList.add('show');
  };
  $('#overlay').onclick = closeSidebar;
  $('#content').addEventListener('click', aksiKlik);
  $('#content').addEventListener('change', e => {
    const k = e.target.dataset.lap;
    if (!k) return;
    LAP[k] = e.target.value;
    render();
  });
  window.addEventListener('hashchange', render);
  render();
}

init();
