
-- helper: current user's email from JWT
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(auth.jwt() ->> 'email', ''), (SELECT email FROM auth.users WHERE id = auth.uid()));
$$;

-- helper: the student row(s) belonging to the current user
CREATE OR REPLACE FUNCTION public.is_own_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = _student_id
      AND (s.profile_id = auth.uid() OR s.email = public.current_user_email())
  );
$$;

-- PROFILES
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles readable by owner or admin"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_admin(auth.uid()));

-- USER ROLES
DROP POLICY IF EXISTS "roles readable" ON public.user_roles;
CREATE POLICY "roles readable by owner or admin"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- LECTURERS
DROP POLICY IF EXISTS "read lecturers" ON public.lecturers;
CREATE POLICY "read lecturers restricted"
ON public.lecturers FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR profile_id = auth.uid()
  OR email = public.current_user_email()
);

-- STUDENTS
DROP POLICY IF EXISTS "read students" ON public.students;
CREATE POLICY "read students restricted"
ON public.students FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR profile_id = auth.uid()
  OR email = public.current_user_email()
);

-- STUDENT MODULES
DROP POLICY IF EXISTS "read enrolments" ON public.student_modules;
CREATE POLICY "read enrolments restricted"
ON public.student_modules FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.is_own_student(student_id));

-- AUDIT LOGS: force actor identity server-side
CREATE OR REPLACE FUNCTION public.set_audit_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.actor_id := auth.uid();
  NEW.actor_email := COALESCE(public.current_user_email(), '');
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_set_actor ON public.audit_logs;
CREATE TRIGGER audit_logs_set_actor
BEFORE INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.set_audit_actor();
