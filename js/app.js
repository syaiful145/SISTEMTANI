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
const KATEGORI_BARANG = ['Pupuk', 'Bibit', 'Hasil Panen', 'Pestisida', 'Peralatan pertanian', 'Perlengkapan lainnya'];
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
let ACTIVE_USER = null;
let PASSWORD_CHANGE_REQUIRED = false;

function me() { return ACTIVE_USER; }
// Normalisasi level admin agar nilai dari profil tetap konsisten saat dipakai UI.
function isAdminUtama() { return isAdmin() && String(me()?.adminLevel || '').trim().toLowerCase() === 'utama'; }

async function muatPenggunaAuth(user) {
  if (!user) { ACTIVE_USER = null; return null; }
  const { data: profil, error: profilError } = await supabaseClient
    .from('profiles').select('id,nama,role,pegawai_id,admin_level,avatar_url').eq('id', user.id).maybeSingle();
  if (profilError) throw profilError;
  if (!profil) throw new Error('Profil akun tidak ditemukan. Hubungi administrator.');
  if (profil.role === 'admin') {
    ACTIVE_USER = { tipe: 'admin', key: 'admin', nama: profil.nama || 'Administrator', akses: Object.keys(AKSES), authId: user.id, adminLevel: String(profil.admin_level || '').trim().toLowerCase(), avatarUrl: profil.avatar_url || '' };
    return ACTIVE_USER;
  }
  const { data: pegawai, error: pegawaiError } = await supabaseClient
    .from('pegawai').select('id,nama,akses,status_verifikasi,alasan_penolakan').eq('auth_user_id', user.id).maybeSingle();
  if (pegawaiError) throw pegawaiError;
  if (!pegawai) throw new Error('Data pegawai tidak ditemukan. Hubungi administrator.');
  if (pegawai.status_verifikasi !== 'disetujui') {
    const alasan = pegawai.status_verifikasi === 'ditolak' && pegawai.alasan_penolakan ? ` Alasan: ${pegawai.alasan_penolakan}` : '';
    throw new Error(`Akun pegawai masih ${pegawai.status_verifikasi || 'menunggu'} verifikasi admin.${alasan}`);
  }
  ACTIVE_USER = { tipe: 'pegawai', key: 'p' + pegawai.id, nama: pegawai.nama, id: pegawai.id, akses: pegawai.akses || [], authId: user.id, avatarUrl: profil.avatar_url || '' };
  return ACTIVE_USER;
}
const isAdmin = () => me()?.tipe === 'admin';
const bisa = fitur => { const u = me(); return !!u && (u.tipe === 'admin' || u.akses.includes(fitur)); };
const catat = (aksi, entitas) => { const u = me(); return DB.log(u ? u.key : 'sistem', u ? u.nama : 'Sistem', aksi, entitas); };

/* ===== Menu & navigasi berkelompok ===== */
const MENU = [
  { id: 'dashboard', label: 'Dashboard', pegawaiLabel: 'Beranda', icon: '🏠' },
  { id: 'lahan', label: 'Data Lahan', icon: '🗺️', adminOnly: true },
  { id: 'tanaman', label: 'Tanaman', icon: '🌿' },
  { id: 'penanaman', label: 'Penanaman', icon: '🌱', akses: 'penanaman' },
  { id: 'panen', label: 'Panen', icon: '🧺', akses: 'panen' },
  { id: 'pupuk', label: 'Gudang', icon: '📦', akses: 'gudang' },
  { id: 'pegawai', label: 'Pegawai', icon: '👥', adminOnly: true },
  { id: 'kelompok', label: 'Kelompok Kerja', pegawaiLabel: 'Tugas Saya', icon: '👥' },
  { id: 'aktivitas', label: 'Pekerjaan Lapangan', pegawaiLabel: 'Laporan Kegiatan', icon: '📝' },
  { id: 'absensi', label: 'Absensi', icon: '🕒' },
  { id: 'laporan', label: 'Laporan', icon: '📊', adminOnly: true },
  { id: 'kalender', label: 'Kalender', icon: '📅' },
  { id: 'notifikasi', label: 'Notifikasi', icon: '🔔', adminOnly: true },
  { id: 'profil', label: 'Profil Saya', pegawaiLabel: 'Profil', icon: '👤' },
  { id: 'admins', label: 'Manajemen Admin', icon: '🛡️', adminOnly: true }
];

const NAV_GROUPS = {
  admin: [
    { label: 'Kepegawaian', ids: ['pegawai', 'absensi'] },
    { label: 'Operasional', ids: ['kelompok', 'aktivitas', 'kalender'] },
    { label: 'Pertanian', ids: ['lahan', 'tanaman', 'penanaman', 'panen'] },
    { label: 'Persediaan', ids: ['pupuk'] },
    { label: 'Laporan', ids: ['laporan'] },
    { label: 'Notifikasi', ids: ['notifikasi'] },
    { label: 'Pengaturan', ids: ['profil', 'admins'] }
  ],
  pegawai: [
    { label: 'Kegiatan Pertanian', ids: ['tanaman', 'penanaman', 'panen', 'aktivitas'] }
  ]
};

function menuVisible(m) {
  const u = me();
  if (!u) return false;
  if (u.tipe === 'admin') return true;
  if (m.adminOnly) return false;
  if (m.id === 'penanaman' || m.id === 'panen') return true; // Perilaku lama dipertahankan.
  if (m.id === 'pupuk') return Array.isArray(u.akses) && u.akses.includes('gudang');
  return !m.akses || (Array.isArray(u.akses) && u.akses.includes(m.akses));
}

function menuLabel(m) {
  return me()?.tipe === 'pegawai' && m.pegawaiLabel ? m.pegawaiLabel : m.label;
}

function renderNavLink(m, r) {
  return `<a href="#${m.id}" class="nav-link${m.id === r ? ' active' : ''}"${m.id === r ? ' aria-current="page"' : ''}><span class="nav-icon">${m.icon}</span><span>${menuLabel(m)}</span></a>`;
}

function renderNav(r) {
  const visible = MENU.filter(menuVisible);
  const byId = id => visible.find(m => m.id === id);
  const link = id => byId(id) ? renderNavLink(byId(id), r) : '';
  const groupHtml = group => {
    const items = group.ids.map(byId).filter(Boolean);
    if (!items.length) return '';
    const active = items.some(item => item.id === r);
    return `<details class="nav-group"${active ? ' open' : ''}><summary><span>${group.label}</span><span class="nav-chevron" aria-hidden="true">⌄</span></summary><div class="nav-submenu">${items.map(item => renderNavLink(item, r)).join('')}</div></details>`;
  };

  let html = link('dashboard');
  if (me()?.tipe === 'admin') {
    NAV_GROUPS.admin.forEach(group => { html += groupHtml(group); });
  } else {
    html += link('kelompok');
    html += link('absensi');
    html += groupHtml(NAV_GROUPS.pegawai[0]);
    html += link('pupuk');
    html += link('kalender');
    html += link('profil');
  }
  $('#nav').innerHTML = html;
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
    } else if (f.type === 'file') {
      input = `<input type="file" name="${f.name}" accept="image/jpeg,image/png,image/webp" ${req}>`;
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
    } else if (f.type === 'file') {
      out[f.name] = form.querySelector(`input[name="${f.name}"]`).files[0] || null;
      if (f.req && !out[f.name]) throw new Error(`${f.label} wajib diunggah.`);
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
      const err = await onSave(data);
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
  const rows = DB.all(tbl).filter(r => !cfg.filter || cfg.filter(r)).slice().sort((a, b) => b.id - a.id);
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
  openModal(`${id ? 'Ubah' : 'Tambah'} ${cfg.judul}`, cfg.fields(!!id), lama, async data => {
    if (cfg.olah) cfg.olah(data, lama);
    const err = cfg.validasi ? cfg.validasi(data, lama, id) : null;
    if (err) return err;
    if (id) await DB.update(tbl, id, data); else await DB.add(tbl, data);
    await catat(`${id ? 'Ubah' : 'Tambah'} ${cfg.judul}`, cfg.nama({ ...lama, ...data }));
    return null;
  });
}

function cfgLahan() {
  return {
    judul: 'Data Lahan',
    tambah: isAdmin(), ubah: isAdmin(), hapus: isAdminUtama(),
    labelTambah: '+ Tambah Lahan',
    nama: r => r.nama,
    extra: r => '<button class="btn tiny ghost" data-act="detailLahan" data-id="'+r.id+'">Detail</button>',
    kolom: [
      { h: 'Nama lahan', f: r => '<strong>'+esc(r.nama)+'</strong>' },
      { h: 'Luas total', f: r => rp(r.luasTotalM2)+' m²' },
      { h: 'Lokasi', f: r => esc(r.lokasi||'-') },
      { h: 'Status', f: r => r.aktif===false?'<span class="tag red">Nonaktif</span>':'<span class="tag green">Aktif</span>' }
    ],
    fields: () => [
      { name: 'nama', label: 'Nama lahan (contoh: Tanah A)', req: true },
      { name: 'luasTotalM2', label: 'Luas total (m²)', type: 'number', req: true },
      { name: 'lokasi', label: 'Alamat / lokasi lahan' },
      { name: 'keterangan', label: 'Keterangan', type: 'textarea', full: true },
      { name: 'aktif', label: 'Status lahan', type: 'select', options: [['true','Aktif'],['false','Nonaktif']], def: 'true', req: true }
    ],
    olah: d => { d.luasTotalM2=Number(d.luasTotalM2); d.aktif=d.aktif!=='false'; },
    validasi: d => !d.nama?.trim() || !Number.isFinite(Number(d.luasTotalM2)) || Number(d.luasTotalM2)<=0 ? 'Nama dan luas lahan wajib diisi dengan benar.' : null
  };
}

function detailLahan(id) {
  const land=DB.get('lahan',id); if(!land)return;
  const reports=DB.all('laporan').filter(l=>String(l.lahanId)===String(id));
  const plantReports=reports.filter(l=>l.jenis==='Penanaman');
  const used=plantReports.filter(l=>l.status==='diterima').reduce((n,l)=>n+Number(l.luasM2||0),0);
  const planted=plantReports.reduce((n,l)=>n+Number(l.jumlahDitanam||0),0);
  const crops=[...new Set(plantReports.map(l=>l.tanamanNama).filter(Boolean))];
  const rows=reports.slice().sort((a,b)=>String(b.tanggal).localeCompare(String(a.tanggal)));
  openInfo('Detail Lahan · '+esc(land.nama),
    '<div class="detail-grid">'+
    '<p><strong>Nama lahan</strong><br>'+esc(land.nama)+'</p>'+
    '<p><strong>Lokasi</strong><br>'+esc(land.lokasi||'-')+'</p>'+
    '<p><strong>Luas total</strong><br>'+rp(land.luasTotalM2)+' m²</p>'+
    '<p><strong>Luas sudah ditanami</strong><br>'+rp(used)+' m²</p>'+
    '<p><strong>Sisa lahan belum ditanami</strong><br>'+rp(Math.max(0,Number(land.luasTotalM2)-used))+' m²</p>'+
    '<p><strong>Jumlah tanaman dilaporkan</strong><br>'+rp(planted)+'</p>'+
    '<p><strong>Jenis tanaman</strong><br>'+esc(crops.join(', ')||'-')+'</p>'+
    '</div><h4>Riwayat Pekerjaan Pegawai</h4>'+
    tabel(['Tanggal','Pegawai','Tanaman','Luas','Jumlah ditanam','Status','Detail'],
      rows.map(l=>[tgl(l.tanggal),esc(namaPegawai(l.pegawaiId)),esc(l.tanamanNama||'-'),l.luasM2==null?'-':rp(l.luasM2)+' m²',l.jumlahDitanam==null?'-':rp(l.jumlahDitanam),esc(l.statusTanaman||'-'),'<button class="btn tiny ghost" data-act="detailLaporan" data-id="'+l.id+'">Detail</button>']),
      'Belum ada pekerjaan yang dilaporkan pada lahan ini.'));
}

