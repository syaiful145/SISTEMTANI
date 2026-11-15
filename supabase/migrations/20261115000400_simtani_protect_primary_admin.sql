-- Protect the confirmed Admin Utama account at database level.
-- The owner may update their own profile; other authenticated users may not.
-- Admin Kedua cannot promote/demote administrators by editing profiles directly.

CREATE OR REPLACE FUNCTION public.protect_simtani_primary_admin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_id constant uuid := '248c406f-01a9-45bc-8aed-020c5a8e5800'::uuid;
  actor_id uuid := auth.uid();
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.id = owner_id AND actor_id IS DISTINCT FROM owner_id THEN
      RAISE EXCEPTION 'Akun Admin Utama tidak dapat dihapus oleh akun lain.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.id = owner_id AND actor_id IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'Profil Admin Utama hanya dapat diubah oleh Admin Utama.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.role = 'admin'
     AND NEW.admin_level IS DISTINCT FROM OLD.admin_level
     AND actor_id IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'Hanya Admin Utama yang dapat mengubah tingkatan administrator.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id = owner_id THEN
    NEW.role := 'admin';
    NEW.admin_level := 'utama';
  ELSIF NEW.role = 'admin' THEN
    NEW.admin_level := 'kedua';
  ELSE
    NEW.admin_level := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_simtani_primary_admin ON public.profiles;
CREATE TRIGGER trg_protect_simtani_primary_admin
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_simtani_primary_admin();
