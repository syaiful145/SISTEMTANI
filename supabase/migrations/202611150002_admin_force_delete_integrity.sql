-- Perbaikan integritas stok saat Admin Utama menghapus transaksi/penanaman/tanaman.
create or replace function public.admin_force_delete(p_table text, p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
  v_planting_ids bigint[];
  v_deleted integer := 0;
begin
  if p_table not in ('pegawai','barang','lahan','tanaman','penanaman','panen','laporan','transaksi','absensi','izin_pegawai') then
    raise exception 'Jenis data tidak diizinkan.';
  end if;

  if p_table = 'pegawai' then
    select auth_user_id into v_auth_user_id from public.pegawai where id = p_id for update;
    if not found then raise exception 'Data pegawai tidak ditemukan.'; end if;
    select coalesce(array_agg(id), array[]::bigint[]) into v_planting_ids
    from public.penanaman where pegawai_id = p_id;

    with tx as (
      select barang_id,
        sum(case when jenis = 'Masuk' then -jumlah when jenis = 'Keluar' then jumlah else 0 end) as delta
      from public.transaksi
      where pegawai_id = p_id or penanaman_id = any(v_planting_ids)
      group by barang_id
    )
    update public.barang b set stok = b.stok + tx.delta
    from tx where b.id = tx.barang_id;

    delete from public.transaksi where pegawai_id = p_id or penanaman_id = any(v_planting_ids);
    delete from public.panen where pegawai_id = p_id or penanaman_id = any(v_planting_ids);
    delete from public.laporan where pegawai_id = p_id;
    delete from public.absensi where pegawai_id = p_id;
    delete from public.izin_pegawai where pegawai_id = p_id;
    delete from public.penanaman where pegawai_id = p_id;
    delete from public.pegawai where id = p_id;
    return jsonb_build_object('success', true, 'auth_user_id', v_auth_user_id);

  elsif p_table = 'transaksi' then
    update public.barang b
      set stok = b.stok + case
        when t.jenis = 'Masuk' then -t.jumlah
        when t.jenis = 'Keluar' then t.jumlah
        else 0 end
    from public.transaksi t
    where t.id = p_id and b.id = t.barang_id;

  elsif p_table = 'penanaman' then
    with tx as (
      select barang_id,
        sum(case when jenis = 'Masuk' then -jumlah when jenis = 'Keluar' then jumlah else 0 end) as delta
      from public.transaksi where penanaman_id = p_id group by barang_id
    )
    update public.barang b set stok = b.stok + tx.delta
    from tx where b.id = tx.barang_id;
    delete from public.transaksi where penanaman_id = p_id;
    delete from public.panen where penanaman_id = p_id;

  elsif p_table = 'tanaman' then
    select coalesce(array_agg(id), array[]::bigint[]) into v_planting_ids
    from public.penanaman where tanaman_id = p_id;
    with tx as (
      select barang_id,
        sum(case when jenis = 'Masuk' then -jumlah when jenis = 'Keluar' then jumlah else 0 end) as delta
      from public.transaksi where penanaman_id = any(v_planting_ids) group by barang_id
    )
    update public.barang b set stok = b.stok + tx.delta
    from tx where b.id = tx.barang_id;
    delete from public.transaksi where penanaman_id = any(v_planting_ids);
    delete from public.panen where penanaman_id = any(v_planting_ids);
    delete from public.penanaman where tanaman_id = p_id;

  elsif p_table = 'barang' then
    delete from public.transaksi where barang_id = p_id;
  elsif p_table = 'lahan' then
    delete from public.laporan where lahan_id = p_id;
  end if;

  execute format('delete from public.%I where id = $1', p_table) using p_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then raise exception 'Data tidak ditemukan atau sudah terhapus.'; end if;
  return jsonb_build_object('success', true, 'deleted', v_deleted);
end;
$$;

revoke all on function public.admin_force_delete(text, bigint) from public, anon, authenticated;
grant execute on function public.admin_force_delete(text, bigint) to service_role;