/* ----- Konfigurasi tiap modul ----- */
function cfgTanaman() {
  return {
    judul: 'Data Tanaman',
    tambah: isAdmin(), ubah: isAdmin(), hapus: isAdminUtama(),
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
    tambah: isAdmin(), ubah: isAdmin(), hapus: isAdminUtama(),
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
    tambah: isAdmin(), ubah: isAdmin(), hapus: isAdminUtama(),
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

function detailBarang(id) {
  const b=DB.get('barang',id); if(!b)return;
  const rows=DB.all('transaksi').filter(t=>String(t.barangId)===String(id)).slice().sort((a,c)=>String(c.tanggal).localeCompare(String(a.tanggal))||c.id-a.id);
  const masuk=rows.filter(t=>t.jenis==='Masuk').reduce((n,t)=>n+Number(t.jumlah||0),0);
  const keluar=rows.filter(t=>t.jenis==='Keluar').reduce((n,t)=>n+Number(t.jumlah||0),0);
  openInfo('Detail Barang · '+esc(b.nama),
    '<div class="detail-grid"><p><strong>Kode</strong><br>'+esc(b.kode||'-')+'</p><p><strong>Kategori</strong><br>'+esc(b.kategori||'-')+'</p><p><strong>Stok saat ini</strong><br>'+rp(b.stok)+' '+esc(b.satuan||'')+'</p><p><strong>Total barang masuk tercatat</strong><br>'+rp(masuk)+' '+esc(b.satuan||'')+'</p><p><strong>Total barang keluar tercatat</strong><br>'+rp(keluar)+' '+esc(b.satuan||'')+'</p><p><strong>Batas minimum</strong><br>'+rp(b.minStok)+' '+esc(b.satuan||'')+'</p></div>'+
    '<div class="row-actions">'+(isAdmin()?'<button class="btn" data-act="transaksiMasuk" data-id="'+b.id+'">+ Barang Masuk</button><button class="btn danger" data-act="transaksiKeluar" data-id="'+b.id+'">− Barang Keluar</button>':'')+'</div>'+
    '<h4>Riwayat barang masuk dan keluar</h4>'+tabel(['Tanggal','Jenis','Jumlah','Pegawai','Keterangan'],rows.map(t=>[tgl(t.tanggal),t.jenis==='Masuk'?'<span class="tag green">Masuk</span>':'<span class="tag red">Keluar</span>',rp(t.jumlah)+' '+esc(b.satuan||''),t.pegawaiId?esc(namaPegawai(t.pegawaiId)):'-',esc(t.keterangan||'-')]),'Belum ada transaksi untuk barang ini.'));
}

function cfgBarang() {
  return {
    judul: 'Data Barang',
    tambah: isAdmin(), ubah: isAdmin(), hapus: isAdminUtama(),
    labelTambah: '+ Tambah Barang',
    nama: r => r.nama,
    extra: r => (isAdmin() ? '<button class="btn tiny" data-act="transaksiMasuk" data-id="'+r.id+'">+ Masuk</button><button class="btn tiny danger" data-act="transaksiKeluar" data-id="'+r.id+'">− Keluar</button>' : '') + '<button class="btn tiny ghost" data-act="detailBarang" data-id="'+r.id+'">Detail</button>',
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
    tambah: false, ubah: true, hapus: isAdminUtama(),
    nama: r => r.nama,
    extra: r => '<button class="btn tiny" data-act="detailPegawai" data-id="' + r.id + '">Detail</button>',
    kolom: [
      { h: 'Nama Pegawai', f: r => '<strong>' + esc(r.nama) + '</strong><div class="muted">' + esc(r.jabatan || '-') + '</div>' },
      { h: 'ID Pegawai', f: r => esc(r.idPegawai) },
      { h: 'Status', f: r => r.statusVerifikasi === 'disetujui' ? '<span class="tag green">Aktif</span>' : r.statusVerifikasi === 'ditolak' ? '<span class="tag red">Ditolak</span>' : '<span class="tag amber">Menunggu</span>' },
      { h: 'Akses Sistem', f: r => (r.akses || []).length ? r.akses.map(a => '<span class="tag">' + esc(AKSES[a] || a) + '</span>').join(' ') : '<span class="muted">Laporan harian</span>' }
    ],
    fields: isEdit => [
      { name: 'nama', label: 'Nama pegawai', req: true },
      { name: 'idPegawai', label: 'ID pegawai', req: true },
      { name: 'jabatan', label: 'Jabatan', req: true },
      { name: 'telepon', label: 'Nomor telepon', type: 'tel', req: true },
      { name: 'alamat', label: 'Alamat', type: 'textarea', full: true },
      { name: 'statusKerja', label: 'Status kepegawaian', type: 'select', options: ['Tetap', 'Kontrak', 'Harian'], req: true },
      { name: 'akses', label: 'Fitur yang diizinkan admin', type: 'checks', full: true, options: [['penanaman', 'Penanaman'], ['panen', 'Panen'], ['gudang', 'Gudang']] }
    ],
    validasi: () => null
  };
}

/* ----- Aksi transaksi gudang ----- */
function openTransaksi(defaults = {}) {
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
  openModal('Catat Transaksi Stok', fields, { jenis: 'Keluar', tanggal: hariIni(), ...defaults }, async data => {
    const b = DB.get('barang', data.barangId);
    if (!b) return 'Barang tidak ditemukan.';
    if (!(data.jumlah > 0)) return 'Jumlah harus lebih dari 0.';
    const stokBaru = data.jenis === 'Masuk' ? b.stok + data.jumlah : b.stok - data.jumlah;
    if (stokBaru < 0) return `Stok tidak cukup. Sisa ${rp(b.stok)} ${b.satuan}.`;
    await DB.update('barang', b.id, data.jenis === 'Masuk' ? { stok: stokBaru, tanggalMasuk: data.tanggal } : { stok: stokBaru });
    await DB.add('transaksi', { ...data, penanamanId: data.penanamanId || null });
    await catat(`Transaksi stok ${data.jenis}`, `${b.nama} ${rp(data.jumlah)} ${b.satuan}`);
    return null;
  });
}

/* ----- Laporan harian pegawai ----- */
let LAPOR_CAMERA_STREAM = null;
function stopLaporCamera() {
  if (LAPOR_CAMERA_STREAM) LAPOR_CAMERA_STREAM.getTracks().forEach(track => track.stop());
  LAPOR_CAMERA_STREAM = null;
}
async function namaLokasiGPS(lat, lon) {
  const providers = [
    async () => {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('OpenStreetMap tidak tersedia');
      const data = await response.json();
      const a = data.address || {};
      const jalan = a.road || a.pedestrian || a.residential || a.footway || a.path || a.highway;
      const nomor = a.house_number || a.house_name;
      const rt = a.quarter || a.hamlet;
      const kelurahan = a.neighbourhood || a.suburb || a.village || a.locality || a.city_district;
      const kecamatan = a.municipality || a.county || a.district || a.city;
      const kota = a.city || a.town || a.regency || a.city_district || a.county;
      const provinsi = a.state;
      const parts = [
        jalan ? (nomor ? `${jalan} No. ${nomor}` : jalan) : null,
        rt ? `Wilayah: ${rt}` : null,
        kelurahan ? `Kel. ${kelurahan}` : null,
        kecamatan ? `Kec. ${kecamatan}` : null,
        kota,
        provinsi
      ].filter(Boolean);
      return parts.length ? [...new Set(parts)].join(', ') : (data.display_name || null);
    },
    async () => {
      const url = `https://geocode.maps.co/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Layanan alamat cadangan tidak tersedia');
      const data = await response.json();
      return data.display_name || null;
    }
  ];
  for (const provider of providers) {
    try {
      const result = await provider();
      if (result) return result;
    } catch (e) { console.warn('Pencarian alamat gagal:', e); }
  }
  return 'Alamat rinci tidak tersedia; gunakan titik GPS pada peta';
}
function waktuLokal(d) {
  return d.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'medium' });
}
function openLapor(jenisAwal = '', draftId = null) {
  const u = me();
  let capturedBlob = null, capturedAt = null, gps = null;
  const box = $('#modal');
  box.innerHTML = `<div class="modal-box">
    <div class="modal-head"><h3>Kirim Laporan Harian</h3><button class="icon-btn" type="button" data-tutup>✕</button></div>
    <form id="form-lapor-bukti" class="form-grid" novalidate>
      <label class="field"><span>Tanggal kegiatan *</span><input name="tanggal" type="date" value="${hariIni()}" required></label>
      <label class="field"><span>Jenis kegiatan *</span><select name="jenis" required><option value="">Pilih jenis kegiatan</option>${JENIS_KEGIATAN.map(x => `<option value="${esc(x)}" ${x===jenisAwal?'selected':''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="field full"><span>Pilih lahan *</span><select name="lahanId" required><option value="">Pilih lahan dari daftar admin</option>${DB.all('lahan').filter(x=>x.aktif!==false).map(x=>'<option value="'+x.id+'">'+esc(x.nama)+' · sisa '+Math.max(0,Number(x.luasTotalM2)-DB.all('laporan').filter(l=>String(l.lahanId)===String(x.id)&&l.jenis==='Penanaman'&&l.status==='diterima').reduce((n,l)=>n+Number(l.luasM2||0),0)).toLocaleString('id-ID')+' m²</option>').join('')}</select><small class="muted">Luas total dan nama lahan ditentukan admin.</small></label>
      <label class="field full"><span>Nama tanaman *</span><input name="tanamanNama" maxlength="120" placeholder="Masukkan nama tanaman"></label>
      
      <div class="field" data-work-field="plant"><span>Luas ditanam (m²) *</span><input name="luasM2" type="number" min="0.01" step="0.01" placeholder="Contoh: 25"></div>
      <div class="field" data-work-field="plant"><span>Jumlah bibit ditanam</span><input name="jumlahDitanam" type="number" min="0" step="1" placeholder="Contoh: 100"></div>
      <div class="field" data-work-field="plant"><span>Umur tanaman saat ini (hari)</span><input name="umurTanamanHari" type="number" min="0" step="1" placeholder="Contoh: 14"></div>
      <div class="field" data-work-field="plant"><span>Status tanaman</span><select name="statusTanaman"><option value="">Pilih status</option><option>Ditanam</option><option>Dalam perawatan</option><option>Siap panen</option><option>Selesai</option></select></div>
      <div class="field" data-work-field="harvest"><span>Hasil panen (kg) *</span><input name="panenKg" type="number" min="0.01" step="0.01" placeholder="Contoh: 35"></div>
      <div class="field" data-work-field="harvest"><span>Kualitas hasil panen</span><select name="kualitasPanen"><option value="">Pilih kualitas</option><option value="A">Grade A</option><option value="B">Grade B</option><option value="C">Grade C</option></select></div>
      <div class="field" data-work-field="seed"><span>Bibit dari gudang (khusus penanaman)</span><select name="benihBarangId"><option value="">Tidak mengambil bibit dari gudang</option>${DB.all('barang').filter(b => String(b.kategori||'').toLowerCase()==='bibit' && Number(b.stok)>0).map(b => '<option value="'+b.id+'">'+esc(b.nama)+' · sisa '+Number(b.stok)+' '+esc(b.satuan||'')+'</option>').join('')}</select></div>
      <div class="field" data-work-field="seed"><span>Jumlah bibit yang digunakan</span><input name="benihDipakai" type="number" min="0" step="0.01" placeholder="0"></div>
      <div class="field" data-work-field="fertilizer"><span>Pupuk dari gudang (khusus pemupukan)</span><select name="pupukBarangId"><option value="">Pilih pupuk</option>${DB.all('barang').filter(b => String(b.kategori||'').toLowerCase()==='pupuk' && Number(b.stok)>0).map(b => '<option value="'+b.id+'">'+esc(b.nama)+' · sisa '+Number(b.stok)+' '+esc(b.satuan||'')+'</option>').join('')}</select></div>
      <div class="field" data-work-field="fertilizer"><span>Jumlah pupuk yang digunakan</span><input name="pupukDipakai" type="number" min="0" step="0.01" placeholder="Contoh: 2"></div>
      <label class="field full"><span>Catatan / hasil pekerjaan *</span><textarea name="deskripsi" rows="3" required placeholder="Jelaskan pekerjaan yang dilakukan, hasil, kendala, dan kondisi tanaman."></textarea></label>
      <div class="field full">
        <span>Foto langsung dari kamera (wajib saat mengirim)</span><small class="muted">Draft bisa disimpan lebih dulu tanpa foto. Saat laporan dikirim, wajib ambil foto baru beserta GPS.</small>
        <video id="lapor-video" autoplay playsinline muted style="width:100%;max-height:320px;background:#111;border-radius:12px;display:none"></video>
        <canvas id="lapor-canvas" style="width:100%;max-height:320px;display:none;border-radius:12px"></canvas>
        <p id="lapor-camera-info" class="muted">Buka kamera dan izinkan akses kamera serta lokasi saat diminta.</p>
        <div class="form-actions">
          <button type="button" class="btn ghost" id="lapor-buka-kamera">Buka Kamera</button>
          <button type="button" class="btn" id="lapor-ambil-foto" disabled>Ambil Foto</button>
          <button type="button" class="btn ghost" id="lapor-ulang-foto" style="display:none">Ulangi Foto</button>
        </div>
        <p class="muted" id="lapor-gps-info">Lokasi GPS belum diambil.</p>
      </div>
      <p class="form-error full" id="lapor-error"></p>
      <div class="form-actions full"><button type="button" class="btn ghost" data-tutup>Batal</button><button type="button" class="btn ghost" id="lapor-simpan-draft">Simpan Draft</button><button type="submit" class="btn">Kirim Laporan</button></div>
    </form></div>`;
  box.classList.remove('hidden');
  const close = () => { stopLaporCamera(); tutupModal(); };
  box.querySelectorAll('[data-tutup]').forEach(x => x.onclick = close);
  const form = $('#form-lapor-bukti');
  const video = $('#lapor-video'), canvas = $('#lapor-canvas');
  const info = $('#lapor-camera-info'), gpsInfo = $('#lapor-gps-info'), errBox = $('#lapor-error');
  const jenisSelect = form.elements.jenis;
  const syncWorkFields = () => {
    const kind = jenisSelect.value;
    const plant = kind === 'Penanaman';
    const harvest = kind === 'Panen';
    box.querySelectorAll('[data-work-field]').forEach(el => {
      const field = el.dataset.workField;
      const show = (field === 'plant' && plant) ||
        (field === 'harvest' && harvest) ||
        (field === 'seed' && plant) ||
        (field === 'fertilizer' && kind === 'Pemupukan');
      el.style.display = show ? '' : 'none';
      const input = el.querySelector('input,select');
      if (input) input.required = (field === 'plant' && input.name === 'luasM2') || (field === 'harvest' && input.name === 'panenKg');
    });
    form.elements.tanamanNama.required = true;
    if (plant) form.elements.tanamanNama.placeholder = 'Nama tanaman yang ditanam';
    else if (harvest) form.elements.tanamanNama.placeholder = 'Nama tanaman yang dipanen';
    else form.elements.tanamanNama.placeholder = 'Tanaman yang dirawat';
  };
  jenisSelect.addEventListener('change', syncWorkFields);
  syncWorkFields();
  const existingDraft = draftId ? DB.get('laporanDraft', draftId) : null;
  if (existingDraft && existingDraft.data) {
    Object.entries(existingDraft.data).forEach(([key,value]) => { if (form.elements[key] && value != null) form.elements[key].value = value; });
    syncWorkFields();
    if (existingDraft.data.fotoPath) {
      info.textContent = 'Bukti foto dan GPS sudah tersimpan di Draft. Foto ini akan ikut dikirim.';
      gpsInfo.textContent = 'Bukti foto tersimpan · ' + (existingDraft.data.fotoLokasi || 'Lokasi GPS tersimpan') + (existingDraft.data.fotoCapturedAt ? ' · ' + waktuLokal(new Date(existingDraft.data.fotoCapturedAt)) : '');
    }
  }
  $('#lapor-simpan-draft').onclick = async () => {
    errBox.textContent = '';
    const f = form;
    const data = { tanggal:f.elements.tanggal.value, jenis:f.elements.jenis.value, lahanId:f.elements.lahanId.value || null, tanamanNama:f.elements.tanamanNama.value.trim(), luasM2:f.elements.luasM2.value || null, jumlahDitanam:f.elements.jumlahDitanam.value || null, umurTanamanHari:f.elements.umurTanamanHari.value || null, statusTanaman:f.elements.statusTanaman.value || null, panenKg:f.elements.panenKg.value || null, kualitasPanen:f.elements.kualitasPanen.value || null, benihBarangId:f.elements.benihBarangId.value || null, benihDipakai:f.elements.benihDipakai.value || null, pupukBarangId:f.elements.pupukBarangId.value || null, pupukDipakai:f.elements.pupukDipakai.value || null, deskripsi:f.elements.deskripsi.value.trim() };
    if (!data.tanggal || !data.jenis || !data.lahanId) { errBox.textContent='Isi tanggal, jenis kegiatan, dan lahan sebelum menyimpan draft.'; return; }
    if (capturedBlob && capturedBlob.size > 5 * 1024 * 1024) { errBox.textContent='Ukuran foto melebihi 5 MB.'; return; }
    const btn=$('#lapor-simpan-draft'); btn.disabled=true; btn.textContent='Menyimpan...';
    let uploadedPath = null;
    try {
      if (capturedBlob && gps && capturedAt) {
        uploadedPath = `${u.authId}/draft-${Date.now()}-${crypto.randomUUID()}.jpg`;
        const { error } = await supabaseClient.storage.from('laporan-bukti').upload(uploadedPath, capturedBlob, {contentType:'image/jpeg',upsert:false});
        if (error) throw error;
        data.fotoPath = uploadedPath;
        data.fotoLat = gps.lat; data.fotoLon = gps.lon; data.fotoAccuracy = gps.accuracy;
        data.fotoLokasi = gps.place; data.fotoCapturedAt = capturedAt.toISOString();
      } else if (existingDraft?.data?.fotoPath) {
        for (const key of ['fotoPath','fotoLat','fotoLon','fotoAccuracy','fotoLokasi','fotoCapturedAt']) data[key] = existingDraft.data[key];
      }
      if (draftId) await DB.update('laporanDraft', draftId, {data, updatedAt:new Date().toISOString()});
      else { const saved=await DB.add('laporanDraft',{pegawaiId:u.id,data}); draftId=saved.id; }
      if (uploadedPath && existingDraft?.data?.fotoPath && existingDraft.data.fotoPath !== uploadedPath) {
        await supabaseClient.storage.from('laporan-bukti').remove([existingDraft.data.fotoPath]);
      }
      await DB.init(false); close(); render();
    } catch(error) {
      if (uploadedPath) await supabaseClient.storage.from('laporan-bukti').remove([uploadedPath]);
      errBox.textContent='Draft gagal disimpan: '+error.message; btn.disabled=false; btn.textContent='Simpan Draft';
    }
  };
  $('#lapor-buka-kamera').onclick = async () => {
    errBox.textContent = '';
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera tidak didukung. Buka web melalui HTTPS dan browser terbaru.');
      stopLaporCamera();
      LAPOR_CAMERA_STREAM = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = LAPOR_CAMERA_STREAM;
      video.style.display = 'block'; canvas.style.display = 'none';
      $('#lapor-ambil-foto').disabled = false;
      info.textContent = 'Kamera aktif. Pastikan objek kegiatan terlihat jelas.';
    } catch (e) { errBox.textContent = 'Tidak bisa membuka kamera: ' + e.message; }
  };
  $('#lapor-ambil-foto').onclick = async () => {
    errBox.textContent = '';
    if (!video.videoWidth) { errBox.textContent = 'Tunggu sampai kamera siap.'; return; }
    $('#lapor-ambil-foto').disabled = true;
    info.textContent = 'Mengambil GPS dan mencari nama alamat...';
    if (!navigator.geolocation) { errBox.textContent = 'Browser tidak mendukung lokasi GPS.'; $('#lapor-ambil-foto').disabled = false; return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        gps = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
        gps.place = await namaLokasiGPS(gps.lat, gps.lon);
        capturedAt = new Date();
        const w = video.videoWidth, h = video.videoHeight;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);
        const band = Math.max(190, Math.round(h * 0.30));
        ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, h - band, w, band);
        const scale = Math.max(18, Math.round(w / 42));
        ctx.fillStyle = '#fff'; ctx.font = `bold ${scale}px sans-serif`;
        ctx.fillText(waktuLokal(capturedAt), Math.round(w * 0.025), h - band + scale * 1.35);
        ctx.font = `${Math.max(14, Math.round(scale * 0.78))}px sans-serif`;
        const maxChars = Math.max(30, Math.floor(w / (scale * 0.48)));
        const placeLines = (gps.place || 'Nama alamat tidak ditemukan').match(new RegExp('.{1,' + maxChars + '}(?:\\\\s|$)', 'g')) || [gps.place || 'Nama alamat tidak ditemukan'];
        let y = h - band + scale * 2.45;
        for (const line of placeLines.slice(0, 2)) { ctx.fillText(line.trim(), Math.round(w * 0.025), y); y += scale * 1.05; }
        ctx.fillText(`GPS: ${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)} (±${Math.round(gps.accuracy)} m)`, Math.round(w * 0.025), h - scale * 0.55);
        canvas.toBlob(blob => {
          if (!blob) { errBox.textContent = 'Gagal memproses foto.'; $('#lapor-ambil-foto').disabled = false; return; }
          capturedBlob = blob;
          video.style.display = 'none'; canvas.style.display = 'block';
          stopLaporCamera();
          info.textContent = 'Foto berhasil diambil dengan cap waktu, nama alamat, dan GPS.';
          gpsInfo.textContent = `Nama lokasi: ${gps.place} · Koordinat: ${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)} · Akurasi ±${Math.round(gps.accuracy)} meter · ${waktuLokal(capturedAt)}`;
          $('#lapor-ulang-foto').style.display = 'inline-flex';
        }, 'image/jpeg', 0.88);
      } catch (error) {
        errBox.textContent = 'Gagal mengambil foto: ' + error.message;
        $('#lapor-ambil-foto').disabled = false;
      }
    }, e => {
      errBox.textContent = 'Lokasi tidak berhasil diambil: ' + e.message + '. Aktifkan izin lokasi lalu coba lagi.';
      info.textContent = 'Foto belum diambil.';
      $('#lapor-ambil-foto').disabled = false;
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };
$('#lapor-ulang-foto').onclick = () => {
    capturedBlob = null; capturedAt = null; gps = null;
    canvas.style.display = 'none'; video.style.display = 'none';
    $('#lapor-ulang-foto').style.display = 'none';
    gpsInfo.textContent = 'Lokasi GPS belum diambil.';
    info.textContent = 'Buka kamera untuk mengambil foto baru.';
    $('#lapor-ambil-foto').disabled = true;
    $('#lapor-buka-kamera').click();
  };
  $('#form-lapor-bukti').onsubmit = async e => {
    e.preventDefault(); errBox.textContent = '';
    const form = e.currentTarget, submit = form.querySelector('button[type="submit"]');
    const savedProof = existingDraft?.data || {};
    const requiredFields = [form.elements.tanggal, form.elements.jenis, form.elements.lahanId, form.elements.tanamanNama, form.elements.deskripsi];
    const missingField = requiredFields.find(field => !String(field.value || '').trim());
    if (missingField) { errBox.textContent = 'Lengkapi tanggal, jenis kegiatan, lahan, nama tanaman, dan catatan pekerjaan.'; missingField.focus(); return; }
    if (form.elements.jenis.value === 'Penanaman' && !(Number(form.elements.luasM2.value) > 0)) { errBox.textContent = 'Isi luas ditanam lebih dari 0 m².'; form.elements.luasM2.focus(); return; }
    if (form.elements.jenis.value === 'Panen' && !(Number(form.elements.panenKg.value) > 0)) { errBox.textContent = 'Isi hasil panen lebih dari 0 kg.'; form.elements.panenKg.focus(); return; }
    const proofGps = gps || (savedProof.fotoPath ? {lat:Number(savedProof.fotoLat),lon:Number(savedProof.fotoLon),accuracy:Number(savedProof.fotoAccuracy),place:savedProof.fotoLokasi} : null);
    const proofCapturedAt = capturedAt || (savedProof.fotoCapturedAt ? new Date(savedProof.fotoCapturedAt) : null);
    if ((!capturedBlob && !savedProof.fotoPath) || !proofGps || !proofCapturedAt) { errBox.textContent = 'Wajib ambil foto langsung dari kamera beserta lokasi GPS, lalu simpan Draft atau kirim.'; return; }
    if (capturedBlob && capturedBlob.size > 5 * 1024 * 1024) { errBox.textContent = 'Ukuran foto melebihi 5 MB.'; return; }
    submit.disabled = true; submit.textContent = 'Mengirim...';
    const lahanId = form.elements.lahanId.value ? Number(form.elements.lahanId.value) : null;
    const lahan = lahanId ? DB.get('lahan',lahanId) : null;
    const benihBarangId = form.elements.benihBarangId.value ? Number(form.elements.benihBarangId.value) : null;
    const benihDipakai = Number(form.elements.benihDipakai.value || 0);
    const pupukBarangId = form.elements.pupukBarangId.value ? Number(form.elements.pupukBarangId.value) : null;
    const pupukDipakai = Number(form.elements.pupukDipakai.value || 0);
    const jenis=form.elements.jenis.value;
    const luasM2 = form.elements.luasM2.value === '' ? null : Number(form.elements.luasM2.value);
    const jumlahDitanam = form.elements.jumlahDitanam.value === '' ? null : Number(form.elements.jumlahDitanam.value);
    const umurTanamanHari = form.elements.umurTanamanHari.value === '' ? null : Number(form.elements.umurTanamanHari.value);
    const panenKg = form.elements.panenKg.value === '' ? null : Number(form.elements.panenKg.value);
    const kualitasPanen = form.elements.kualitasPanen.value || null;
    if ((benihDipakai < 0 || (benihDipakai > 0 && !benihBarangId) || (benihBarangId && benihDipakai <= 0)) || (jenis !== 'Penanaman' && benihBarangId)) { errBox.textContent = 'Bibit hanya dapat dicatat pada kegiatan Penanaman. Periksa barang dan jumlahnya.'; submit.disabled=false; submit.textContent='Kirim Laporan'; return; }
    if ((pupukDipakai < 0 || (pupukDipakai > 0 && !pupukBarangId) || (pupukBarangId && pupukDipakai <= 0)) || (jenis !== 'Pemupukan' && pupukBarangId) || (jenis === 'Pemupukan' && !pupukBarangId)) { errBox.textContent = 'Pilih pupuk dan jumlah pemakaian untuk kegiatan Pemupukan.'; submit.disabled=false; submit.textContent='Kirim Laporan'; return; }
    if (!lahan || !lahan.aktif || (jenis==='Penanaman' && (!Number.isFinite(luasM2)||luasM2<=0)) || (jenis==='Panen' && (!Number.isFinite(panenKg)||panenKg<=0)) || (luasM2 !== null && (!Number.isFinite(luasM2)||luasM2<=0)) || (jumlahDitanam !== null && (!Number.isInteger(jumlahDitanam)||jumlahDitanam<0)) || (umurTanamanHari !== null && (!Number.isInteger(umurTanamanHari)||umurTanamanHari<0))) { errBox.textContent='Periksa kembali lahan, luas tanam, jumlah bibit, umur, dan hasil panen.'; submit.disabled=false; submit.textContent='Kirim Laporan'; return; }
    const barangBenih = benihBarangId ? DB.get('barang',benihBarangId) : null;
    const barangPupuk = pupukBarangId ? DB.get('barang',pupukBarangId) : null;
    if (benihBarangId && (!barangBenih || String(barangBenih.kategori||'').toLowerCase()!=='bibit' || benihDipakai > Number(barangBenih.stok))) { errBox.textContent='Stok bibit tidak mencukupi atau barang bukan kategori Bibit.'; submit.disabled=false; submit.textContent='Kirim Laporan'; return; }
    if (pupukBarangId && (!barangPupuk || String(barangPupuk.kategori||'').toLowerCase()!=='pupuk' || pupukDipakai > Number(barangPupuk.stok))) { errBox.textContent='Stok pupuk tidak mencukupi atau barang bukan kategori Pupuk.'; submit.disabled=false; submit.textContent='Kirim Laporan'; return; }
    const data = { tanggal: form.elements.tanggal.value, jenis, lokasi: lahan.nama, lahanId, deskripsi: form.elements.deskripsi.value.trim(), tanamanNama:form.elements.tanamanNama.value.trim(), luasM2:jenis==='Penanaman'?luasM2:null, jumlahDitanam:jenis==='Penanaman'?jumlahDitanam:null, umurTanamanHari, statusTanaman:form.elements.statusTanaman.value||null, panenKg, kualitasPanen, benihBarangId, benihDipakai:benihBarangId?benihDipakai:null, pupukBarangId, pupukDipakai:pupukBarangId?pupukDipakai:null };
    const path = capturedBlob ? `${u.authId}/${Date.now()}-${crypto.randomUUID()}.jpg` : savedProof.fotoPath;
    try {
      if (capturedBlob) {
        const { error: uploadError } = await supabaseClient.storage.from('laporan-bukti').upload(path, capturedBlob, { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
      }
      let reportSaved = false;
      try {
        const { error: saveError } = await supabaseClient.rpc('pegawai_kirim_laporan_lapangan', {
          p_tanggal:data.tanggal, p_jenis:data.jenis, p_lokasi:data.lokasi, p_lahan_id:data.lahanId, p_deskripsi:data.deskripsi,
          p_tanaman_nama:data.tanamanNama, p_luas_m2:data.luasM2, p_jumlah_ditanam:data.jumlahDitanam, p_panen_kg:data.panenKg, p_kualitas_panen:data.kualitasPanen,
          p_umur_tanaman_hari:data.umurTanamanHari, p_status_tanaman:data.statusTanaman,
          p_benih_barang_id:data.benihBarangId, p_benih_dipakai:data.benihDipakai,
          p_pupuk_barang_id:data.pupukBarangId, p_pupuk_dipakai:data.pupukDipakai,
          p_foto_path:path, p_foto_lat:proofGps.lat, p_foto_lon:proofGps.lon, p_foto_accuracy:proofGps.accuracy,
          p_foto_lokasi:proofGps.place, p_foto_captured_at:proofCapturedAt.toISOString()
        });
        if (saveError) throw saveError;
        reportSaved = true;
      } catch (error) {
        if (!reportSaved && capturedBlob) await supabaseClient.storage.from('laporan-bukti').remove([path]);
        throw error;
      }
      if (draftId) await DB.remove('laporanDraft', draftId);
      await DB.init(false);
      await catat('Kirim laporan harian', `${data.jenis} · ${data.lokasi}`);
      close(); render();
    } catch (error) {
      errBox.textContent = 'Gagal mengirim laporan: ' + error.message;
      submit.disabled = false; submit.textContent = 'Kirim Laporan';
    }
  };
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
  const laporanPanen = DB.all('laporan').filter(x => x.jenis === 'Panen');
  const totalKg = pn.reduce((s, x) => s + (x.kg || 0), 0) + laporanPanen.reduce((s,x)=>s+Number(x.panenKg||0),0);
  const kartu = [
    ['Total tanaman', t.length, 'jenis tanaman dikelola'],
    ['Sedang ditanam', t.filter(x => ['Ditanam', 'Dalam perawatan'].includes(x.status)).length, 'tanaman aktif di lahan'],
    ['Siap panen', t.filter(x => x.status === 'Siap panen').length, 'tanaman siap dipanen'],
    ['Total hasil panen', `${rp(totalKg)} kg`, `${pn.length + laporanPanen.length} kali panen tercatat`],
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

function pagePupuk() {
  const cfg = cfgBarang();
  cfg.judul = 'Gudang';
  cfg.kosong = 'Belum ada data pupuk. Admin dapat menambahkan barang melalui tombol Tambah Barang.';
  cfg.labelTambah = '+ Tambah Barang';
  cfg.filter = null;
  cfg.catatan = '<p class="muted">Kelola persediaan dari halaman Gudang. Data barang dan stok yang sudah tersimpan tetap dipertahankan.</p>';
  return { html: crud('barang', cfg) };
}

function pageGudang() {
  const barang = DB.all('barang').slice().sort((a,b) => String(a.kategori||'').localeCompare(String(b.kategori||'')) || String(a.nama||'').localeCompare(String(b.nama||'')));
  const transaksi = DB.all('transaksi').slice().sort((a,b) => String(b.tanggal||'').localeCompare(String(a.tanggal||'')) || b.id-a.id).slice(0,100);
  const kategoriUtama = ['Bibit','Pupuk','Hasil Panen'];
  const ringkasan = kategoriUtama.map(k => {
    const items = barang.filter(x => String(x.kategori||'').toLowerCase() === k.toLowerCase());
    const total = items.reduce((n,x) => n + Number(x.stok||0), 0);
    const satuan = [...new Set(items.map(x => x.satuan).filter(Boolean))];
    return '<div class="stat"><span>'+esc(k)+'</span><strong>'+rp(total)+'</strong><small>'+items.length+' jenis barang'+(satuan.length===1?' · '+esc(satuan[0]):'')+'</small></div>';
  }).join('');
  const barisBarang = barang.map(b => [
    '<strong>'+esc(b.nama)+'</strong><div class="muted">'+esc(b.kode||'')+'</div>',
    esc(b.kategori||'-'),
    '<strong class="'+(Number(b.stok)<=Number(b.minStok)?'text-red':'')+'">'+rp(b.stok)+' '+esc(b.satuan||'')+'</strong>',
    Number(b.stok)<=Number(b.minStok)?'<span class="tag red">Stok menipis</span>':'<span class="tag green">Tersedia</span>',
    '<div class="row-actions">'+(isAdmin()?'<button class="btn tiny" data-act="transaksiMasuk" data-id="'+b.id+'">+ Masuk</button><button class="btn tiny danger" data-act="transaksiKeluar" data-id="'+b.id+'">− Keluar</button>':'')+'<button class="btn tiny ghost" data-act="detailBarang" data-id="'+b.id+'">Detail</button></div>'
  ]);
  const totalMasuk = transaksi.filter(t=>t.jenis==='Masuk').reduce((n,t)=>n+Number(t.jumlah||0),0);
  const totalKeluar = transaksi.filter(t=>t.jenis==='Keluar').reduce((n,t)=>n+Number(t.jumlah||0),0);
  const riwayat = tabel(['Tanggal','Barang','Jenis','Jumlah','Keterangan','Detail'],transaksi.map(t=>{
    const b=DB.get('barang',t.barangId)||{};
    return [tgl(t.tanggal),esc(b.nama||'-'),t.jenis==='Masuk'?'<span class="tag green">Masuk</span>':'<span class="tag red">Keluar</span>',rp(t.jumlah)+' '+esc(b.satuan||''),esc(t.keterangan||'-'),'<button class="btn tiny ghost" data-act="detailBarang" data-id="'+(b.id||'')+'">Detail</button>'];
  }),'Belum ada transaksi barang masuk atau keluar.');
  return { html:
    head('Gudang', (isAdmin()?'<button class="btn" data-act="tambah" data-tbl="barang">+ Tambah Barang</button>':''))+
    '<p class="muted">Kelola stok Bibit, Pupuk, dan Hasil Panen dari halaman ini. Gunakan tombol Masuk atau Keluar pada barang yang sesuai. Data dan riwayat lama tetap dipertahankan.</p>'+
    '<div class="stats-grid">'+ringkasan+'</div>'+
    '<div class="card"><div class="page-head"><h3>Daftar stok barang</h3><span class="muted">'+barang.length+' jenis barang</span></div>'+
    tabel(['Nama barang','Kategori','Stok saat ini','Kondisi stok','Aksi'],barisBarang,'Belum ada barang di gudang.')+'</div>'+
    '<div class="card"><div class="page-head"><h3>Riwayat barang masuk dan keluar</h3></div>'+
    '<div class="stats-grid"><div class="stat"><span>Total masuk · 100 transaksi terbaru</span><strong>'+rp(totalMasuk)+'</strong></div><div class="stat"><span>Total keluar · 100 transaksi terbaru</span><strong>'+rp(totalKeluar)+'</strong></div></div>'+
    riwayat+'</div>'
  };
}
function pagePekerjaan(jenis) {
  const admin = isAdmin();
  const rows = DB.all('laporan')
    .filter(l => l.jenis === jenis && (admin || l.pegawaiId === me().id))
    .slice()
    .sort((a,b) => String(b.tanggal).localeCompare(String(a.tanggal)));
  const drafts = admin ? [] : DB.all('laporanDraft')
    .filter(d => String(d.pegawaiId) === String(me().id) && d.data?.jenis === jenis);
  const draftHtml = drafts.length
    ? '<h3>Draft '+esc(jenis)+' belum dikirim</h3>' + tabel(['Tanggal','Tanaman','Lahan','Aksi'], drafts.map(d => [
        esc(d.data?.tanggal || '-'), esc(d.data?.tanamanNama || '-'),
        esc((DB.get('lahan',d.data?.lahanId)||{}).nama || '-'),
        '<div class="row-actions"><button class="btn tiny ghost" data-act="editDraftLaporan" data-id="'+esc(d.id)+'">Edit</button><button class="btn tiny" data-act="kirimDraftLaporan" data-id="'+esc(d.id)+'">Kirim</button><button class="btn tiny ghost" data-act="hapusDraftLaporan" data-id="'+esc(d.id)+'">Hapus</button></div>'
      ]))
    : (admin ? '' : '<p class="muted">Belum ada Draft '+esc(jenis)+'.</p>');
  const btn = admin ? '' : '<button class="btn" data-act="laporJenis" data-jenis="'+jenis+'">+ Catat '+jenis+'</button>';
  const statusAction = l => admin
    ? (l.status === 'diterima'
        ? '<span class="tag green">Sudah diterima</span>'
        : '<button class="btn tiny" data-act="statusLaporan" data-status="diterima" data-id="'+esc(l.id)+'">Terima laporan</button>')
    : '';
  const rowsHtml = jenis === 'Panen'
    ? tabel(['Tanggal','Pegawai','Lahan','Tanaman','Hasil panen','Kualitas','Status','Aksi'],
        rows.map(l => [
          tgl(l.tanggal), esc(namaPegawai(l.pegawaiId)),
          esc((DB.get('lahan',l.lahanId)||{}).nama || l.lokasi || '-'),
          esc(l.tanamanNama || '-'), l.panenKg == null ? '-' : rp(l.panenKg)+' kg',
          esc(l.kualitasPanen || '-'),
          l.status === 'diterima' ? '<span class="tag green">Diterima</span>' : '<span class="tag amber">Menunggu</span>',
          '<div class="row-actions"><button class="btn tiny ghost" data-act="detailLaporan" data-id="'+esc(l.id)+'">Detail</button>'+statusAction(l)+(isAdminUtama()?'<button class="btn tiny danger" data-act="hapusLaporan" data-id="'+esc(l.id)+'">Hapus</button>':'')+'</div>'
        ]), 'Belum ada hasil panen yang dilaporkan.')
    : tabel(['Tanggal','Pegawai','Lahan','Tanaman','Luas ditanam','Jumlah bibit','Status','Aksi'],
        rows.map(l => [
          tgl(l.tanggal), esc(namaPegawai(l.pegawaiId)),
          esc((DB.get('lahan',l.lahanId)||{}).nama || l.lokasi || '-'),
          esc(l.tanamanNama || '-'), l.luasM2 == null ? '-' : rp(l.luasM2)+' m²',
          l.jumlahDitanam == null ? '-' : rp(l.jumlahDitanam),
          l.status === 'diterima' ? '<span class="tag green">Diterima</span>' : '<span class="tag amber">Menunggu</span>',
          '<div class="row-actions"><button class="btn tiny ghost" data-act="detailLaporan" data-id="'+esc(l.id)+'">Detail</button>'+statusAction(l)+(isAdminUtama()?'<button class="btn tiny danger" data-act="hapusLaporan" data-id="'+esc(l.id)+'">Hapus</button>':'')+'</div>'
        ]), 'Belum ada kegiatan penanaman yang dilaporkan.');
  const intro = jenis === 'Panen'
    ? 'Pegawai mencatat hasil panen dalam kilogram dan kualitasnya. Admin memeriksa laporan pada daftar yang sama.'
    : 'Pegawai mencatat luas tanam, jumlah bibit, dan penggunaan bahan. Admin memeriksa laporan pada daftar yang sama.';
  return {
    html: head(jenis === 'Panen' ? 'Pencatatan Panen' : 'Pencatatan Penanaman', btn) +
      '<p class="muted">'+intro+'</p>'+draftHtml+rowsHtml
  };
}

function pageAktivitas() {
  const u = me();
  if (u.tipe === 'pegawai') {
    const rows = DB.all('laporan').filter(l => l.pegawaiId === u.id).sort((a, b) => b.id - a.id);
    const drafts = DB.all('laporanDraft').filter(d => String(d.pegawaiId) === String(u.id)).sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));
    const draftHtml = drafts.length ? '<h3>Draft belum dikirim</h3>' + tabel(['Tanggal','Kegiatan','Tanaman','Aksi'], drafts.map(d => [
      esc(d.data?.tanggal || '-'), esc(d.data?.jenis || '-'), esc(d.data?.tanamanNama || '-'),
      '<div class="row-actions"><button class="btn tiny ghost" data-act="editDraftLaporan" data-id="'+esc(d.id)+'">Edit</button><button class="btn tiny" data-act="kirimDraftLaporan" data-id="'+esc(d.id)+'">Kirim</button><button class="btn tiny ghost" data-act="hapusDraftLaporan" data-id="'+esc(d.id)+'">Hapus</button></div>'
    ])) : '<p class="muted">Belum ada draft tersimpan.</p>';
    return {
      html: head('Pekerjaan Lapangan', '<button class="btn" data-act="lapor">+ Catat Pekerjaan</button>') + draftHtml +
        tabel(['Tanggal', 'Kegiatan', 'Lahan', 'Tanaman', 'Luas', 'Status', 'Detail'],
          rows.map(l => [tgl(l.tanggal), esc(l.jenis), esc((DB.get('lahan',l.lahanId)||{}).nama||l.lokasi||'-'), esc(l.tanamanNama||'-'), l.luasM2==null?'-':esc(l.luasM2)+' m²',
            l.status === 'diterima' ? '<span class="tag green">Diterima</span>' : '<span class="tag amber">Belum diterima</span>',
            '<button class="btn tiny ghost" data-act="detailLaporan" data-id="'+esc(l.id)+'">Detail</button>']),
          'Belum ada pekerjaan tercatat. Gunakan tombol di atas untuk mencatat penanaman, perawatan, atau panen.')
    };
  }
  const rows = DB.all('laporan').slice().sort((a, b) => b.id - a.id);
  return {
    html: head('Pekerjaan Lapangan Pegawai') +
      tabel(['Tanggal', 'Pegawai', 'Kegiatan', 'Lahan', 'Tanaman', 'Luas', 'Status', 'Aksi'],
        rows.map(l => [
          tgl(l.tanggal), esc(namaPegawai(l.pegawaiId)), esc(l.jenis), esc((DB.get('lahan',l.lahanId)||{}).nama||l.lokasi||'-'), esc(l.tanamanNama||'-'), l.luasM2==null?'-':esc(l.luasM2)+' m²',
          l.status === 'diterima' ? '<span class="tag green">Diterima</span>' : '<span class="tag amber">Belum diterima</span>',
          '<div class="row-actions"><button class="btn tiny ghost" data-act="detailLaporan" data-id="' + esc(l.id) + '">Detail</button>' +
          (l.status === 'diterima'
            ? '<span class="tag green">Sudah diterima</span>'
            : '<button class="btn tiny" data-act="statusLaporan" data-status="diterima" data-id="' + esc(l.id) + '">Terima</button>') + (me()?.adminLevel==='utama' ? '<button class="btn tiny danger" data-act="hapusLaporan" data-id="'+esc(l.id)+'">Hapus</button>' : '') + '</div>'
        ]), 'Belum ada laporan dari pegawai.')
  };
}
async function hapusLaporanAdmin(id) {
  if (!isAdminUtama()) return alert('Hanya Admin Utama yang boleh menghapus laporan.');
  const row=DB.get('laporan',id); if(!row)return;
  if(!confirm('Hapus laporan ini beserta foto bukti yang tersimpan? Tindakan tidak dapat dibatalkan.'))return;
  try {
    await DB.remove('laporan',id,row.fotoPath?[{bucket:'laporan-bukti',path:row.fotoPath}]:[]);
    await catat('Hapus laporan pegawai', 'Laporan #'+id);
    await DB.init(true); render();
  } catch(err){alert('Gagal menghapus laporan: '+err.message);}
}
async function hapusRiwayatAdmin(tbl,id) {
  if (!isAdminUtama()) return alert('Hanya Admin Utama yang boleh menghapus riwayat.');
  const row=DB.get(tbl,id); if(!row)return;
  if(!confirm('Hapus riwayat ini beserta foto buktinya? Tindakan tidak dapat dibatalkan.'))return;
  const files=[];
  if(tbl==='absensi'){
    if(row.masukFotoPath)files.push({bucket:'absensi-bukti',path:row.masukFotoPath});
    if(row.pulangFotoPath)files.push({bucket:'absensi-bukti',path:row.pulangFotoPath});
  }
  if(tbl==='izin'&&row.fotoPath)files.push({bucket:'izin-bukti',path:row.fotoPath});
  try { await DB.remove(tbl,id,files); await DB.init(true); render(); }
  catch(err){alert('Gagal menghapus riwayat: '+err.message);}
}

async function detailLaporan(id) {
  const l = DB.get('laporan', id);
  if (!l) return alert('Laporan tidak ditemukan.');
  let fotoHtml = '<p class="muted">Foto bukti tidak tersedia.</p>';
  if (l.fotoPath) {
    const { data, error } = await supabaseClient.storage.from('laporan-bukti').createSignedUrl(l.fotoPath, 300);
    if (!error && data?.signedUrl) fotoHtml = `<img src="${esc(data.signedUrl)}" alt="Foto bukti laporan" style="width:100%;max-height:420px;object-fit:contain;border-radius:12px">`;
    else fotoHtml = '<p class="form-error">Foto bukti gagal dimuat. Periksa izin penyimpanan.</p>';
  }
  const koordinatValid = Number.isFinite(Number(l.fotoLat)) && Number.isFinite(Number(l.fotoLon)) && l.fotoLat !== null && l.fotoLon !== null;
  const latFoto = koordinatValid ? Number(l.fotoLat) : null;
  const lonFoto = koordinatValid ? Number(l.fotoLon) : null;
  const mapsUrl = koordinatValid ? `https://www.google.com/maps?q=${encodeURIComponent(latFoto + ',' + lonFoto)}` : '';
  const mapEmbedUrl = koordinatValid ? `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent((lonFoto - 0.003) + ',' + (latFoto - 0.003) + ',' + (lonFoto + 0.003) + ',' + (latFoto + 0.003))}&layer=mapnik&marker=${encodeURIComponent(latFoto + ',' + lonFoto)}` : '';
  const lokasiFoto = koordinatValid ? `<p><strong>Nama lokasi foto</strong><br>${esc(l.fotoLokasi || 'Nama alamat belum tersedia')}</p><p><strong>Koordinat GPS foto</strong><br>${latFoto.toFixed(6)}, ${lonFoto.toFixed(6)} (akurasi ±${Math.round(Number(l.fotoAccuracy || 0))} m)</p><p><strong>Waktu foto</strong><br>${esc(l.fotoCapturedAt ? waktuLokal(new Date(l.fotoCapturedAt)) : '-')}</p><h4>Titik Pengambilan Foto</h4><iframe title="Peta lokasi foto" src="${mapEmbedUrl}" loading="lazy" style="width:100%;height:280px;border:0;border-radius:12px" referrerpolicy="no-referrer-when-downgrade"></iframe><div class="form-actions"><a class="btn" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Lihat Titik di Google Maps</a></div>` : '<p class="muted">Titik GPS tidak tersimpan pada laporan ini.</p>';
  openInfo('Detail Laporan Pegawai', `
    <div class="detail-grid">
      <p><strong>Pegawai</strong><br>${esc(namaPegawai(l.pegawaiId))}</p>
      <p><strong>Tanggal</strong><br>${esc(tgl(l.tanggal))}</p>
      <p><strong>Jenis kegiatan</strong><br>${esc(l.jenis)}</p>
      <p><strong>Nama lahan</strong><br>${esc((DB.get('lahan',l.lahanId)||{}).nama||l.lokasi||'-')}</p>
      <p><strong>Lokasi lahan</strong><br>${esc((DB.get('lahan',l.lahanId)||{}).lokasi||l.lokasi||'-')}</p>
      <p><strong>Status laporan</strong><br>${l.status === 'diterima' ? 'Diterima' : 'Belum diterima'}</p>
      <p><strong>Deskripsi pekerjaan</strong><br>${esc(l.deskripsi)}</p>
      <p><strong>Tanaman</strong><br>${esc(l.tanamanNama||'-')}</p>
      <p><strong>Luas dikerjakan</strong><br>${l.luasM2==null?'-':esc(l.luasM2)+' m²'}</p>
      <p><strong>Jumlah ditanam</strong><br>${l.jumlahDitanam==null?'-':esc(l.jumlahDitanam)}</p>
      <p><strong>Umur tanaman</strong><br>${l.umurTanamanHari==null?'-':esc(l.umurTanamanHari)+' hari'}</p>
      <p><strong>Status tanaman</strong><br>${esc(l.statusTanaman||'-')}</p>
      <p><strong>Bibit dipakai</strong><br>${l.benihDipakai==null?'-':esc(l.benihDipakai)+' '+esc((DB.get('barang',l.benihBarangId)||{}).satuan||'')+' · '+esc((DB.get('barang',l.benihBarangId)||{}).nama||'')}</p>\n      <p><strong>Pupuk dipakai</strong><br>${l.pupukDipakai==null?'-':esc(l.pupukDipakai)+' '+esc((DB.get('barang',l.pupukBarangId)||{}).satuan||'')+' · '+esc((DB.get('barang',l.pupukBarangId)||{}).nama||'')}</p>\n      <p><strong>Hasil panen</strong><br>${l.panenKg==null?'-':esc(l.panenKg)+' kg'}</p>\n      <p><strong>Kualitas panen</strong><br>${esc(l.kualitasPanen||'-')}</p>
      ${lokasiFoto}
    </div>
    <h4>Foto Bukti Kegiatan</h4>${fotoHtml}
    <div class="form-actions"><button class="btn" data-tutup>Tutup</button></div>`);
  $('#modal [data-tutup]').onclick = tutupModal;
}

async function fotoKameraAbsensi(judul) {
  return new Promise((resolve,reject)=>{
    const box=$('#modal');
    box.innerHTML='<div class="modal-box"><div class="modal-head"><h3>'+esc(judul)+'</h3><button class="icon-btn" type="button" data-close-camera>✕</button></div><video id="att-video" autoplay playsinline muted style="width:100%;max-height:320px;background:#111"></video><canvas id="att-canvas" style="display:none;width:100%"></canvas><p id="att-info" class="muted">Aktifkan kamera dan GPS.</p><p id="att-error" class="form-error"></p><div class="form-actions"><button type="button" class="btn ghost" id="att-open">Buka Kamera</button><button type="button" class="btn" id="att-shot" disabled>Ambil Foto</button><button type="button" class="btn" id="att-use" disabled>Gunakan Foto</button></div></div>';
    box.classList.remove('hidden');
    const v=$('#att-video'),can=$('#att-canvas'),info=$('#att-info'),err=$('#att-error');
    let stream=null,blob=null,gps=null,at=null,done=false;
    const stop=()=>{if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;};
    const finish=(val,error)=>{if(done)return;done=true;stop();tutupModal();error?reject(error):resolve(val);};
    box.querySelector('[data-close-camera]').onclick=()=>finish(null,new Error('Foto dibatalkan.'));
    $('#att-open').onclick=async()=>{try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('Kamera memerlukan HTTPS.');stop();stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});v.srcObject=stream;$('#att-shot').disabled=false;info.textContent='Kamera aktif.';}catch(x){err.textContent=x.message;}};
    $('#att-shot').onclick=()=>{
      if(!v.videoWidth)return;
      $('#att-shot').disabled=true;info.textContent='Mengambil GPS dan alamat...';
      if(!navigator.geolocation){err.textContent='GPS tidak didukung.';$('#att-shot').disabled=false;return;}
      navigator.geolocation.getCurrentPosition(async pos=>{
        try{
          gps={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy};
          gps.place=await namaLokasiGPS(gps.lat,gps.lon);at=new Date();
          can.width=v.videoWidth;can.height=v.videoHeight;
          const x=can.getContext('2d');x.drawImage(v,0,0,can.width,can.height);
          const band=Math.max(170,Math.round(can.height*.27));x.fillStyle='rgba(0,0,0,.75)';x.fillRect(0,can.height-band,can.width,band);
          const z=Math.max(16,Math.round(can.width/44));x.fillStyle='#fff';x.font='bold '+z+'px sans-serif';
          x.fillText(waktuLokal(at),14,can.height-band+z*1.4);x.font=(z*.78)+'px sans-serif';
          x.fillText(String(gps.place||'Alamat tidak ditemukan').slice(0,90),14,can.height-band+z*2.7);
          x.fillText('GPS '+gps.lat.toFixed(6)+', '+gps.lon.toFixed(6)+' ±'+Math.round(gps.accuracy)+' m',14,can.height-16);
          can.toBlob(b=>{if(!b){err.textContent='Foto gagal diproses.';$('#att-shot').disabled=false;return;}blob=b;v.style.display='none';can.style.display='block';stop();info.textContent='Foto tercap waktu dan lokasi.';$('#att-use').disabled=false;},'image/jpeg',.88);
        }catch(x){err.textContent=x.message;$('#att-shot').disabled=false;}
      },x=>{err.textContent='GPS gagal: '+x.message;$('#att-shot').disabled=false;},{enableHighAccuracy:true,timeout:20000,maximumAge:0});
    };
    $('#att-use').onclick=()=>finish({blob,gps,at});
  });
}
async function unggahBuktiAbsensi(bucket,userId,blob){
  if(!blob||blob.size>5242880)throw new Error('Foto wajib ada dan maksimal 5 MB.');
  const path=userId+'/'+Date.now()+'-'+crypto.randomUUID()+'.jpg';
  const {error}=await supabaseClient.storage.from(bucket).upload(path,blob,{contentType:'image/jpeg',upsert:false});
  if(error)throw error;return path;
}
let ATT_HISTORY_YEAR = '';
let ATT_HISTORY_MONTH = '';

function detailRiwayatAbsensi(id){
  const a=DB.all('absensi').find(x=>String(x.id)===String(id));if(!a)return;
  const lokasi=(label,alamat,lat,lon,kind)=>{
    const ok=Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&lat!==null&&lon!==null;
    return '<p><strong>'+label+'</strong><br>'+esc(alamat||'-')+(ok?'<br><a href="https://www.google.com/maps?q='+encodeURIComponent(lat+','+lon)+'" target="_blank" rel="noopener">Lihat titik lokasi</a>':'')+'</p>';
  };
  openInfo('Detail Absensi · '+tgl(a.tanggal),
    '<div class="detail-grid"><p><strong>Hari</strong><br>'+new Date(a.tanggal+'T12:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'</p>'+
    '<p><strong>Pegawai</strong><br>'+esc(namaPegawai(a.pegawaiId))+'</p>'+
    '<p><strong>Jam masuk</strong><br>'+(a.masukAt?waktuLokal(new Date(a.masukAt)):'-')+'</p>'+
    '<p><strong>Jam pulang</strong><br>'+(a.pulangAt?waktuLokal(new Date(a.pulangAt)):'Belum absen pulang')+'</p>'+
    '<p><strong>Status pulang</strong><br>'+esc(a.jenisPulang==='awal'?'Pulang awal':a.pulangAt?'Normal':'Belum pulang')+'</p>'+
    '<p><strong>Keterangan pulang</strong><br>'+esc(a.alasanPulang||'-')+'</p>'+
    lokasi('Lokasi masuk',a.masukAlamat,a.masukLat,a.masukLon,'masuk')+
    lokasi('Lokasi pulang',a.pulangAlamat,a.pulangLat,a.pulangLon,'pulang')+'</div>'+
    '<h4>Foto Absensi</h4><div class="row-actions">'+
    (a.masukFotoPath?'<button class="btn tiny" data-act="lihatFotoAbsensi" data-kind="masuk" data-id="'+a.id+'">Foto Masuk</button>':'<span class="muted">Foto masuk tidak tersedia</span>')+
    (a.pulangFotoPath?'<button class="btn tiny" data-act="lihatFotoAbsensi" data-kind="pulang" data-id="'+a.id+'">Foto Pulang</button>':'')+'</div>');
}

let ATT_ARCHIVE_YEAR = '';
let ATT_ARCHIVE_MONTH = '';
let ATT_ARCHIVE_DAY = '';

function arsipAbsensiBertingkat(rows){
  const sorted=rows.slice().sort((a,b)=>String(b.tanggal).localeCompare(String(a.tanggal)));
  const years=[...new Set(sorted.map(a=>String(a.tanggal).slice(0,4)))].sort((a,b)=>b.localeCompare(a));
  const btn=(act,value,label)=>'<button class="btn ghost" data-act="'+act+'" data-value="'+esc(value)+'">'+label+'</button>';
  if(!ATT_ARCHIVE_YEAR || !years.includes(ATT_ARCHIVE_YEAR)){
    ATT_ARCHIVE_YEAR='';
    return '<section class="card"><h3>Pilih Tahun</h3>'+
      (years.length?years.map(y=>'<div class="row-actions">'+btn('arsipAbsensiYear',y,'Tahun '+esc(y)+' · Detail')+'</div>').join(''):'<p class="muted">Belum ada riwayat absensi.</p>')+'</section>';
  }
  const yearRows=sorted.filter(a=>String(a.tanggal).startsWith(ATT_ARCHIVE_YEAR+'-'));
  const months=[...new Set(yearRows.map(a=>String(a.tanggal).slice(5,7)))].sort((a,b)=>b.localeCompare(a));
  if(!ATT_ARCHIVE_MONTH || !months.includes(ATT_ARCHIVE_MONTH)){
    ATT_ARCHIVE_MONTH='';
    return '<section class="card"><div class="row-actions">'+btn('arsipAbsensiBackYear','','‹ Kembali ke Tahun')+'</div><h3>Tahun '+esc(ATT_ARCHIVE_YEAR)+'</h3><h4>Pilih Bulan</h4>'+
      months.map(m=>'<div class="row-actions">'+btn('arsipAbsensiMonth',m,new Date(ATT_ARCHIVE_YEAR+'-'+m+'-01T12:00:00').toLocaleDateString('id-ID',{month:'long'})+' · Detail')+'</div>').join('')+'</section>';
  }
  const monthRows=yearRows.filter(a=>String(a.tanggal).slice(5,7)===ATT_ARCHIVE_MONTH);
  const days=[...new Set(monthRows.map(a=>a.tanggal))].sort((a,b)=>b.localeCompare(a));
  if(!ATT_ARCHIVE_DAY || !days.includes(ATT_ARCHIVE_DAY)){
    ATT_ARCHIVE_DAY='';
    return '<section class="card"><div class="row-actions">'+btn('arsipAbsensiBackMonth','','‹ Kembali ke Bulan')+'</div><h3>'+new Date(ATT_ARCHIVE_YEAR+'-'+ATT_ARCHIVE_MONTH+'-01T12:00:00').toLocaleDateString('id-ID',{month:'long',year:'numeric'})+'</h3><h4>Pilih Hari</h4>'+
      days.map(d=>'<div class="row-actions">'+btn('arsipAbsensiDay',d,new Date(d+'T12:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long'})+' · '+monthRows.filter(a=>a.tanggal===d).length+' pegawai · Detail')+'</div>').join('')+'</section>';
  }
  const dayRows=monthRows.filter(a=>a.tanggal===ATT_ARCHIVE_DAY).sort((a,b)=>namaPegawai(a.pegawaiId).localeCompare(namaPegawai(b.pegawaiId)));
  return '<section class="card"><div class="row-actions">'+btn('arsipAbsensiBackDay','','‹ Kembali ke Hari')+'</div><h3>Absensi '+new Date(ATT_ARCHIVE_DAY+'T12:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'</h3>'+
    '<p class="muted">Total '+dayRows.length+' data pegawai pada tanggal ini.</p>'+
    tabel(['Pegawai','Masuk','Pulang','Foto Masuk','Foto Pulang','Detail','Aksi'],
      dayRows.map(a=>[esc(namaPegawai(a.pegawaiId)),a.masukAt?waktuLokal(new Date(a.masukAt)):'-',a.pulangAt?waktuLokal(new Date(a.pulangAt)):'-',a.masukFotoPath?'<button class="btn tiny ghost" data-act="lihatFotoAbsensi" data-kind="masuk" data-id="'+a.id+'">Lihat</button>':'-',a.pulangFotoPath?'<button class="btn tiny ghost" data-act="lihatFotoAbsensi" data-kind="pulang" data-id="'+a.id+'">Lihat</button>':'-','<button class="btn tiny ghost" data-act="detailRiwayatAbsensi" data-id="'+a.id+'">Detail</button>',me()?.tipe==='admin'&&me()?.adminLevel==='utama'?'<button class="btn tiny danger" data-act="hapusRiwayat" data-tbl="absensi" data-id="'+a.id+'">Hapus</button>':'-']),
      'Belum ada data absensi pada hari ini.')+'</section>';
}

function pageAbsensi(){
  const u=me(),today=hariIni(),cfg=DB.all('pengaturanAbsensi')[0]||{jamMasuk:'08:00',jamPulang:'17:00',toleransiTerlambat:0},izin=DB.all('izin');
  if(u.tipe==='pegawai'){
    const rows=DB.all('absensi').filter(a=>String(a.pegawaiId)===String(u.id)).sort((a,b)=>b.tanggal.localeCompare(a.tanggal)),a=rows.find(x=>x.tanggal===today);
    const milik=izin.filter(x=>String(x.pegawaiId)===String(u.id)).sort((x,y)=>y.tanggalMulai.localeCompare(x.tanggalMulai));
    const years=[...new Set(rows.map(x=>x.tanggal.slice(0,4)))].sort((a,b)=>b.localeCompare(a));
    const year=ATT_HISTORY_YEAR&&years.includes(ATT_HISTORY_YEAR)?ATT_HISTORY_YEAR:(years[0]||String(new Date().getFullYear()));
    const months=[...new Set(rows.filter(x=>x.tanggal.startsWith(year+'-')).map(x=>x.tanggal.slice(5,7)))].sort((a,b)=>b.localeCompare(a));
    const month=ATT_HISTORY_MONTH&&months.includes(ATT_HISTORY_MONTH)?ATT_HISTORY_MONTH:(months[0]||'');
    const history=rows.filter(x=>x.tanggal.startsWith(year+'-'+month));
    const btn=!a?'<button class="btn" data-act="absenMasuk">Absen Masuk + Foto</button>':a.pulangAt?'<span class="tag green">Selesai</span>':'';
    const formPulang=a&&!a.pulangAt?'<section class="card"><h3>Form Absen Pulang</h3><p>Jam pulang sesuai jadwal: <b>'+esc(cfg.jamPulang)+'</b></p><form id="att-checkout-form" class="form-grid"><label class="field"><span>Jenis pulang</span><select name="jenisPulang"><option value="normal">Pulang sesuai jadwal</option><option value="awal">Pulang awal</option></select></label><label class="field full" id="att-early-reason-wrap" hidden><span>Keterangan pulang awal (wajib)</span><textarea name="alasanPulang" rows="3" placeholder="Tuliskan alasan pulang lebih awal"></textarea></label><button class="btn" type="submit">Lanjut Absen Pulang + Foto</button><p id="att-checkout-msg" class="form-error full"></p></form></section>':'';
    const riwayat='<section class="card"><h3>Riwayat Absensi</h3><div class="form-grid"><label class="field"><span>Pilih Tahun</span><select data-att-history-filter="year">'+years.map(y=>'<option value="'+y+'" '+(y===year?'selected':'')+'>'+y+'</option>').join('')+'</select></label><label class="field"><span>Pilih Bulan</span><select data-att-history-filter="month">'+months.map(m=>'<option value="'+m+'" '+(m===month?'selected':'')+'>'+new Date(year+'-'+m+'-01T12:00:00').toLocaleDateString('id-ID',{month:'long'})+'</option>').join('')+'</select></label></div>'+
      (history.length?'<div class="table-wrap"><table><thead><tr><th>Hari / Tanggal</th><th>Masuk</th><th>Pulang</th><th>Detail</th></tr></thead><tbody>'+history.map(x=>'<tr><td>'+new Date(x.tanggal+'T12:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'</td><td>'+(x.masukAt?waktuLokal(new Date(x.masukAt)):'-')+'</td><td>'+(x.pulangAt?waktuLokal(new Date(x.pulangAt)):'-')+'</td><td><button class="btn tiny ghost" data-act="detailRiwayatAbsensi" data-id="'+x.id+'">Detail</button></td></tr>').join('')+'</tbody></table></div>':'<p class="muted">Belum ada riwayat pada bulan ini.</p>')+'</section>';
    return {html:head('Absensi Pegawai',btn+' <button class="btn ghost" data-act="ajukanIzin">Ajukan Izin / Sakit</button>')+
      '<section class="card"><h3>Jadwal Kerja</h3><p>Masuk: <b>'+esc(cfg.jamMasuk)+'</b> · Pulang: <b>'+esc(cfg.jamPulang)+'</b> · Toleransi: '+(Number(cfg.toleransiTerlambat)||0)+' menit</p></section>'+
      (a?'<section class="card"><h3>Hari Ini</h3><p>Masuk: '+(a.masukAt?waktuLokal(new Date(a.masukAt)):'-')+'</p><p>Pulang: '+(a.pulangAt?waktuLokal(new Date(a.pulangAt)):'Belum absen')+'</p><p>'+esc(a.masukAlamat||'-')+'</p></section>':'<section class="card">Belum ada absensi hari ini.</section>')+formPulang+riwayat+
      '<h3>Pengajuan Izin</h3>'+tabel(['Periode','Jenis','Alasan','Status'],milik.map(x=>[tgl(x.tanggalMulai)+' – '+tgl(x.tanggalSelesai),esc(x.jenis),esc(x.alasan),esc(x.status)]),'Belum ada izin.') ,
      after:()=>{const form=$('#att-checkout-form');if(form){const jenis=form.elements.jenisPulang,wrap=$('#att-early-reason-wrap'),sync=()=>{wrap.hidden=jenis.value!=='awal';form.elements.alasanPulang.required=jenis.value==='awal';};jenis.onchange=sync;sync();form.onsubmit=async ev=>{ev.preventDefault();const msg=$('#att-checkout-msg'),early=jenis.value==='awal',reason=form.elements.alasanPulang.value.trim();if(early&&!reason){msg.textContent='Keterangan wajib diisi untuk pulang awal.';return;}const cfgNow=DB.all('pengaturanAbsensi')[0]||{jamPulang:'17:00'},clock=new Date().toTimeString().slice(0,5);if(!early&&clock<(cfgNow.jamPulang||'17:00')){msg.textContent='Saat ini belum jam pulang. Pilih Pulang Awal dan isi keterangannya.';return;}await lakukanAbsensi('pulang',{jenisPulang:early?'awal':'normal',alasanPulang:early?reason:null});};}}};
  }
  const peg=DB.all('pegawai').filter(p=>p.statusVerifikasi==='disetujui'),todayRows=DB.all('absensi').filter(x=>x.tanggal===today);
  const lewatJamPulang=new Date().toTimeString().slice(0,5)>=(cfg.jamPulang||'17:00');
  const batasMasuk=(cfg.jamMasuk||'08:00').split(':').map(Number);
  const deadlineMasuk=new Date();deadlineMasuk.setHours(batasMasuk[0],batasMasuk[1]+(Number(cfg.toleransiTerlambat)||0),0,0);
  const status=peg.map(p=>{const a=todayRows.find(x=>String(x.pegawaiId)===String(p.id));const iz=izin.find(x=>String(x.pegawaiId)===String(p.id)&&x.status==='disetujui'&&x.tanggalMulai<=today&&x.tanggalSelesai>=today);let st=a?(a.masukAt&&new Date(a.masukAt)>deadlineMasuk?'Terlambat':'Hadir'):iz?'Izin':lewatJamPulang?'Tidak hadir':'Belum absen';return [esc(p.nama),'<span class="tag '+(st==='Hadir'?'green':st==='Izin'?'amber':st==='Terlambat'?'amber':st==='Tidak hadir'?'red':'')+'">'+st+'</span>',a?.masukAt?waktuLokal(new Date(a.masukAt)):'-',a?.pulangAt?waktuLokal(new Date(a.pulangAt)):'-'];});
  const pending=izin.filter(x=>x.status==='menunggu');
  return {html:head('Rekap Absensi Pegawai')+
    '<section class="card"><h3>Atur Jam Kerja</h3><form id="att-schedule" class="form-grid"><label class="field"><span>Jam masuk</span><input name="jamMasuk" type="time" value="'+esc(cfg.jamMasuk)+'" required></label><label class="field"><span>Jam pulang</span><input name="jamPulang" type="time" value="'+esc(cfg.jamPulang)+'" required></label><label class="field"><span>Toleransi terlambat (menit)</span><input name="toleransiTerlambat" type="number" min="0" max="180" value="'+(Number(cfg.toleransiTerlambat)||0)+'" required></label><button class="btn" type="submit">Simpan Jadwal</button><p id="att-schedule-msg" class="form-error full"></p></form></section>'+
    '<h3>Status Hari Ini</h3>'+tabel(['Pegawai','Status','Masuk','Pulang','Foto Masuk','Foto Pulang'],status.map((r,i)=>{const a=todayRows.find(x=>String(x.pegawaiId)===String(peg[i].id));return r.concat([a?.masukFotoPath?'<button class="btn tiny ghost" data-act="lihatFotoAbsensi" data-kind="masuk" data-id="'+a.id+'">Lihat</button>':'-',a?.pulangFotoPath?'<button class="btn tiny ghost" data-act="lihatFotoAbsensi" data-kind="pulang" data-id="'+a.id+'">Lihat</button>':'-']);}),'Belum ada pegawai.')+
    '<h3>Arsip Riwayat Absensi</h3>'+arsipAbsensiBertingkat(DB.all('absensi'))+
    '<h3>Pengajuan Izin Menunggu</h3>'+tabel(['Pegawai','Periode','Jenis','Alasan','Bukti','Keputusan'],pending.map(x=>[esc(namaPegawai(x.pegawaiId)),tgl(x.tanggalMulai)+' – '+tgl(x.tanggalSelesai),esc(x.jenis),esc(x.alasan),'<button class="btn tiny ghost" data-act="lihatBuktiIzin" data-id="'+x.id+'">Lihat</button>','<button class="btn tiny" data-act="prosesIzin" data-status="disetujui" data-id="'+x.id+'">Setujui</button> <button class="btn tiny danger" data-act="prosesIzin" data-status="ditolak" data-id="'+x.id+'">Tolak</button>']),'Tidak ada izin menunggu.')+'<h3>Riwayat Pengajuan Izin</h3>'+tabel(['Pegawai','Periode','Jenis','Status','Bukti','Aksi'],izin.map(x=>[esc(namaPegawai(x.pegawaiId)),tgl(x.tanggalMulai)+' – '+tgl(x.tanggalSelesai),esc(x.jenis),esc(x.status),x.fotoPath?'<button class="btn tiny ghost" data-act="lihatBuktiIzin" data-id="'+x.id+'">Lihat</button>':'-',me()?.adminLevel==='utama'?'<button class="btn tiny danger" data-act="hapusRiwayat" data-tbl="izin" data-id="'+x.id+'">Hapus</button>':'-']),'Belum ada riwayat izin.'),
    after:()=>{const form=$('#att-schedule');if(form)form.onsubmit=async ev=>{ev.preventDefault();const d={jamMasuk:form.elements.jamMasuk.value,jamPulang:form.elements.jamPulang.value,toleransiTerlambat:Number(form.elements.toleransiTerlambat.value)};const msg=$('#att-schedule-msg');try{if(d.jamPulang<=d.jamMasuk)throw new Error('Jam pulang harus setelah jam masuk.');const old=DB.all('pengaturanAbsensi')[0];if(old)await DB.update('pengaturanAbsensi',old.id,d);else await DB.add('pengaturanAbsensi',d);await DB.init(true);render();}catch(x){msg.textContent=x.message;}};}};
}
async function lakukanAbsensi(jenis,opsi={}){
  const u=me();if(u?.tipe!=='pegawai')return alert('Hanya pegawai yang dapat absen.');
  const a=DB.all('absensi').find(x=>String(x.pegawaiId)===String(u.id)&&x.tanggal===hariIni());
  if(jenis==='masuk'&&a)return alert('Sudah absen masuk hari ini.');
  if(jenis==='pulang'&&(!a||a.pulangAt))return alert('Data masuk tidak ditemukan atau sudah absen pulang.');
    try{const p=await fotoKameraAbsensi('Foto Absen '+(jenis==='masuk'?'Masuk':'Pulang'));const path=await unggahBuktiAbsensi('absensi-bukti',u.authId,p.blob),now=new Date().toISOString();
    const d=jenis==='masuk'?{masukAt:now,masukLat:p.gps.lat,masukLon:p.gps.lon,masukAlamat:p.gps.place,masukFotoPath:path,masukFotoCapturedAt:p.at.toISOString(),masukAccuracy:p.gps.accuracy}:{pulangAt:now,pulangLat:p.gps.lat,pulangLon:p.gps.lon,pulangAlamat:p.gps.place,pulangFotoPath:path,pulangFotoCapturedAt:p.at.toISOString(),pulangAccuracy:p.gps.accuracy,jenisPulang:opsi.jenisPulang||'normal',alasanPulang:opsi.alasanPulang||null};
    try{if(jenis==='masuk')await DB.add('absensi',{pegawaiId:u.id,authUserId:u.authId,tanggal:hariIni(),...d});else await DB.update('absensi',a.id,d);}catch(x){await supabaseClient.storage.from('absensi-bukti').remove([path]);throw x;}
    await DB.init(false);render();
  }catch(x){if(x.message!=='Foto dibatalkan.')alert('Absensi gagal: '+x.message);}
}
async function ajukanIzinPegawai(){
  const u=me();try{const p=await fotoKameraAbsensi('Foto Bukti Izin / Sakit');
    openModal('Ajukan Izin / Sakit',[{name:'tanggalMulai',label:'Tanggal mulai',type:'date',req:true,def:hariIni()},{name:'tanggalSelesai',label:'Tanggal selesai',type:'date',req:true,def:hariIni()},{name:'jenis',label:'Jenis izin',type:'select',options:['Izin','Sakit'],req:true},{name:'alasan',label:'Alasan',type:'textarea',req:true,full:true}],{},async d=>{
      if(d.tanggalSelesai<d.tanggalMulai)return 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
      const path=await unggahBuktiAbsensi('izin-bukti',u.authId,p.blob);
      try{await DB.add('izin',{pegawaiId:u.id,authUserId:u.authId,tanggalMulai:d.tanggalMulai,tanggalSelesai:d.tanggalSelesai,jenis:d.jenis,alasan:d.alasan,fotoPath:path,status:'menunggu'});}catch(x){await supabaseClient.storage.from('izin-bukti').remove([path]);throw x;}
      await DB.init(false);return null;
    });
  }catch(x){if(x.message!=='Foto dibatalkan.')alert('Pengajuan izin gagal: '+x.message);}
}
async function prosesIzinPegawai(id,status){
  if(!isAdmin())return;const catatan=status==='ditolak'?prompt('Alasan penolakan (wajib):'):'';
  if(status==='ditolak'&&!catatan?.trim())return;
  try{await DB.update('izin',id,{status,catatanAdmin:catatan||null,diprosesOleh:me().authId,diprosesAt:new Date().toISOString()});await DB.init(true);render();}catch(x){alert('Gagal memproses izin: '+x.message);}
}
async function lihatFotoAbsensi(id,jenis){
  const a=DB.get('absensi',id),path=jenis==='pulang'?a?.pulangFotoPath:a?.masukFotoPath;
  if(!path)return;const {data,error}=await supabaseClient.storage.from('absensi-bukti').createSignedUrl(path,300);
  if(error)return alert('Foto absensi gagal dibuka: '+error.message);
  openInfo('Foto Absen '+(jenis==='pulang'?'Pulang':'Masuk'),'<img src="'+esc(data.signedUrl)+'" alt="Foto absensi" style="width:100%;max-height:420px;object-fit:contain;border-radius:12px">');
}
async function lihatBuktiIzin(id){
  const x=DB.get('izin',id);if(!x?.fotoPath)return;const {data,error}=await supabaseClient.storage.from('izin-bukti').createSignedUrl(x.fotoPath,300);
  if(error)return alert(error.message);openInfo('Bukti Izin','<img src="'+esc(data.signedUrl)+'" style="width:100%;max-height:420px;object-fit:contain" alt="Bukti izin">');
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
  return { html, after: () => { DB.all('laporan').forEach(l => { DB.update('laporan', l.id, { dibaca: true }).catch(e => console.error(e)); }); } };
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
      const rows = urut(DB.all('laporan').filter(l => cocokTgl(l.tanggal) && l.tanamanNama), 'tanggal');
      return {
        judul: 'Laporan Perkembangan Tanaman dari Pegawai', file: 'laporan-perkembangan',
        kolom: ['Tanggal', 'Pegawai', 'Tanaman', 'Lokasi', 'Luas (m²)', 'Jumlah ditanam', 'Umur (hari)', 'Status', 'Kegiatan'],
        baris: rows.map(l => [l.tanggal, namaPegawai(l.pegawaiId), l.tanamanNama, l.lokasi, l.luasM2 ?? '-', l.jumlahDitanam ?? '-', l.umurTanamanHari ?? '-', l.statusTanaman || '-', l.jenis])
      };
    }
    case 'panen': {
      const rows = urut(DB.all('laporan').filter(l=>l.jenis==='Panen' && cocokTgl(l.tanggal)), 'tanggal');
      const total = rows.reduce((s,x)=>s+Number(x.panenKg||0),0);
      return {
        judul: 'Laporan Hasil Panen', file: 'laporan-panen',
        ringkas: `Total panen: ${rp(total)} kg dari ${rows.length} kali panen`,
        kolom: ['Tanggal','Tanaman','Hasil (kg)','Grade','Lahan','Pemanen','Status'],
        baris: rows.map(l=>[l.tanggal,l.tanamanNama,l.panenKg,l.kualitasPanen,l.lokasi,namaPegawai(l.pegawaiId),l.status])
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


function buatPasswordSementara(panjang = 14) {
  const karakter = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const acak = new Uint32Array(panjang);
  crypto.getRandomValues(acak);
  return Array.from(acak, n => karakter[n % karakter.length]).join('');
}

function nomorWhatsApp(telepon) {
  let nomor = String(telepon || '').replace(/\D/g, '');
  if (nomor.startsWith('0')) nomor = '62' + nomor.slice(1);
  else if (nomor.startsWith('8')) nomor = '62' + nomor;
  return /^62\d{8,13}$/.test(nomor) ? nomor : '';
}

async function resetPasswordPegawai(id) {
  if (!isAdmin()) return alert('Hanya Admin yang boleh mereset password.');
  const pegawai = DB.get('pegawai', id);
  if (!pegawai) return alert('Data pegawai tidak ditemukan.');
  if (!pegawai.authUserId) return alert('Akun login pegawai ini belum terhubung.');

  if (!confirm(`Reset password akun ${pegawai.nama}?`)) return;

  const temporaryPassword = buatPasswordSementara();

  try {
    const { data, error } = await supabaseClient.functions.invoke('admin-reset-password', {
      body: { pegawaiId: id, temporaryPassword }
    });

    if (error) {
      let pesan = error.message || 'Permintaan reset password gagal.';
      try {
        const detail = await error.context?.json();
        if (detail?.error) pesan = detail.error;
      } catch (_) {}
      throw new Error(pesan);
    }
    if (!data?.success) throw new Error(data?.error || 'Function tidak mengonfirmasi reset password.');

    const nomor = nomorWhatsApp(pegawai.telepon);
    const pesanWA = `Halo ${pegawai.nama}, password sementara akun SIMTANI Anda: ${temporaryPassword}. Silakan login menggunakan email terdaftar, lalu segera buat password baru setelah berhasil masuk.`;
    const tautanWA = nomor
      ? `https://api.whatsapp.com/send?phone=${nomor}&text=${encodeURIComponent(pesanWA)}`
      : '';

    openInfo(`Password sementara · ${pegawai.nama}`, `
      <p>Password akun pegawai berhasil direset.</p>
      <p><strong>Password sementara:</strong></p>
      <p><code>${esc(temporaryPassword)}</code></p>
      <button class="btn" data-act="salinPassword" data-password="${esc(temporaryPassword)}">Salin password</button>
      ${tautanWA
        ? `<p><a class="btn ghost" href="${esc(tautanWA)}" target="_blank" rel="noopener noreferrer">Buka WhatsApp dengan pesan</a></p>
           <p class="muted">Jika teks tidak muncul, salin pesan berikut ke chat pegawai:</p>
           <p><textarea readonly rows="4" style="width:100%">${esc(pesanWA)}</textarea></p>`
        : '<p class="muted">Nomor WhatsApp belum valid. Sampaikan password sementara secara langsung melalui cara yang aman.</p>'}
      <p class="muted">Pegawai harus mengganti password setelah login.</p>
    `);
  } catch (err) {
    alert('Gagal mereset password: ' + (err.message || 'Kesalahan tidak diketahui.'));
  }
}

async function prosesVerifikasiPegawai(id, status) {
  let alasan = null;
  if (status === 'ditolak') {
    alasan = prompt('Masukkan alasan penolakan pendaftaran pegawai:');
    if (alasan === null) return;
    alasan = alasan.trim();
    if (!alasan) { alert('Alasan penolakan wajib diisi.'); return; }
  }
  if (!confirm(status === 'disetujui' ? 'Setujui akun pegawai ini?' : 'Tolak pendaftaran pegawai ini?')) return;
  try {
    const { error } = await supabaseClient.rpc('admin_verifikasi_pegawai', {
      p_pegawai_id: id, p_status: status, p_alasan: alasan
    });
    if (error) throw error;
    await DB.init(true);
    alert(status === 'disetujui' ? 'Pegawai berhasil disetujui.' : 'Pendaftaran pegawai ditolak.');
    render();
  } catch (err) {
    alert('Gagal memproses verifikasi: ' + (err.message || 'Kesalahan tidak diketahui'));
  }
}

/* ===== Router & render ===== */

function detailPegawai(id) {
  const p = DB.get('pegawai', id);
  if (!p) return alert('Data pegawai tidak ditemukan.');
  const akses = (p.akses || []).map(a => '<span class="tag green">' + esc(AKSES[a] || a) + '</span>').join(' ') || '<span class="muted">Hanya laporan harian</span>';
  const status = p.statusVerifikasi === 'disetujui' ? '<span class="tag green">Disetujui</span>' : p.statusVerifikasi === 'ditolak' ? '<span class="tag red">Ditolak</span>' : '<span class="tag amber">Menunggu</span>';
  openInfo('Detail Pegawai', '<div class="detail-profile"><div class="detail-avatar">👤</div><h2>' + esc(p.nama) + '</h2><p>' + esc(p.jabatan || '-') + '</p>' + status +
    '<div class="detail-grid">' +
    '<div><small>ID Pegawai</small><strong>' + esc(p.idPegawai || '-') + '</strong></div>' +
    '<div><small>Username</small><strong>' + esc(p.username || '-') + '</strong></div>' +
    '<div><small>Email</small><strong>' + esc(p.email || '-') + '</strong></div>' +
    '<div><small>WhatsApp</small><strong>' + esc(p.telepon || '-') + '</strong></div>' +
    '<div><small>Status Kerja</small><strong>' + esc(p.statusKerja || '-') + '</strong></div>' +
    '<div><small>Alamat</small><strong>' + esc(p.alamat || '-') + '</strong></div></div>' +
    '<h4>Akses Sistem</h4><div class="detail-access">' + akses + '</div>' +
    '<div class="row-actions detail-actions">' +
    (p.statusVerifikasi === 'menunggu' ? '<button class="btn" data-act="setujuiPegawai" data-id="' + p.id + '">Setujui</button><button class="btn danger" data-act="tolakPegawai" data-id="' + p.id + '">Tolak</button>' : '') +
    (p.authUserId ? '<button class="btn ghost" data-act="resetPasswordPegawai" data-id="' + p.id + '">Reset Password</button>' : '') +
    '<button class="btn ghost" data-act="riwayat" data-id="' + p.id + '">Riwayat</button><button class="btn ghost" data-act="edit" data-tbl="pegawai" data-id="' + p.id + '">Ubah Data</button></div></div>');
}
function pageProfil() {
  const u = me();
  const photo = u.avatarUrl ? '<img src="' + esc(u.avatarUrl) + '" class="thumb-lg" alt="Foto profil">' : '<p class="muted">Belum ada foto profil.</p>';
  return { html: head('Profil Saya') + '<div class="card" style="max-width:620px">' + photo +
    '<form id="profil-form" class="form-grid">' +
    '<label class="field full"><span>Nama</span><input id="profil-nama" maxlength="100" value="' + esc(u.nama) + '" required></label>' +
    '<label class="field full"><span>Foto profil (maks. 350 KB)</span><input id="profil-foto" type="file" accept="image/*"></label>' +
    '<p id="profil-error" class="form-error full"></p><div class="form-actions"><button class="btn">Simpan Profil</button></div></form>' +
    '<hr style="border:0;border-top:1px solid var(--garis);margin:22px 0"><h3>Ubah Password</h3>' +
    '<form id="profil-pass-form" class="form-grid">' +
    '<label class="field full"><span>Password baru (minimal 8 karakter)</span><input id="profil-pass" type="password" minlength="8" required></label>' +
    '<label class="field full"><span>Ulangi password baru</span><input id="profil-pass2" type="password" minlength="8" required></label>' +
    '<p id="profil-pass-error" class="form-error full"></p><div class="form-actions"><button class="btn">Ubah Password</button></div></form></div>', after: () => {
      $('#profil-form').onsubmit = async e => {
        e.preventDefault();
        const errBox = $('#profil-error');
        try {
          const nama = $('#profil-nama').value.trim();
          if (!nama) throw new Error('Nama wajib diisi.');
          const file = $('#profil-foto').files[0];
          let avatar = u.avatarUrl || '';
          if (file) {
            if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Foto harus JPG, PNG, atau WebP.');
            if (file.size > 2 * 1024 * 1024) throw new Error('Ukuran foto maksimal 2 MB.');
            const blob = await new Promise((resolve, reject) => {
              const fr = new FileReader();
              fr.onload = () => {
                const img = new Image();
                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  const scale = Math.min(1, 640 / Math.max(img.width, img.height));
                  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
                  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                  canvas.toBlob(b => b ? resolve(b) : reject(new Error('Foto gagal diproses.')), 'image/jpeg', 0.82);
                };
                img.onerror = () => reject(new Error('File foto tidak valid.')); img.src = fr.result;
              };
              fr.onerror = () => reject(new Error('Foto gagal dibaca.')); fr.readAsDataURL(file);
            });
            const path = u.authId + '/avatar.jpg';
            const { error: uploadError } = await supabaseClient.storage.from('profile-photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
            if (uploadError) throw uploadError;
            const { data: publicData } = supabaseClient.storage.from('profile-photos').getPublicUrl(path);
            avatar = publicData.publicUrl + '?v=' + Date.now();
          }
          const { data: savedProfile, error } = await supabaseClient
            .from('profiles')
            .update({ nama, avatar_url: avatar })
            .eq('id', u.authId)
            .select('id,nama,avatar_url')
            .maybeSingle();
          if (error) throw error;
          if (!savedProfile) throw new Error('Profil tidak tersimpan: data akun tidak ditemukan atau izin database menolak perubahan.');

          if (u.tipe === 'pegawai') {
            const { data: savedEmployee, error: pe } = await supabaseClient
              .from('pegawai')
              .update({ nama })
              .eq('auth_user_id', u.authId)
              .select('id,nama')
              .maybeSingle();
            if (pe) throw pe;
            if (!savedEmployee) throw new Error('Nama profil utama tersimpan, tetapi data pegawai tidak berubah. Periksa izin tabel pegawai.');
            const pr = DB.get('pegawai', u.id); if (pr) pr.nama = savedEmployee.nama;
          }
          u.nama = nama; u.avatarUrl = avatar;
          alert('Profil berhasil diperbarui.'); render();
        } catch (ex) { errBox.textContent = ex.message || 'Gagal menyimpan profil.'; }
      };
      $('#profil-pass-form').onsubmit = async e => {
        e.preventDefault();
        const p = $('#profil-pass').value, p2 = $('#profil-pass2').value, box = $('#profil-pass-error');
        box.textContent = '';
        if (p.length < 8 || p !== p2) { box.textContent = p.length < 8 ? 'Password minimal 8 karakter.' : 'Konfirmasi password tidak sama.'; return; }
        try { const { error } = await supabaseClient.auth.updateUser({ password: p }); if (error) throw error; $('#profil-pass-form').reset(); alert('Password berhasil diubah.'); }
        catch (ex) { box.textContent = ex.message || 'Gagal mengubah password.'; }
      };
    }};
}

async function kelolaAdminKedua(action, adminId, nama) {
  if (!isAdminUtama()) return alert('Hanya Admin Utama yang dapat mengelola Admin Kedua.');
  if (action === 'delete' && !confirm('Hapus akun Admin Kedua ' + nama + '? Akun tersebut tidak dapat login lagi.')) return;
  let temporaryPassword = '';
  if (action === 'reset') {
    if (!confirm('Buat password sementara baru untuk ' + nama + '?')) return;
    temporaryPassword = buatPasswordSementara();
  }
  try {
    const { data, error } = await supabaseClient.functions.invoke('admin-manage-admin', {
      body: { action, adminId, temporaryPassword }
    });
    if (error) {
      let message = error.message || 'Permintaan gagal.';
      try { const detail = await error.context?.json(); if (detail?.error) message = detail.error; } catch (_) {}
      throw new Error(message);
    }
    if (!data?.success) throw new Error(data?.error || 'Server tidak mengonfirmasi tindakan.');
    if (action === 'reset') {
      openInfo('Password sementara · ' + nama,
        '<p>Password Admin Kedua berhasil direset.</p><p><strong>Password sementara:</strong></p><p><code>' + esc(temporaryPassword) + '</code></p>' +
        '<button class="btn" data-act="salinPassword" data-password="' + esc(temporaryPassword) + '">Salin password</button>' +
        '<p class="muted">Sampaikan password ini secara pribadi. Admin Kedua wajib menggantinya setelah login.</p>');
    } else {
      alert('Akun Admin Kedua berhasil dihapus.');
      render();
    }
  } catch (ex) { alert('Gagal mengelola Admin: ' + (ex.message || 'Kesalahan tidak diketahui.')); }
}

async function muatPermohonanAdmin() {
  const box = $('#admin-applications-loading');
  if (!box) return;
  try {
    const { data, error } = await supabaseClient.functions.invoke('admin-registration', { body: { action: 'list' } });
    if (error) {
      let message = error.message || 'Gagal memuat permohonan.';
      try { const detail = await error.context?.json(); if (detail?.error) message = detail.error; } catch (_) {}
      throw new Error(message);
    }
    if (!data?.success) throw new Error(data?.error || 'Server tidak mengonfirmasi permintaan.');
    const apps = data.applications || [];
    const rows = apps.map(x => [
      '<strong>' + esc(x.nama) + '</strong>',
      esc(x.username),
      esc(x.email),
      tgl(x.created_at),
      '<div class="row-actions"><button class="btn tiny" data-act="approveAdminApplication" data-id="' + esc(x.id) + '">Setujui</button><button class="btn tiny danger" data-act="rejectAdminApplication" data-id="' + esc(x.id) + '">Tolak</button></div>'
    ]);
    box.outerHTML = tabel(['Nama', 'Username', 'Email', 'Tanggal', 'Tindakan'], rows, 'Tidak ada permohonan admin yang menunggu.');
  } catch (err) {
    box.textContent = 'Gagal memuat permohonan: ' + (err.message || 'Kesalahan tidak diketahui.');
  }
}

async function prosesPermohonanAdmin(applicationId, action) {
  if (!isAdminUtama()) return alert('Hanya Admin Utama yang dapat memverifikasi permohonan.');
  const label = action === 'approve' ? 'menyetujui' : 'menolak';
  if (!confirm('Yakin ' + label + ' permohonan Admin Kedua ini?')) return;
  try {
    const { data, error } = await supabaseClient.functions.invoke('admin-registration', {
      body: { action, applicationId }
    });
    if (error) {
      let message = error.message || 'Permintaan gagal.';
      try { const detail = await error.context?.json(); if (detail?.error) message = detail.error; } catch (_) {}
      throw new Error(message);
    }
    if (!data?.success) throw new Error(data?.error || 'Server tidak mengonfirmasi tindakan.');
    alert(action === 'approve' ? 'Pendaftaran disetujui. Akun kini menjadi Admin Kedua.' : 'Pendaftaran ditolak.');
    render();
  } catch (err) {
    alert('Gagal memproses permohonan: ' + (err.message || 'Kesalahan tidak diketahui.'));
  }
}

function pageAdmins() {
  return { html: head('Manajemen Admin') + '<div id="admin-list-loading" class="empty">Memuat daftar administrator...</div>', after: async () => {
    const target = $('#admin-list-loading');
    try {
      const { data, error } = await supabaseClient.from('profiles').select('id,nama,username,role,admin_level').eq('role', 'admin').order('nama');
      if (error) throw error;
      const admins = data || [];
      const utama = isAdminUtama();
      const rows = admins.map(x => [
        '<strong>' + esc(x.nama) + '</strong>',
        esc(x.username || '-'),
        x.admin_level === 'utama' ? '<span class="tag green">Admin Utama</span>' : '<span class="tag blue">Admin Kedua</span>',
        x.admin_level === 'kedua' && utama
          ? '<div class="row-actions"><button class="btn tiny ghost" data-act="resetAdmin" data-id="' + esc(x.id) + '" data-nama="' + esc(x.nama) + '">Reset Password</button><button class="btn tiny danger" data-act="hapusAdmin" data-id="' + esc(x.id) + '" data-nama="' + esc(x.nama) + '">Hapus</button></div>'
          : '<span class="muted">-</span>'
      ]);
      target.outerHTML = '<div class="stats"><div class="stat"><span>Total Administrator</span><strong>' + admins.length +
        '</strong></div><div class="stat"><span>Admin Utama</span><strong>' + admins.filter(x => x.admin_level === 'utama').length +
        '</strong></div><div class="stat"><span>Admin Kedua</span><strong>' + admins.filter(x => x.admin_level === 'kedua').length +
        '</strong></div></div>' + (utama ? '<p class="muted">Admin Utama dapat mereset password dan menghapus Admin Kedua. Akun Admin Utama dilindungi.</p>' : '<p class="muted">Anda dapat melihat daftar administrator. Pengelolaan akun hanya tersedia untuk Admin Utama.</p>') +
        tabel(['Nama', 'Username', 'Tingkatan', 'Aksi'], rows, 'Belum ada administrator.') +
        (utama ? '<section class="card" style="margin-top:20px"><h3>Permohonan Admin Kedua</h3><div id="admin-applications-loading" class="empty">Memuat permohonan...</div></section>' : '');
      if (utama) muatPermohonanAdmin();
    } catch (ex) { target.textContent = 'Gagal memuat daftar admin: ' + (ex.message || 'Periksa izin akses.'); }
  }};
}


/* ----- Kelompok Kerja & Penugasan ----- */
function labelStatusTugas(status) {
  return ({
    berjalan:'Sedang dikerjakan',
    menunggu_verifikasi:'Menunggu pemeriksaan hasil',
    menunggu_persetujuan_lanjut:'Menunggu persetujuan lanjut',
    ditunda:'Dijadwalkan ulang',
    selesai:'Selesai',
    dibatalkan:'Dibatalkan'
  })[status] || status || '-';
}
function aksiStatusTugas(t) {
  if (isAdmin()) {
    if (t.status === 'menunggu_persetujuan_lanjut') return '<button class="btn tiny" data-act="verifikasiTugas" data-id="'+t.id+'" data-status="berjalan">Setujui lanjut</button><button class="btn tiny ghost" data-act="verifikasiTugas" data-id="'+t.id+'" data-status="ditunda">Jadwalkan ulang</button>';
    if (t.status === 'ditunda') return '<button class="btn tiny" data-act="verifikasiTugas" data-id="'+t.id+'" data-status="berjalan">Aktifkan tugas</button>';
    if (t.status === 'menunggu_verifikasi') return '<button class="btn tiny" data-act="verifikasiTugas" data-id="'+t.id+'" data-status="selesai">Terima hasil</button><button class="btn tiny danger" data-act="verifikasiTugas" data-id="'+t.id+'" data-status="berjalan">Minta perbaikan</button>';
    return '';
  }
  if (t.status === 'berjalan') return '<button class="btn tiny" data-act="catatAktivitasTugas" data-id="'+t.id+'">Catat progres</button><button class="btn tiny ghost" data-act="ajukanSelesaiTugas" data-id="'+t.id+'">Ajukan selesai</button>';
  if (t.status === 'menunggu_persetujuan_lanjut') return '<span class="muted">Menunggu keputusan admin untuk melanjutkan.</span>';
  if (t.status === 'ditunda') return '<span class="muted">Tugas dijadwalkan ulang oleh admin.</span>';
  return '';
}
function barisTugas(t,logs) {
  const tujuan=t.kelompokId ? 'Kelompok '+(DB.get('kelompok',t.kelompokId)?.nama||'') : 'Perorangan · '+namaPegawai(t.pegawaiId);
  return [
    '<strong>'+esc(t.judul)+'</strong><div class="muted">'+esc(t.jenis)+' · '+esc(t.lahanNama||'Tanpa lahan')+' · '+esc(tujuan)+' · Tenggat '+esc(t.tenggat||'-')+'</div><div>'+tagStatus(labelStatusTugas(t.status))+'</div>',
    '<div class="row-actions">'+aksiStatusTugas(t)+'</div>',
    '<div class="muted">'+logs.filter(l=>String(l.tugasId)===String(t.id)).length+' catatan progres</div>'
  ];
}
function bukaFormTugas() {
  if (!isAdmin()) return;
  const staff = DB.all('pegawai').filter(p => p.statusVerifikasi === 'disetujui');
  const groups = DB.all('kelompok').slice().sort((a,b) => String(a.nama).localeCompare(String(b.nama)));
  const targets = [
    ...staff.map(p => ['pegawai:' + p.id, 'Individu · ' + p.nama]),
    ...groups.map(g => ['kelompok:' + g.id, 'Kelompok · ' + g.nama])
  ];
  if (!targets.length) return alert('Belum ada pegawai aktif atau kelompok yang dapat menerima tugas.');
  const fields = [
    { name: 'judul', label: 'Nama tugas', req: true },
    { name: 'target', label: 'Ditugaskan kepada', type: 'select', options: targets, req: true },
    { name: 'jenis', label: 'Jenis pekerjaan', type: 'select', options: [['Penanaman','Penanaman'],['Pemupukan','Pemupukan'],['Perawatan','Perawatan'],['Panen','Panen'],['Lainnya','Lainnya']], def: 'Perawatan', req: true },
    { name: 'deskripsi', label: 'Instruksi pekerjaan', type: 'textarea', full: true },
    { name: 'lahanNama', label: 'Nama lahan (opsional)' },
    { name: 'tanggalMulai', label: 'Tanggal mulai', type: 'date', def: hariIni(), req: true },
    { name: 'tenggat', label: 'Tenggat (opsional)', type: 'date' }
  ];
  openModal('Buat Tugas', fields, { tanggalMulai: hariIni(), jenis: 'Perawatan' }, async data => {
    if (!data.judul?.trim()) return 'Nama tugas wajib diisi.';
    if (!data.target) return 'Pilih pegawai atau kelompok penerima tugas.';
    if (data.tenggat && data.tenggat < data.tanggalMulai) return 'Tenggat tidak boleh sebelum tanggal mulai.';
    const [tipe, id] = data.target.split(':');
    const pegawaiId = tipe === 'pegawai' ? id : null;
    const kelompokId = tipe === 'kelompok' ? id : null;
    await DB.add('tugasKelompok', {
      pegawaiId, kelompokId, judul: data.judul.trim(),
      deskripsi: data.deskripsi || '', jenis: data.jenis || 'Perawatan',
      lahanNama: data.lahanNama || '', tanggalMulai: data.tanggalMulai || hariIni(),
      tenggat: data.tenggat || null, status: 'berjalan'
    });
    await catat('Buat tugas', data.judul.trim());
    await DB.init(true);
    return null;
  });
}

function pageKelompok() {
  const groups = DB.all('kelompok').slice().sort((a,b)=>String(a.nama).localeCompare(String(b.nama)));
  const members = DB.all('anggotaKelompok');
  const tasks = DB.all('tugasKelompok').slice().sort((a,b)=>String(b.createdAt||b.tanggalMulai||'').localeCompare(String(a.createdAt||a.tanggalMulai||'')));
  const logs = DB.all('aktivitasTugas').slice().sort((a,b)=>String(b.tanggal||'').localeCompare(String(a.tanggal||'')));
  const mine = isAdmin() ? groups : groups.filter(g => members.some(m => String(m.kelompokId)===String(g.id) && String(m.pegawaiId)===String(me().id)));
  const visibleTasks = tasks.filter(t => isAdmin()
    ? true
    : (String(t.pegawaiId)===String(me().id) || (t.kelompokId && members.some(m=>String(m.kelompokId)===String(t.kelompokId)&&String(m.pegawaiId)===String(me().id)))));
  const groupCards = isAdmin() ? mine.map(g => {
    const gm = members.filter(m=>String(m.kelompokId)===String(g.id));
    return '<section class="card"><div class="page-head"><h3>'+esc(g.nama)+'</h3><button class="btn ghost" data-act="tambahAnggotaKelompok" data-id="'+g.id+'">+ Anggota</button></div><p class="muted">'+esc(g.deskripsi||'')+'</p><h4>Anggota ('+gm.length+')</h4>'+tabel(['Pegawai'],gm.map(m=>[esc(namaPegawai(m.pegawaiId))]),'Belum ada anggota.')+'</section>';
  }).join('') : '';
  const personal = visibleTasks.filter(t=>!t.kelompokId).length;
  const groupTaskCount = visibleTasks.filter(t=>!!t.kelompokId).length;
  const active = visibleTasks.filter(t=>t.status==='berjalan').length;
  const waiting = visibleTasks.filter(t=>t.status==='menunggu_verifikasi'||t.status==='menunggu_persetujuan_lanjut').length;
  const taskRows = visibleTasks.map(t=>barisTugas(t,logs));
  const intro = isAdmin()
    ? 'Buat tugas untuk satu pegawai atau satu kelompok. Kelompok bersifat pilihan, bukan syarat untuk memberi tugas.'
    : 'Semua tugas untuk kamu, baik tugas pribadi maupun tugas kelompok, ditampilkan di sini. Catat progres saat bekerja dan ajukan pemeriksaan setelah selesai.';
  return {
    html: head(isAdmin() ? 'Tugas & Kelompok Kerja' : 'Tugas Saya', isAdmin()
      ? '<button class="btn ghost" data-act="buatKelompok">+ Kelola Kelompok</button><button class="btn" data-act="buatTugasTerpadu">+ Buat Tugas</button>'
      : '') +
      '<p class="muted">'+intro+'</p>'+
      '<div class="stats"><div class="stat"><span>Tugas aktif</span><strong>'+active+'</strong></div><div class="stat"><span>Menunggu pemeriksaan/keputusan</span><strong>'+waiting+'</strong></div><div class="stat"><span>Individu · Kelompok</span><strong>'+personal+' · '+groupTaskCount+'</strong></div></div>'+
      (isAdmin() && waiting ? '<section class="card"><h3>Perlu Tindakan Admin</h3><p class="muted">'+waiting+' tugas memerlukan pemeriksaan atau keputusan Admin. Gunakan tindakan pada baris tugas.</p></section>' : '')+
      '<section class="card"><h3>'+ (isAdmin() ? 'Daftar Semua Tugas' : 'Daftar Tugas') +'</h3>'+tabel(['Tugas','Tindakan','Progres'],taskRows,'Belum ada tugas yang ditetapkan.')+'</section>'+
      (isAdmin() ? '<section class="card"><div class="page-head"><h3>Kelompok Kerja</h3><button class="btn ghost" data-act="buatKelompok">+ Buat Kelompok</button></div><p class="muted">Kelompok hanya digunakan bila Admin memilih penugasan bersama. Tugas individu tidak memerlukan kelompok.</p>'+(groupCards || '<p class="muted">Belum ada kelompok. Admin tetap dapat memberi tugas langsung kepada pegawai.</p>')+'</section>' : (mine.length ? '<section class="card"><h3>Kelompok Saya</h3><p>'+mine.map(g=>esc(g.nama)).join(' · ')+'</p></section>' : ''))
  };
}
async function buatKelompok(){
  if(!isAdmin())return;
  const nama=prompt('Nama kelompok baru:'); if(nama===null)return;
  if(!nama.trim())return alert('Nama kelompok wajib diisi.');
  const deskripsi=prompt('Deskripsi kelompok (boleh kosong):')||'';
  try{await DB.add('kelompok',{nama:nama.trim(),deskripsi,aktif:true});await DB.init(true);render();}
  catch(e){alert('Gagal membuat kelompok: '+e.message);}
}
async function tambahAnggotaKelompok(kelompokId){
  if(!isAdmin())return;
  const g=DB.get('kelompok',kelompokId); if(!g)return;
  const available=DB.all('pegawai').filter(p=>p.statusVerifikasi==='disetujui'&&!DB.all('anggotaKelompok').some(m=>String(m.kelompokId)===String(kelompokId)&&String(m.pegawaiId)===String(p.id)));
  if(!available.length)return alert('Tidak ada pegawai disetujui yang belum menjadi anggota kelompok ini.');
  const choices=available.map(p=>p.id+' — '+p.nama).join('\n');
  const chosen=prompt('Masukkan ID pegawai yang akan ditambahkan:\n'+choices);
  if(chosen===null)return;
  const p=available.find(x=>String(x.id)===chosen.trim());
  if(!p)return alert('ID pegawai tidak valid.');
  try{await DB.add('anggotaKelompok',{kelompokId,pegawaiId:p.id});await DB.init(true);render();}
  catch(e){alert('Gagal menambahkan anggota: '+e.message);}
}
async function simpanTugas({kelompokId=null,pegawaiId=null}={}) {
  if(!isAdmin())return;
  const judul=prompt('Judul tugas:');if(judul===null)return;
  if(!judul.trim())return alert('Judul tugas wajib diisi.');
  const deskripsi=prompt('Instruksi pekerjaan:')||'';
  const jenis=prompt('Jenis pekerjaan (Penanaman/Pemupukan/Perawatan/Panen):','Perawatan')||'Perawatan';
  const lahanNama=prompt('Nama lahan (opsional):')||'';
  const tanggalMulai=prompt('Tanggal mulai (YYYY-MM-DD):',hariIni())||hariIni();
  const tenggat=prompt('Tenggat (YYYY-MM-DD, opsional):')||null;
  if(tenggat&&tenggat<tanggalMulai)return alert('Tenggat tidak boleh sebelum tanggal mulai.');
  try{await DB.add('tugasKelompok',{kelompokId,pegawaiId,judul:judul.trim(),deskripsi,jenis,lahanNama,tanggalMulai,tenggat,status:'berjalan'});await DB.init(true);render();}
  catch(e){alert('Gagal membuat tugas: '+e.message);}
}
async function buatTugasKelompok(kelompokId){return simpanTugas({kelompokId});}
async function buatTugasPerorangan(){
  if(!isAdmin())return;
  const staff=DB.all('pegawai').filter(p=>p.statusVerifikasi==='disetujui');
  if(!staff.length)return alert('Belum ada pegawai aktif.');
  const chosen=prompt('Masukkan ID pegawai penerima tugas:\n'+staff.map(p=>p.id+' — '+p.nama).join('\n'));
  if(chosen===null)return;
  const p=staff.find(x=>String(x.id)===chosen.trim());
  if(!p)return alert('ID pegawai tidak valid.');
  return simpanTugas({pegawaiId:p.id});
}
async function catatAktivitasTugas(tugasId){
  const t=DB.get('tugasKelompok',tugasId);if(!t||t.status!=='berjalan')return;
  const uraian=prompt('Catatan progres pekerjaan hari ini:');if(uraian===null)return;
  if(!uraian.trim())return alert('Catatan kegiatan wajib diisi.');
  const hasil=prompt('Hasil pekerjaan (opsional):')||'';
  const kendala=prompt('Kendala (opsional):')||'';
  try{await DB.add('aktivitasTugas',{tugasId,pegawaiId:me().id,tanggal:hariIni(),uraian:uraian.trim(),hasil,kendala});await DB.init(false);render();}
  catch(e){alert('Gagal menyimpan aktivitas: '+e.message);}
}
async function ajukanSelesaiTugas(tugasId){
  if(!confirm('Ajukan tugas ini untuk diperiksa Admin?'))return;
  try{const {error}=await supabaseClient.rpc('pegawai_ajukan_selesai_tugas_kelompok',{p_tugas_id:tugasId});if(error)throw error;await DB.init(false);render();}
  catch(e){alert('Gagal mengajukan penyelesaian: '+e.message);}
}
async function verifikasiTugas(tugasId,status){
  if(!isAdmin())return;
  let catatan='';
  if(status==='berjalan')catatan=prompt('Catatan untuk melanjutkan atau memperbaiki tugas (opsional):')||'';
  if(status==='ditunda')catatan=prompt('Catatan penjadwalan ulang (opsional):')||'';
  try{await DB.update('tugasKelompok',tugasId,{status,catatanVerifikasi:catatan,diverifikasiOleh:me().authId,diverifikasiAt:new Date().toISOString()});await DB.init(true);render();}
  catch(e){alert('Gagal memproses tugas: '+e.message);}
}

const PAGES = {
  dashboard: pageDashboard,
  lahan: () => ({ html: crud('lahan', cfgLahan()) }),
  tanaman: () => ({ html: crud('tanaman', cfgTanaman()) }),
  penanaman: () => pagePekerjaan('Penanaman'),
  panen: () => pagePekerjaan('Panen'),
  pupuk: pagePupuk,
  pegawai: () => ({ html: crud('pegawai', cfgPegawai()) }),
  kelompok: pageKelompok,
  aktivitas: pageAktivitas,
  absensi: pageAbsensi,
  laporan: pageLaporan,
  kalender: pageKalender,
  notifikasi: pageNotifikasi,
  profil: pageProfil,
  admins: pageAdmins
};

function showLogin() {
  $('#app').classList.add('hidden');
  $('#login-page').classList.remove('hidden');
}

function tampilkanWajibGantiPassword() {
  $('#app').classList.add('hidden');
  const page = $('#login-page');
  page.classList.remove('hidden');
  page.innerHTML = `<div class="login-card">
    <h1>Ganti Password</h1>
    <p class="muted">Password yang diberikan Admin hanya sementara. Buat password baru untuk melanjutkan ke AgriCore.</p>
    <form id="form-password-baru" autocomplete="off">
      <label class="field"><span>Password baru (minimal 8 karakter)</span><input id="password-baru" type="password" minlength="8" autocomplete="new-password" required></label>
      <label class="field"><span>Ulangi password baru</span><input id="password-baru-ulang" type="password" minlength="8" autocomplete="new-password" required></label>
      <p id="password-baru-error" class="form-error" role="alert"></p>
      <button class="btn" type="submit">Simpan Password Baru</button>
    </form>
    <button class="btn ghost small" id="keluar-ganti-password" type="button">Keluar</button>
  </div>`;
  $('#keluar-ganti-password').onclick = async () => {
    await supabaseClient.auth.signOut();
    ACTIVE_USER = null;
    PASSWORD_CHANGE_REQUIRED = false;
    window.location.reload();
  };
  $('#form-password-baru').onsubmit = async e => {
    e.preventDefault();
    const password = $('#password-baru').value;
    const ulang = $('#password-baru-ulang').value;
    const errorBox = $('#password-baru-error');
    const submit = $('#form-password-baru button[type="submit"]');
    errorBox.textContent = '';
    if (password.length < 8) { errorBox.textContent = 'Password minimal 8 karakter.'; return; }
    if (password !== ulang) { errorBox.textContent = 'Ulangi password belum sama.'; return; }
    submit.disabled = true;
    submit.textContent = 'Menyimpan...';
    try {
      const { error } = await supabaseClient.auth.updateUser({
        password,
        data: { must_change_password: false }
      });
      if (error) throw error;
      PASSWORD_CHANGE_REQUIRED = false;
      alert('Password baru berhasil disimpan. Silakan masuk ke AgriCore.');
      window.location.reload();
    } catch (err) {
      errorBox.textContent = err.message || 'Gagal menyimpan password baru.';
      submit.disabled = false;
      submit.textContent = 'Simpan Password Baru';
    }
  };
}

function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#overlay').classList.remove('show');
}

function render() {
  if (PASSWORD_CHANGE_REQUIRED) return tampilkanWajibGantiPassword();
  const u = me();
  if (!u) return showLogin();
  $('#login-page').classList.add('hidden');
  $('#app').classList.remove('hidden');

  let r = location.hash.slice(1) || 'dashboard';
  const m = MENU.find(x => x.id === r);
  if (!m || !menuVisible(m)) r = 'dashboard';

  let page;
  try {
    page = PAGES[r]();
  } catch (error) {
    console.error('Gagal merender halaman ' + r + ':', error);
    if (r === 'pupuk') {
      page = { html: head('Gudang') + '<div class="card"><h3>Gudang gagal dimuat</h3><p>Pesan kesalahan: ' + esc(error?.message || error) + '</p><p class="muted">Kirimkan pesan ini agar penyebabnya bisa diperbaiki tanpa mengubah data stok.</p></div>' };
    } else {
      throw error;
    }
  }
  $('#content').innerHTML = page.html;
  if (page.after) page.after();

  $('#page-title').textContent = menuLabel(MENU.find(x => x.id === r));
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
      if (tbl === 'pegawai' && !isAdminUtama()) return alert('Hanya Admin Utama yang boleh menghapus data karyawan.');
      if (!isAdmin()) return alert('Hanya administrator yang boleh menghapus data.');
      if (!row || !confirm('Hapus data ini? Tindakan ini tidak bisa dibatalkan.')) return;
      DB.remove(tbl, id).then(async () => { await catat(`Hapus ${cfg.judul}`, cfg.nama(row)); await DB.init(true); render(); }).catch(err => alert(err.message));
      return;
    }
    case 'detailBarang': return detailBarang(id);
    case 'transaksiMasuk': return openTransaksi({barangId:id,jenis:'Masuk'});
    case 'transaksiKeluar': return openTransaksi({barangId:id,jenis:'Keluar'});
    case 'hapusLaporan': return hapusLaporanAdmin(id);
    case 'hapusRiwayat': return hapusRiwayatAdmin(b.dataset.tbl,id);
    case 'detailLahan': return detailLahan(id);
    case 'detailPegawai': return detailPegawai(id);
    case 'riwayat': return riwayatPegawai(id);
    case 'resetPasswordPegawai': return resetPasswordPegawai(id);
    case 'approveAdminApplication': return prosesPermohonanAdmin(b.dataset.id, 'approve');
    case 'rejectAdminApplication': return prosesPermohonanAdmin(b.dataset.id, 'reject');
    case 'resetAdmin': return kelolaAdminKedua('reset', b.dataset.id, b.dataset.nama);
    case 'hapusAdmin': return kelolaAdminKedua('delete', b.dataset.id, b.dataset.nama);
    case 'salinPassword': {
      const password = b.dataset.password || '';
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(password).then(() => alert('Password berhasil disalin.')).catch(() => prompt('Salin password ini:', password));
      } else {
        prompt('Salin password ini:', password);
      }
      return;
    }
    case 'setujuiPegawai': return prosesVerifikasiPegawai(id, 'disetujui');
    case 'tolakPegawai': return prosesVerifikasiPegawai(id, 'ditolak');
    case 'transaksi': return openTransaksi();
    case 'buatKelompok': return buatKelompok();
    case 'tambahAnggotaKelompok': return tambahAnggotaKelompok(Number(b.dataset.id));
    case 'buatTugasTerpadu': return bukaFormTugas();
    case 'buatTugasKelompok': return buatTugasKelompok(Number(b.dataset.id));
    case 'buatTugasPerorangan': return buatTugasPerorangan();
    case 'catatAktivitasTugas': return catatAktivitasTugas(Number(b.dataset.id));
    case 'ajukanSelesaiTugas': return ajukanSelesaiTugas(Number(b.dataset.id));
    case 'verifikasiTugas': return verifikasiTugas(Number(b.dataset.id), b.dataset.status);
    case 'lapor': return openLapor();
    case 'laporJenis': return openLapor(b.dataset.jenis);
    case 'editDraftLaporan': { const d=DB.get('laporanDraft',id); return d ? openLapor(d.data?.jenis || '',id) : alert('Draft tidak ditemukan.'); }
    case 'kirimDraftLaporan': { const d=DB.get('laporanDraft',id); return d ? openLapor(d.data?.jenis || '',id) : alert('Draft tidak ditemukan.'); }
    case 'hapusDraftLaporan': return (async()=>{ if(!confirm('Hapus draft ini?')) return; try { await DB.remove('laporanDraft',id); await DB.init(false); render(); } catch(e) { alert(e.message); } })();
    case 'absenMasuk': return lakukanAbsensi('masuk');
    case 'absenPulang': return lakukanAbsensi('pulang');
    case 'ajukanIzin': return ajukanIzinPegawai();
    case 'prosesIzin': return prosesIzinPegawai(id,b.dataset.status);
    case 'lihatBuktiIzin': return lihatBuktiIzin(id);
    case 'lihatFotoAbsensi': return lihatFotoAbsensi(id,b.dataset.kind);
    case 'detailRiwayatAbsensi': return detailRiwayatAbsensi(b.dataset.id);
    case 'arsipAbsensiYear': ATT_ARCHIVE_YEAR=b.dataset.value; ATT_ARCHIVE_MONTH=''; ATT_ARCHIVE_DAY=''; return render();
    case 'arsipAbsensiMonth': ATT_ARCHIVE_MONTH=b.dataset.value; ATT_ARCHIVE_DAY=''; return render();
    case 'arsipAbsensiDay': ATT_ARCHIVE_DAY=b.dataset.value; return render();
    case 'arsipAbsensiBackYear': ATT_ARCHIVE_YEAR=''; ATT_ARCHIVE_MONTH=''; ATT_ARCHIVE_DAY=''; return render();
    case 'arsipAbsensiBackMonth': ATT_ARCHIVE_MONTH=''; ATT_ARCHIVE_DAY=''; return render();
    case 'arsipAbsensiBackDay': ATT_ARCHIVE_DAY=''; return render();
    case 'detailLaporan': return detailLaporan(id);
    case 'statusLaporan': {
      const laporan = DB.get('laporan', id);
      if (!laporan) { alert('Laporan tidak ditemukan.'); return; }
      if (laporan.status === 'diterima') { alert('Laporan ini sudah diterima. Status dikunci agar stok dan riwayat gudang tidak berubah dua kali.'); return; }
      if (b.dataset.status !== 'diterima') return;
      DB.update('laporan', id, { status: 'diterima' }).then(() => {
        catat('Ubah status laporan', 'Diterima');
        return DB.init(true);
      }).then(() => render()).catch(err => alert('Laporan belum dapat diterima: ' + err.message));
      return;
    }
    case 'kal': geserKal(Number(b.dataset.d)); return render();
    case 'csv': return unduhCSV(LAP_DATA);
    case 'cetak': return window.print();
    case 'resetLap': LAP = { ...LAP_DEFAULT }; return render();
  }
}

let AUTH_LOGIN_ROLE = 'pegawai';
let PASSWORD_RECOVERY_MODE = false;

async function login(e) {
  e.preventDefault();
  const email = $('#l-user').value.trim(), password = $('#l-pass').value;
  const errBox = $('#l-err');
  const submit = $('#login-form button[type="submit"]');
  errBox.textContent = '';
  submit.disabled = true; submit.textContent = 'Memeriksa...';
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    try {
      if (data.user.user_metadata?.must_change_password === true) {
        PASSWORD_CHANGE_REQUIRED = true;
        render();
        return;
      }
      await muatPenggunaAuth(data.user);
      const actualRole = isAdmin() ? 'admin' : 'pegawai';
      if (actualRole !== AUTH_LOGIN_ROLE) {
        await supabaseClient.auth.signOut();
        ACTIVE_USER = null;
        throw new Error(AUTH_LOGIN_ROLE === 'admin'
          ? 'Akun ini bukan akun administrator. Pilih Login Pegawai.'
          : 'Akun ini bukan akun pegawai. Pilih Login Admin.');
      }
      await DB.init(isAdmin());
    } catch (e) {
      if (ACTIVE_USER) { await supabaseClient.auth.signOut(); ACTIVE_USER = null; }
      throw e;
    }
    $('#login-form').reset();
    location.hash = '#dashboard';
    render();
  } catch (err) {
    errBox.textContent = err.message || 'Login gagal. Periksa email dan password.';
  } finally {
    submit.disabled = false; submit.textContent = 'Masuk';
  }
}

function pilihJenisLogin(role) {
  AUTH_LOGIN_ROLE = role;
  $('#login-admin').classList.toggle('active', role === 'admin');
  $('#login-pegawai').classList.toggle('active', role === 'pegawai');
  $('#login-title').textContent = role === 'admin' ? 'Login Administrator' : 'Login Pegawai';
  $('#login-description').textContent = role === 'admin'
    ? 'Masuk menggunakan email dan password administrator.'
    : 'Masuk menggunakan email dan password akun pegawai.';
  $('#register-access').classList.remove('hidden');
  $('#l-err').textContent = '';
}
window.pilihJenisLogin = pilihJenisLogin;

async function kirimLinkResetPassword(e) {
  e.preventDefault();
  const email = $('#forgot-email').value.trim();
  const box = $('#forgot-message');
  const btn = $('#forgot-form button[type="submit"]');
  box.textContent = '';
  if (!email) { box.textContent = 'Masukkan email akun terlebih dahulu.'; return; }
  btn.disabled = true; btn.textContent = 'Mengirim...';
  try {
    const redirectTo = location.origin + location.pathname + '?reset-password=1';
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    box.textContent = 'Jika email terdaftar, tautan pemulihan akan dikirim. Periksa kotak masuk dan folder spam.';
  } catch (err) {
    box.textContent = err.message || 'Permintaan pemulihan gagal. Coba lagi.';
  } finally { btn.disabled = false; btn.textContent = 'Kirim Tautan'; }
}

function tampilkanFormPasswordPemulihan() {
  PASSWORD_RECOVERY_MODE = true;
  $('#app').classList.add('hidden');
  const page = $('#login-page');
  page.classList.remove('hidden');
  page.innerHTML = '<div class="login-card"><h1>Buat Password Baru</h1><p class="muted">Masukkan password baru untuk akun SIMTANI Anda.</p>' +
    '<form id="recovery-form" class="auth-form"><label class="field"><span>Password baru (minimal 8 karakter)</span><input id="recovery-pass" type="password" minlength="8" autocomplete="new-password" required></label>' +
    '<label class="field"><span>Ulangi password baru</span><input id="recovery-pass2" type="password" minlength="8" autocomplete="new-password" required></label>' +
    '<p id="recovery-error" class="form-error" role="alert"></p><button class="btn" type="submit">Simpan Password Baru</button></form></div>';
  $('#recovery-form').onsubmit = async e => {
    e.preventDefault();
    const p = $('#recovery-pass').value, p2 = $('#recovery-pass2').value;
    const box = $('#recovery-error'), btn = $('#recovery-form button[type="submit"]');
    box.textContent = '';
    if (p.length < 8 || p !== p2) { box.textContent = p.length < 8 ? 'Password minimal 8 karakter.' : 'Konfirmasi password tidak sama.'; return; }
    btn.disabled = true; btn.textContent = 'Menyimpan...';
    try {
      const { error } = await supabaseClient.auth.updateUser({ password: p, data: { must_change_password: false } });
      if (error) throw error;
      PASSWORD_RECOVERY_MODE = false;
      await supabaseClient.auth.signOut();
      ACTIVE_USER = null;
      alert('Password berhasil diperbarui. Silakan login kembali.');
      location.href = location.origin + location.pathname;
    } catch (err) { box.textContent = err.message || 'Password gagal diperbarui.'; btn.disabled = false; btn.textContent = 'Simpan Password Baru'; }
  };
}

function setAuthMode(mode) {
  $('#auth-login-area').classList.toggle('hidden', mode !== 'login');
  $('#register-area').classList.toggle('hidden', mode !== 'register');
  $('#register-admin-area').classList.toggle('hidden', mode !== 'admin-register');
  $('#forgot-area').classList.toggle('hidden', mode !== 'forgot');
  $('#r-msg').textContent = '';
  $('#ra-msg').textContent = '';
  $('#r-msg').classList.remove('error');
  $('#ra-msg').classList.remove('error');
}

async function daftarPegawai(e) {
  e.preventDefault();
  const nama = $('#r-nama').value.trim();
  const idPegawai = $('#r-id').value.trim();
  const email = $('#r-email').value.trim();
  const username = $('#r-username').value.trim().toLowerCase();
  const jabatan = $('#r-jabatan').value.trim();
  const msg = $('#r-msg');
  // Samakan format nomor agar 08xxx dan +62xxx dianggap nomor yang sama.
  let telepon = $('#r-telepon').value.replace(/[^0-9]/g, '');
  if (telepon.startsWith('0')) telepon = '62' + telepon.slice(1);
  else if (telepon.startsWith('8')) telepon = '62' + telepon;
  if (!/^62[0-9]{8,13}$/.test(telepon)) {
    msg.textContent = 'Nomor WhatsApp tidak valid. Gunakan nomor Indonesia yang aktif.';
    msg.classList.add('error');
    return;
  }
  const alamat = $('#r-alamat').value.trim();
  const password = $('#r-pass').value;
  const ulangi = $('#r-pass2').value;
  msg.classList.remove('error');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    msg.textContent = 'Username harus 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau strip.';
    msg.classList.add('error');
    return;
  }
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
      options: { data: { nama, username, id_pegawai: idPegawai, jabatan, telepon, alamat } }
    });
    if (error) throw error;
    if (!data.user) throw new Error('Pendaftaran belum berhasil. Silakan coba lagi.');
    $('#register-form').reset();
    msg.textContent = data.session
      ? 'Pendaftaran berhasil. Akun menunggu persetujuan admin sebelum dapat digunakan.'
      : 'Pendaftaran dibuat, tetapi konfirmasi email Supabase masih aktif. Admin perlu menonaktifkan konfirmasi email agar alur tanpa OTP dapat digunakan.';
  } catch (err) {
    const detail = String(err.message || '');
    if (/already registered|already exists|duplicate key|unique constraint|23505/i.test(detail)) {
      msg.textContent = /email|user/i.test(detail)
        ? 'Email tersebut sudah terdaftar. Gunakan email lain.'
        : 'ID pegawai atau nomor WhatsApp tersebut sudah digunakan. Periksa kembali datanya.';
    } else {
      msg.textContent = detail || 'Pendaftaran gagal. Periksa data dan koneksi, lalu coba lagi.';
    }
    msg.classList.add('error');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Kirim Pendaftaran';
  }
}

