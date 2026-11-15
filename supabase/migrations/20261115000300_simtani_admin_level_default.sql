-- Ensure every newly-created administrator receives a valid level.
-- The confirmed owner account remains Admin Utama; all other admins default to Admin Kedua.

CREATE OR REPLACE FUNCTION public.set_simtani_admin_level()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'admin' THEN
    IF NEW.id = '248c406f-01a9-45bc-8aed-020c5a8e5800'::uuid THEN
      NEW.admin_level := 'utama';
    ELSIF NEW.admin_level IS NULL OR NEW.admin_level NOT IN ('utama', 'kedua') THEN
      NEW.admin_level := 'kedua';
    END IF;
  ELSE
    NEW.admin_level := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_admin_level ON public.profiles;

CREATE TRIGGER trg_profiles_admin_level
BEFORE INSERT OR UPDATE OF role, admin_level
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_simtani_admin_level();

-- Backfill defensively in case any admin profile was created between migrations.
UPDATE public.profiles
SET admin_level = CASE
  WHEN id = '248c406f-01a9-45bc-8aed-020c5a8e5800'::uuid THEN 'utama'
  ELSE 'kedua'
END
WHERE role = 'admin'
  AND (admin_level IS NULL OR admin_level NOT IN ('utama', 'kedua'));
