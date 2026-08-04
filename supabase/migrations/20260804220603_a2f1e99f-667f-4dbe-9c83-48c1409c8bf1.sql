-- 1) Backfill profile linkage from email (one-time, unambiguous matches only)
UPDATE public.students s
SET profile_id = p.id
FROM public.profiles p
WHERE s.profile_id IS NULL
  AND lower(s.email) = lower(p.email)
  AND p.email <> ''
  AND (SELECT count(*) FROM public.profiles p2 WHERE lower(p2.email) = lower(s.email)) = 1
  AND (SELECT count(*) FROM public.students s2 WHERE lower(s2.email) = lower(s.email)) = 1;

UPDATE public.lecturers l
SET profile_id = p.id
FROM public.profiles p
WHERE l.profile_id IS NULL
  AND lower(l.email) = lower(p.email)
  AND p.email <> ''
  AND (SELECT count(*) FROM public.profiles p2 WHERE lower(p2.email) = lower(l.email)) = 1
  AND (SELECT count(*) FROM public.lecturers l2 WHERE lower(l2.email) = lower(l.email)) = 1;

-- 2) Link new accounts at signup instead of relying on email matching in RLS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), COALESCE(NEW.email,''))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student'))
  ON CONFLICT DO NOTHING;

  IF COALESCE(NEW.email,'') <> '' THEN
    UPDATE public.students s
    SET profile_id = NEW.id
    WHERE s.profile_id IS NULL
      AND lower(s.email) = lower(NEW.email)
      AND (SELECT count(*) FROM public.students s2 WHERE lower(s2.email) = lower(NEW.email)) = 1;

    UPDATE public.lecturers l
    SET profile_id = NEW.id
    WHERE l.profile_id IS NULL
      AND lower(l.email) = lower(NEW.email)
      AND (SELECT count(*) FROM public.lecturers l2 WHERE lower(l2.email) = lower(NEW.email)) = 1;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) Remove email-based matching from RLS
CREATE OR REPLACE FUNCTION public.is_own_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = _student_id
      AND s.profile_id = auth.uid()
  );
$function$;

DROP POLICY IF EXISTS "read students restricted" ON public.students;
CREATE POLICY "read students restricted" ON public.students
FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR profile_id = auth.uid());

DROP POLICY IF EXISTS "read lecturers restricted" ON public.lecturers;
CREATE POLICY "read lecturers restricted" ON public.lecturers
FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR profile_id = auth.uid());

-- 4) Audit logs are append-only: no updates or deletes via the API
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated, anon;
