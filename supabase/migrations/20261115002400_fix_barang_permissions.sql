-- AgriCore: perbaiki izin akses tabel barang untuk aplikasi.
-- Pegawai hanya dapat membaca daftar stok; perubahan stok/master barang hanya oleh Admin.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.barang TO authenticated;

DO $$
DECLARE
  v_sequence text;
BEGIN
  v_sequence := pg_get_serial_sequence('public.barang', 'id');
  IF v_sequence IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', v_sequence);
  END IF;
END;
$$;

ALTER TABLE public.barang ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS barang_authenticated_select ON public.barang;
CREATE POLICY barang_authenticated_select
ON public.barang
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS barang_admin_insert ON public.barang;
CREATE POLICY barang_admin_insert
ON public.barang
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND lower(trim(p.role)) = 'admin'
  )
);

DROP POLICY IF EXISTS barang_admin_update ON public.barang;
CREATE POLICY barang_admin_update
ON public.barang
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND lower(trim(p.role)) = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND lower(trim(p.role)) = 'admin'
  )
);

DROP POLICY IF EXISTS barang_admin_delete ON public.barang;
CREATE POLICY barang_admin_delete
ON public.barang
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND lower(trim(p.role)) = 'admin'
  )
);
