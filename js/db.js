/* ===== AgriCore: penyimpanan Supabase ===== */
const SUPABASE_URL = 'https://bhbkvsgvogdsfvqqzcpy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FvWUHbnX5iM5ifvvalo5oA_ap1E6QoN';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLES = {
  tanaman: 'tanaman', penanaman: 'penanaman', panen: 'panen', barang: 'barang',
  transaksi: 'transaksi', pegawai: 'pegawai', laporan: 'laporan', log: 'log_aktivitas'
};
const DB = {
  d: Object.fromEntries(Object.keys(TABLES).map(k => [k, []])),
  ready: false,
  toDb(row) {
    const out = {};
    for (const [k, v] of Object.entries(row || {})) {
      if (k === 'id' && (v == null || String(v).startsWith('tmp-'))) continue;
      out[k.replace(/[A-Z]/g, c => '_' + c.toLowerCase())] = v;
    }
    return out;
  },
  fromDb(row) {
    const out = {};
    for (const [k, v] of Object.entries(row || {})) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
    return out;
  },
  async init(isAdmin = false) {
    this.d = Object.fromEntries(Object.keys(TABLES).map(k => [k, []]));
    const names = Object.keys(TABLES).filter(k => isAdmin || k !== 'log');
    const results = await Promise.all(names.map(async key => {
      const { data, error } = await supabaseClient.from(TABLES[key]).select('*');
      if (error) throw new Error(`Gagal memuat ${TABLES[key]}: ${error.message}`);
      this.d[key] = (data || []).map(r => this.fromDb(r));
    }));
    this.ready = true;
    return results;
  },
  all(tabel) { return this.d[tabel] || []; },
  get(tabel, id) { return this.all(tabel).find(x => String(x.id) === String(id)); },
  async add(tabel, obj) {
    const { data, error } = await supabaseClient.from(TABLES[tabel]).insert(this.toDb(obj)).select('*').single();
    if (error) throw new Error(`Gagal menyimpan ${tabel}: ${error.message}`);
    const row = this.fromDb(data); this.d[tabel].push(row); return row;
  },
  async update(tabel, id, obj) {
    const { data, error } = await supabaseClient.from(TABLES[tabel]).update(this.toDb(obj)).eq('id', id).select('*').single();
    if (error) throw new Error(`Gagal memperbarui ${tabel}: ${error.message}`);
    const row = this.fromDb(data), i = this.d[tabel].findIndex(x => String(x.id) === String(id));
    if (i >= 0) this.d[tabel][i] = row; else this.d[tabel].push(row);
    return row;
  },
  async remove(tabel, id) {
    const { error } = await supabaseClient.from(TABLES[tabel]).delete().eq('id', id);
    if (error) throw new Error(`Gagal menghapus ${tabel}: ${error.message}`);
    this.d[tabel] = this.d[tabel].filter(x => String(x.id) !== String(id));
  },
  async simpan() { return true; },
  async log(aktorKey, aktorNama, aksi, entitas) {
    // Log aktivitas hanya dapat dibaca/ditulis admin sesuai kebijakan RLS saat ini.
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const { data: profil } = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profil?.role !== 'admin') return;
    const { data, error } = await supabaseClient.from('log_aktivitas').insert({
      waktu: new Date().toISOString(), aktor_key: aktorKey, aktor_nama: aktorNama, aksi, entitas
    }).select('*').single();
    if (error) { console.error('Gagal mencatat aktivitas:', error.message); return; }
    this.d.log.unshift(this.fromDb(data));
  }
};

// Helper tanggal
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = s => new Date(s + 'T00:00:00');
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
const selisih = (a, b) => Math.round((parse(a) - parse(b)) / 86400000);
const hariIni = () => fmt(new Date());
const hariOffset = n => addDays(hariIni(), n);