async function daftarAdmin(e) {
  e.preventDefault();
  const nama = $('#ra-nama').value.trim();
  const username = $('#ra-username').value.trim().toLowerCase();
  const email = $('#ra-email').value.trim();
  const password = $('#ra-pass').value;
  const ulangi = $('#ra-pass2').value;
  const msg = $('#ra-msg');
  msg.classList.remove('error');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    msg.textContent = 'Username harus 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau strip.';
    msg.classList.add('error'); return;
  }
  if (password.length < 8 || password !== ulangi) {
    msg.textContent = password.length < 8 ? 'Password minimal 8 karakter.' : 'Konfirmasi password tidak sama.';
    msg.classList.add('error'); return;
  }
  const submit = $('#register-admin-form button[type="submit"]');
  submit.disabled = true; submit.textContent = 'Mengirim...';
  msg.textContent = 'Mengirim permohonan...';
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email, password,
      options: { data: { nama, username, requested_role: 'admin' } }
    });
    if (error) throw error;
    if (!data.user) throw new Error('Permohonan belum berhasil dibuat.');
    $('#register-admin-form').reset();
    msg.textContent = data.session
      ? 'Permohonan terkirim. Tunggu persetujuan Admin Utama sebelum login.'
      : 'Akun dibuat. Konfirmasi email masih aktif; periksa email sebelum menunggu verifikasi Admin Utama.';
  } catch (err) {
    msg.textContent = err.message || 'Permohonan gagal dikirim.';
    msg.classList.add('error');
  } finally {
    submit.disabled = false; submit.textContent = 'Kirim Permohonan Admin';
  }
}

