-- 1. Helper functions for department scoping
CREATE OR REPLACE FUNCTION public.current_department_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT department_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_manage_department(_department_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'system_admin')
      OR (
        public.has_role(auth.uid(), 'department_admin')
        AND _department_id IS NOT NULL
        AND _department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())
      );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_module(_module_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_department((SELECT department_id FROM public.modules WHERE id = _module_id));
$$;

REVOKE EXECUTE ON FUNCTION public.current_department_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_department(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_module(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_department_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_department(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_module(uuid) TO authenticated, service_role;

-- 2. Registration lockdown: every new account is a student
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), COALESCE(NEW.email,''))
  ON CONFLICT (id) DO NOTHING;

  -- Elevated roles are never self-assigned; a System Admin grants them later.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student')
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
$$;

-- 3. Role administration by System Admins
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

CREATE POLICY "sysadmin insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'system_admin'));
CREATE POLICY "sysadmin update roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'system_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'system_admin'));
CREATE POLICY "sysadmin delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'system_admin'));

-- Admins may read every profile so the users screen can list them
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'system_admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'system_admin'));

-- 4. Department scoping on academic data
DROP POLICY IF EXISTS "admin students" ON public.students;
DROP POLICY IF EXISTS "read students restricted" ON public.students;
CREATE POLICY "manage students in department" ON public.students
  FOR ALL TO authenticated
  USING (public.can_manage_department(department_id))
  WITH CHECK (public.can_manage_department(department_id));
CREATE POLICY "read students restricted" ON public.students
  FOR SELECT TO authenticated
  USING (public.can_manage_department(department_id) OR profile_id = auth.uid());

DROP POLICY IF EXISTS "admin lecturers" ON public.lecturers;
DROP POLICY IF EXISTS "read lecturers restricted" ON public.lecturers;
CREATE POLICY "manage lecturers in department" ON public.lecturers
  FOR ALL TO authenticated
  USING (public.can_manage_department(department_id))
  WITH CHECK (public.can_manage_department(department_id));
CREATE POLICY "read lecturers restricted" ON public.lecturers
  FOR SELECT TO authenticated
  USING (public.can_manage_department(department_id) OR profile_id = auth.uid());

DROP POLICY IF EXISTS "admin modules" ON public.modules;
CREATE POLICY "manage modules in department" ON public.modules
  FOR ALL TO authenticated
  USING (public.can_manage_department(department_id))
  WITH CHECK (public.can_manage_department(department_id));

DROP POLICY IF EXISTS "admin enrolments" ON public.student_modules;
DROP POLICY IF EXISTS "read enrolments restricted" ON public.student_modules;
CREATE POLICY "manage enrolments in department" ON public.student_modules
  FOR ALL TO authenticated
  USING (public.can_manage_module(module_id))
  WITH CHECK (public.can_manage_module(module_id));
CREATE POLICY "read enrolments restricted" ON public.student_modules
  FOR SELECT TO authenticated
  USING (public.can_manage_module(module_id) OR public.is_own_student(student_id));

DROP POLICY IF EXISTS "admin exams" ON public.exams;
CREATE POLICY "manage exams in department" ON public.exams
  FOR ALL TO authenticated
  USING (public.can_manage_module(module_id))
  WITH CHECK (public.can_manage_module(module_id));

-- 5. Data integrity
DELETE FROM public.student_modules a
USING public.student_modules b
WHERE a.ctid > b.ctid
  AND a.student_id = b.student_id
  AND a.module_id = b.module_id
  AND a.academic_year = b.academic_year;

CREATE UNIQUE INDEX IF NOT EXISTS student_modules_unique_enrolment
  ON public.student_modules (student_id, module_id, academic_year);

DELETE FROM public.exams a
USING public.exams b
WHERE a.ctid > b.ctid AND a.module_id = b.module_id AND a.exam_period_id = b.exam_period_id;

CREATE UNIQUE INDEX IF NOT EXISTS exams_unique_module_period
  ON public.exams (module_id, exam_period_id);

DELETE FROM public.exams a
USING public.exams b
WHERE a.ctid > b.ctid AND a.venue_id = b.venue_id AND a.timeslot_id = b.timeslot_id;

CREATE UNIQUE INDEX IF NOT EXISTS exams_unique_venue_timeslot
  ON public.exams (venue_id, timeslot_id);