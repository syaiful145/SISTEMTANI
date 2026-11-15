/* SIMTANI attendance extension */
(() => {
  const $a = (s) => document.querySelector(s);
  const escA = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const timeA = (v) => v ? new Date(v).toLocaleString('id-ID') : '-';
  const dateA = (v) => v ? new Date(v + 'T00:00:00').toLocaleDateString('id-ID') : '-';
  const dayA = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const scheduleA = () => DB.all('pengaturanAbsensi')[0] || {jamMasuk:'08:00',jamPulang:'17:00',toleransiTerlambat:0};
  const approvedA = (id,day) => DB.all('izin').some(x=>String(x.pegawaiId)===String(id)&&x.status==='disetujui'&&x.tanggalMulai<=day&&x.tanggalSelesai>=day);
  const statusA = (row, sched) => {
    if (!row || !row.masukAt) return 'Tidak hadir';
    const d=new Date(row.masukAt), m=d.getHours()*60+d.getMinutes();
    const p=String(sched.jamMasuk||'08:00').split(':').map(Number);
    return m > p[0]*60+p[1]+Number(sched.toleransiTerlambat||0) ? 'Terlambat' : 'Hadir';
  };
  const tagA = (s) => '<span class="tag '+(s==='Tidak hadir'?'red':s==='Terlambat'?'amber':s==='Izin'?'blue':'green')+'">'+escA(s)+'</span>';
  async function refreshA(){ await DB.init(isAdmin()); render(); }
  function pageA(){
    const u=me(), today=dayA(), sched=scheduleA(), leaves=DB.all('izin');
    if(u.tipe==='pegawai'){
      const own=DB.all('absensi').filter(x=>String(x.pegawaiId)===String(u.id)).sort((a,b)=>b.tanggal.localeCompare(a.tanggal));
      const r=own.find(x=>x.tanggal===today);
      const mine=leaves.filter(x=>String(x.pegawaiId)===String(u.id)).sort((a,b)=>b.id-a.id);
      const state=approvedA(u.id,today)?'Izin':statusA(r,sched);
      const action=!r?'<button class="btn" data-act="att-photo-in">Absen Masuk · Foto</button>':!r.pulangAt?'<button class="btn" data-act="att-photo-out">Absen Pulang · Foto</button>':'<span class="tag green">Absensi selesai</span>';
      return {html:head('Absensi Pegawai',action)+'<section class="card"><h3>Jadwal Kerja</h3><p>Masuk <b>'+escA(String(sched.jamMasuk).slice(0,5))+'</b> · Pulang <b>'+escA(String(sched.jamPulang).slice(0,5))+'</b></p><p>Toleransi terlambat: '+Number(sched.toleransiTerlambat||0)+' menit</p><p>Status hari ini: '+tagA(state)+'</p><button class="btn ghost" data-act="att-leave">+ Ajukan Izin / Sakit</button></section>'+
      (r?'<section class="card"><h3>Absensi Hari Ini</h3><p>Masuk: '+timeA(r.masukAt)+'</p><p>Pulang: '+timeA(r.pulangAt)+'</p><p>Lokasi masuk: '+escA(r.masukAlamat||'-')+'</p><p>Lokasi pulang: '+escA(r.pulangAlamat||'-')+'</p></section>':'<section class="card"><p>Belum ada catatan absensi hari ini.</p></section>')+
      (own.length?'<h3>Riwayat Absensi</h3>'+historyTreeA(own):'')+
      '<h3>Riwayat Pengajuan Izin</h3>'+tabel(['Tanggal','Jenis','Alasan','Status','Catatan Admin'],mine.map(x=>[dateA(x.tanggalMulai)+' – '+dateA(x.tanggalSelesai),escA(x.jenis),escA(x.alasan),tagA(x.status),escA(x.catatanAdmin||'-')]),'Belum ada pengajuan izin.')};
    }
    const staff=DB.all('pegawai').filter(x=>x.statusVerifikasi==='disetujui'), todayRows=DB.all('absensi').filter(x=>x.tanggal===today);
    const approved=leaves.filter(x=>x.status==='disetujui'&&x.tanggalMulai<=today&&x.tanggalSelesai>=today);
    const pending=leaves.filter(x=>x.status==='menunggu');
    const attended=todayRows.filter(x=>statusA(x,sched)==='Hadir').length, late=todayRows.filter(x=>statusA(x,sched)==='Terlambat').length;
    const absent=staff.filter(p=>!todayRows.some(x=>String(x.pegawaiId)===String(p.id))&&!approvedA(p.id,today)).length;
    return {html:head('Rekap Absensi Pegawai','<button class="btn" data-act="att-schedule">⚙ Atur Jam Kerja</button>')+
      '<section class="card"><h3>Jadwal Kerja</h3><p>Masuk <b>'+escA(String(sched.jamMasuk).slice(0,5))+'</b> · Pulang <b>'+escA(String(sched.jamPulang).slice(0,5))+'</b> · Toleransi '+Number(sched.toleransiTerlambat||0)+' menit</p>'+(isAdmin()?'<form id="att-schedule-form" class="form-grid"><label class="field"><span>Jam masuk</span><input type="time" name="jamMasuk" value="'+escA(String(sched.jamMasuk).slice(0,5))+'" required></label><label class="field"><span>Jam pulang</span><input type="time" name="jamPulang" value="'+escA(String(sched.jamPulang).slice(0,5))+'" required></label><label class="field"><span>Toleransi terlambat (menit)</span><input type="number" name="toleransiTerlambat" min="0" max="180" value="'+Number(sched.toleransiTerlambat||0)+'" required></label><div class="form-actions"><button class="btn" type="submit">Simpan Jadwal</button></div><p id="att-schedule-msg" class="form-error full"></p></form>':'')+'</section>'+
      '<section class="stats-grid"><div class="stat-card"><span>Hadir</span><strong>'+attended+'</strong></div><div class="stat-card"><span>Terlambat</span><strong>'+late+'</strong></div><div class="stat-card"><span>Izin</span><strong>'+approved.length+'</strong></div><div class="stat-card"><span>Tidak hadir</span><strong>'+absent+'</strong></div></section>'+
      '<h3>Rekap Hari Ini</h3>'+tabel(['Pegawai','Status','Masuk','Pulang','Lokasi masuk','Lokasi pulang'],staff.map(p=>{const r=todayRows.find(x=>String(x.pegawaiId)===String(p.id));const st=r?statusA(r,sched):approvedA(p.id,today)?'Izin':'Tidak hadir';return [escA(p.nama),tagA(st),timeA(r&&r.masukAt),timeA(r&&r.pulangAt),escA(r&&r.masukAlamat||'-'),escA(r&&r.pulangAlamat||'-')];}),'Belum ada pegawai.')+
      '<h3>Pengajuan Izin Menunggu</h3>'+tabel(['Pegawai','Tanggal','Jenis','Alasan','Aksi'],pending.map(x=>[escA(namaPegawai(x.pegawaiId)),dateA(x.tanggalMulai)+' – '+dateA(x.tanggalSelesai),escA(x.jenis),escA(x.alasan),'<button class="btn tiny" data-act="att-review" data-id="'+x.id+'">Periksa</button>']),'Tidak ada pengajuan menunggu.')+
      (DB.all('absensi').length?'<h3>Arsip Riwayat Absensi</h3>'+historyTreeA(DB.all('absensi'),true):'')};
  }
  async function saveScheduleA(form){
    if(!isAdmin())return;
    const data=new FormData(form), masuk=String(data.get('jamMasuk')||''), pulang=String(data.get('jamPulang')||''), tol=Number(data.get('toleransiTerlambat'));
    const msg=form.querySelector('#att-schedule-msg');
    if(!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(masuk)||!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(pulang)||!Number.isInteger(tol)||tol<0||tol>180){if(msg)msg.textContent='Periksa kembali jam dan toleransi.';return;}
    const btn=form.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='Menyimpan...';
    const {data:row,error}=await supabaseClient.from('pengaturan_absensi').upsert({id:1,jam_masuk:masuk,jam_pulang:pulang,toleransi_terlambat:tol,updated_at:new Date().toISOString()}).select('*').single();
    if(error){if(msg)msg.textContent='Gagal menyimpan: '+error.message;btn.disabled=false;btn.textContent='Simpan Jadwal';return;}
    DB.d.pengaturanAbsensi=[DB.fromDb(row)];render();
  }
  function pageGudangAttendanceA(){
    const seeds=DB.all('barang').filter(x=>String(x.kategori||'').toLowerCase()==='bibit');
    return {html:head('Stok Benih')+'<p class="muted">Pegawai hanya melihat stok. Catat jumlah benih yang digunakan melalui formulir Laporan Harian agar otomatis tercatat pada riwayat pekerjaan.</p>'+(seeds.length?seeds.map(x=>'<section class="card"><h3>'+escA(x.nama)+'</h3><p><b>Sisa stok: '+Number(x.stok||0).toLocaleString('id-ID')+' '+escA(x.satuan||'')+'</b></p></section>').join(''):'<section class="card"><p>Belum ada stok benih yang tersedia.</p></section>')};
  }
  async function useSeedA(form){
    const id=form.dataset.barangId, jumlah=Number(form.elements.jumlah.value), keterangan=form.elements.keterangan.value.trim(), msg=form.querySelector('.form-error'), btn=form.querySelector('button[type="submit"]');
    const item=DB.all('barang').find(x=>String(x.id)===String(id));
    if(!item||!Number.isInteger(jumlah)||jumlah<=0||jumlah>Number(item.stok)){msg.textContent='Jumlah tidak valid atau stok tidak mencukupi.';return;}
    btn.disabled=true;btn.textContent='Menyimpan...';
    const {data,error}=await supabaseClient.rpc('pegawai_gunakan_benih',{p_barang_id:Number(id),p_jumlah:jumlah,p_keterangan:keterangan||null});
    if(error){msg.textContent='Gagal mencatat penggunaan: '+error.message;btn.disabled=false;btn.textContent='Catat Penggunaan';return;}
    await DB.init(false);render();
  }
  let streamA=null;
  function stopA(){if(streamA)streamA.getTracks().forEach(t=>t.stop());streamA=null;}
  function photoA(kind){
    const u=me(),box=$('#modal');let blob=null,gps=null,stamp=null;
    box.innerHTML='<div class="modal-box"><div class="modal-head"><h3>Foto Absensi '+(kind==='masuk'?'Masuk':'Pulang')+'</h3><button type="button" class="icon-btn" data-close-att>✕</button></div><video id="att-video" autoplay playsinline muted style="width:100%;max-height:320px;background:#111;border-radius:12px"></video><canvas id="att-canvas" style="display:none;width:100%;max-height:320px"></canvas><p id="att-info" class="muted">Buka kamera untuk mulai.</p><p id="att-error" class="form-error"></p><div class="form-actions"><button type="button" class="btn ghost" id="att-open">Buka Kamera</button><button type="button" class="btn" id="att-shot" disabled>Ambil Foto</button><button type="button" class="btn" id="att-send" disabled>Kirim Absensi</button></div></div>';
    box.classList.remove('hidden');const close=()=>{stopA();tutupModal();};box.querySelector('[data-close-att]').onclick=close;
    const video=$('#att-video'),canvas=$('#att-canvas'),info=$('#att-info'),err=$('#att-error');
    $('#att-open').onclick=async()=>{try{if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw Error('Kamera tidak didukung browser ini.');stopA();streamA=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});video.srcObject=streamA;$('#att-shot').disabled=false;}catch(e){err.textContent=e.message;}};
    $('#att-shot').onclick=()=>{if(!video.videoWidth)return;$('#att-shot').disabled=true;info.textContent='Mengambil lokasi GPS...';if(!navigator.geolocation){err.textContent='GPS tidak didukung.';return;}navigator.geolocation.getCurrentPosition(async pos=>{try{gps={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy};gps.place=await namaLokasiGPS(gps.lat,gps.lon);stamp=new Date();canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0);const h=canvas.height,w=canvas.width,band=Math.max(150,Math.round(h*.28));ctx.fillStyle='rgba(0,0,0,.75)';ctx.fillRect(0,h-band,w,band);ctx.fillStyle='#fff';ctx.font='bold '+Math.max(18,Math.round(w/42))+'px sans-serif';ctx.fillText(stamp.toLocaleString('id-ID'),16,h-band+32);ctx.font=Math.max(14,Math.round(w/55))+'px sans-serif';ctx.fillText(gps.place.slice(0,100),16,h-band+65);ctx.fillText('GPS '+gps.lat.toFixed(6)+', '+gps.lon.toFixed(6)+' ±'+Math.round(gps.accuracy)+'m',16,h-16);canvas.toBlob(b=>{blob=b;video.style.display='none';canvas.style.display='block';stopA();$('#att-send').disabled=!b;info.textContent='Foto siap dengan waktu dan lokasi.';},'image/jpeg',.88);}catch(e){err.textContent=e.message;$('#att-shot').disabled=false;}},e=>{err.textContent='Lokasi gagal: '+e.message;$('#att-shot').disabled=false;},{enableHighAccuracy:true,timeout:20000,maximumAge:0});};
    $('#att-send').onclick=async()=>{if(!blob||!gps||!stamp)return;const btn=$('#att-send');btn.disabled=true;btn.textContent='Mengirim...';const path=u.authId+'/absensi-'+kind+'-'+Date.now()+'.jpg';try{const up=await supabaseClient.storage.from('absensi-bukti').upload(path,blob,{contentType:'image/jpeg'});if(up.error)throw up.error;const fields=kind==='masuk'?{masukAt:stamp.toISOString(),masukLat:gps.lat,masukLon:gps.lon,masukAlamat:gps.place,masukFotoPath:path,masukFotoCapturedAt:stamp.toISOString(),masukAccuracy:gps.accuracy}:{pulangAt:stamp.toISOString(),pulangLat:gps.lat,pulangLon:gps.lon,pulangAlamat:gps.place,pulangFotoPath:path,pulangFotoCapturedAt:stamp.toISOString(),pulangAccuracy:gps.accuracy};const existing=DB.all('absensi').find(x=>String(x.pegawaiId)===String(u.id)&&x.tanggal===dayA());try{if(kind==='masuk'){if(existing)throw Error('Anda sudah absen masuk hari ini.');await DB.add('absensi',Object.assign({pegawaiId:u.id,authUserId:u.authId,tanggal:dayA()},fields));}else{if(!existing||existing.pulangAt)throw Error('Data absen masuk tidak ditemukan atau sudah absen pulang.');await DB.update('absensi',existing.id,fields);}}catch(e){await supabaseClient.storage.from('absensi-bukti').remove([path]);throw e;}close();await refreshA();}catch(e){err.textContent='Absensi gagal: '+e.message;btn.disabled=false;btn.textContent='Kirim Absensi';}};
  }
  async function leaveA(){
    const u=me();if(u.tipe!=='pegawai')return;
    const start=prompt('Tanggal mulai izin (YYYY-MM-DD)',dayA());if(!start)return;
    const end=prompt('Tanggal selesai izin (YYYY-MM-DD)',start);if(!end)return;
    const kind=prompt('Jenis: Izin atau Sakit','Izin');if(!kind)return;
    const reason=prompt('Alasan izin');if(!reason)return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||! /^\d{4}-\d{2}-\d{2}$/.test(end)||end<start||!['izin','sakit'].includes(kind.toLowerCase()))return alert('Tanggal atau jenis izin tidak valid.');
    const input=document.createElement('input');input.type='file';input.accept='image/*';input.capture='environment';input.onchange=async()=>{const file=input.files&&input.files[0];if(!file)return;if(file.size>5*1024*1024)return alert('Foto maksimal 5 MB.');const path=u.authId+'/izin-'+Date.now()+'.jpg';try{const up=await supabaseClient.storage.from('izin-bukti').upload(path,file,{contentType:file.type||'image/jpeg'});if(up.error)throw up.error;try{await DB.add('izin',{pegawaiId:u.id,authUserId:u.authId,tanggalMulai:start,tanggalSelesai:end,jenis:kind[0].toUpperCase()+kind.slice(1).toLowerCase(),alasan:reason,fotoPath:path,status:'menunggu'});}catch(e){await supabaseClient.storage.from('izin-bukti').remove([path]);throw e;}await refreshA();}catch(e){alert('Pengajuan izin gagal: '+e.message);}};input.click();
  }
  function historyTreeA(rows, admin=false){
    const years={};
    rows.slice().sort((a,b)=>String(b.tanggal).localeCompare(String(a.tanggal))).forEach(x=>{
      const y=String(x.tanggal).slice(0,4),m=String(x.tanggal).slice(5,7);
      (years[y]??={})[m]??=[];
      years[y][m].push(x);
    });
    return Object.keys(years).sort((a,b)=>b.localeCompare(a)).map(y=>
      '<section class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px"><b>Tahun '+escA(y)+'</b><button class="btn tiny ghost" data-act="att-history-year" data-year="'+y+'">Detail</button></section>'
    ).join('');
  }
  function historyYearA(year, admin=false){
    const rows=DB.all('absensi').filter(x=>String(x.tanggal).startsWith(year+'-')&&(admin||String(x.pegawaiId)===String(me().id)));
    const months=[...new Set(rows.map(x=>String(x.tanggal).slice(5,7)))].sort((a,b)=>b.localeCompare(a));
    openInfo('Riwayat Tahun '+escA(year),months.map(m=>{
      const label=new Date(year+'-'+m+'-01T12:00:00').toLocaleDateString('id-ID',{month:'long'});
      const count=rows.filter(x=>String(x.tanggal).slice(5,7)===m).length;
      return '<section class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px"><b>'+label+' · '+count+' absensi</b><button class="btn tiny ghost" data-act="att-history-month" data-year="'+year+'" data-month="'+m+'">Detail</button></section>';
    }).join('')+'<button class="btn ghost" data-tutup>Tutup</button>');
    const close=$('#modal [data-tutup]');if(close)close.onclick=tutupModal;
  }
  function historyMonthA(year, month, admin=false){
    const rows=DB.all('absensi').filter(x=>String(x.tanggal).startsWith(year+'-'+month+'-')&&(admin||String(x.pegawaiId)===String(me().id))).sort((a,b)=>b.tanggal.localeCompare(a.tanggal));
    const label=new Date(year+'-'+month+'-01T12:00:00').toLocaleDateString('id-ID',{month:'long',year:'numeric'});
    openInfo('Riwayat '+escA(label),rows.map(x=>
      '<section class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><b>'+new Date(x.tanggal+'T12:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'</b>'+(admin?'<p>'+escA(namaPegawai(x.pegawaiId))+'</p>':'')+'<p>'+tagA(statusA(x,scheduleA()))+'</p></div><button class="btn tiny ghost" data-act="att-detail" data-id="'+escA(x.id)+'">Detail</button></div></section>'
    ).join('')+'<button class="btn ghost" data-tutup>Tutup</button>');
    const close=$('#modal [data-tutup]');if(close)close.onclick=tutupModal;
  }
  async function detailAttendanceA(id){
    const x=DB.all('absensi').find(r=>String(r.id)===String(id));if(!x)return;
    const paths=[['Foto Masuk',x.masukFotoPath],['Foto Pulang',x.pulangFotoPath]];
    const blocks=await Promise.all(paths.map(async pair=>{if(!pair[1])return '<p><b>'+pair[0]+':</b> Belum ada foto.</p>';const r=await supabaseClient.storage.from('absensi-bukti').createSignedUrl(pair[1],300);return '<h4>'+pair[0]+'</h4>'+(r.data&&r.data.signedUrl?'<img src="'+escA(r.data.signedUrl)+'" alt="'+pair[0]+'" style="width:100%;max-height:360px;object-fit:contain">':'<p>Foto gagal dimuat.</p>');}));
    openInfo('Bukti Foto Absensi','<p><b>Pegawai:</b> '+escA(namaPegawai(x.pegawaiId))+'</p><p><b>Tanggal:</b> '+dateA(x.tanggal)+'</p><p><b>Waktu masuk:</b> '+timeA(x.masukAt)+'</p><p><b>Lokasi masuk:</b> '+escA(x.masukAlamat||'-')+'</p><p><b>Waktu pulang:</b> '+timeA(x.pulangAt)+'</p><p><b>Lokasi pulang:</b> '+escA(x.pulangAlamat||'-')+'</p>'+blocks.join('')+'<button class="btn ghost" data-tutup>Tutup</button>');
    $('#modal [data-tutup]').onclick=tutupModal;
  }
  async function reviewA(id){
    if(!isAdmin())return;const x=DB.get('izin',id);if(!x)return;
    const result=await supabaseClient.storage.from('izin-bukti').createSignedUrl(x.fotoPath,300);
    const img=result.data&&result.data.signedUrl?'<img src="'+escA(result.data.signedUrl)+'" style="width:100%;max-height:360px;object-fit:contain" alt="Bukti izin">':'<p>Foto bukti gagal dimuat.</p>';
    openInfo('Periksa Pengajuan Izin','<p><b>Pegawai:</b> '+escA(namaPegawai(x.pegawaiId))+'</p><p><b>Tanggal:</b> '+dateA(x.tanggalMulai)+' – '+dateA(x.tanggalSelesai)+'</p><p><b>Jenis:</b> '+escA(x.jenis)+'</p><p><b>Alasan:</b> '+escA(x.alasan)+'</p>'+img+'<div class="form-actions"><button class="btn" data-review-leave="disetujui">Setujui</button><button class="btn danger" data-review-leave="ditolak">Tolak</button><button class="btn ghost" data-tutup>Tutup</button></div>');
    $('#modal [data-tutup]').onclick=tutupModal;
    $('#modal [data-review-leave="disetujui"]').onclick=()=>decideA(x,'disetujui');
    $('#modal [data-review-leave="ditolak"]').onclick=()=>decideA(x,'ditolak');
  }
  async function decideA(x,status){const note=prompt('Catatan admin (opsional)','')||'';try{await DB.update('izin',x.id,{status,catatanAdmin:note,diprosesOleh:me().authId,diprosesAt:new Date().toISOString()});tutupModal();await refreshA();}catch(e){alert('Gagal memproses izin: '+e.message);}}
  PAGES.absensi=pageA;
  PAGES.gudang=pageGudangAttendanceA;
  document.addEventListener('submit',e=>{
    if(e.target.matches('#att-schedule-form')){e.preventDefault();saveScheduleA(e.target);}
    if(e.target.matches('.att-seed-use')){e.preventDefault();useSeedA(e.target);}
  });
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-act]');if(!b)return;
    const id=b.dataset.id;
    switch(b.dataset.act){
      case 'att-schedule':e.preventDefault();document.querySelector('#att-schedule-form')?.scrollIntoView({behavior:'smooth',block:'center'});break;
      case 'att-photo-in':e.preventDefault();photoA('masuk');break;
      case 'att-photo-out':e.preventDefault();photoA('pulang');break;
      case 'att-leave':e.preventDefault();leaveA();break;
      case 'att-review':e.preventDefault();reviewA(id);break;
      case 'att-detail':e.preventDefault();detailAttendanceA(id);break;
      case 'att-history-year':e.preventDefault();historyYearA(b.dataset.year,isAdmin());break;
      case 'att-history-month':e.preventDefault();historyMonthA(b.dataset.year,b.dataset.month,isAdmin());break;
    }
  });
})();