async function init() {
  $('#login-form').onsubmit = login;
  $('#register-form').onsubmit = daftarPegawai;
  $('#register-admin-form').onsubmit = daftarAdmin;
  $('#login-admin').onclick = () => pilihJenisLogin('admin');
  $('#login-pegawai').onclick = () => pilihJenisLogin('pegawai');
  $('#show-register').onclick = () => setAuthMode('register');
  $('#show-admin-register').onclick = () => setAuthMode('admin-register');
  $('#back-to-login').onclick = () => setAuthMode('login');
  $('#back-admin-login').onclick = () => setAuthMode('login');
  $('#forgot-form').onsubmit = kirimLinkResetPassword;
  $('#show-forgot').onclick = () => {
    setAuthMode('forgot');
    $('#forgot-email').value = $('#l-user').value.trim();
    $('#forgot-message').textContent = '';
  };
  $('#back-login').onclick = () => {
    setAuthMode('login');
  };
  $('#logout').onclick = async () => {
    try { await supabaseClient.auth.signOut(); } catch (e) { console.error(e); }
    ACTIVE_USER = null;
    PASSWORD_CHANGE_REQUIRED = false;
    location.hash = '';
    render();
  };
  $('#menu-btn').onclick = () => {
    $('#sidebar').classList.add('open');
    $('#overlay').classList.add('show');
  };
  $('#overlay').onclick = closeSidebar;
  $('#content').addEventListener('click', aksiKlik);
  // Modal detail berada di luar #content; delegasikan klik tombol aksi di dalam modal.
  $('#modal').addEventListener('click', aksiKlik);
  $('#content').addEventListener('change', e => {
    const attFilter = e.target.dataset.attHistoryFilter;
    if (attFilter === 'year') { ATT_HISTORY_YEAR = e.target.value; ATT_HISTORY_MONTH = ''; render(); return; }
    if (attFilter === 'month') { ATT_HISTORY_MONTH = e.target.value; render(); return; }
    const k = e.target.dataset.lap;
    if (!k) return;
    LAP[k] = e.target.value;
    render();
  });
  window.addEventListener('hashchange', render);
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') tampilkanFormPasswordPemulihan();
  });
  if (new URLSearchParams(location.search).get('reset-password') === '1') {
    const { data: { session: recoverySession } } = await supabaseClient.auth.getSession();
    if (recoverySession) { tampilkanFormPasswordPemulihan(); return; }
  }
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      try {
        if (session.user.user_metadata?.must_change_password === true) PASSWORD_CHANGE_REQUIRED = true;
        else { await muatPenggunaAuth(session.user); await DB.init(isAdmin()); }
      }
      catch (e) { await supabaseClient.auth.signOut(); ACTIVE_USER = null; $('#l-err').textContent = e.message; }
    }
  } catch (e) { console.error('Gagal memulihkan sesi Supabase:', e); }
  render();
}

init();
