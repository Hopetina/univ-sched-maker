
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

DROP POLICY "insert audit logs" ON public.audit_logs;
CREATE POLICY "insert own audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

INSERT INTO public.faculties (name, code) VALUES
  ('Faculty of Science & Engineering','FSE'),
  ('Faculty of Commerce','FCOM');

INSERT INTO public.departments (faculty_id, name, code)
SELECT id, 'Computer Science','CS' FROM public.faculties WHERE code='FSE';
INSERT INTO public.departments (faculty_id, name, code)
SELECT id, 'Mathematics','MATH' FROM public.faculties WHERE code='FSE';
INSERT INTO public.departments (faculty_id, name, code)
SELECT id, 'Accounting','ACC' FROM public.faculties WHERE code='FCOM';

INSERT INTO public.venues (name, code, building, capacity) VALUES
  ('Great Hall','GH','Main Campus',400),
  ('Lecture Theatre 1','LT1','Science Block',120),
  ('Lecture Theatre 2','LT2','Science Block',80),
  ('Computer Lab A','LABA','IT Block',40);

INSERT INTO public.exam_periods (name, start_date, end_date, allow_weekends)
VALUES ('November 2026 Main Examinations','2026-11-02','2026-11-20', false);

INSERT INTO public.public_holidays (name, holiday_date) VALUES
  ('Public Holiday','2026-11-05'),
  ('Founders Day','2026-11-12');

INSERT INTO public.timeslots (exam_period_id, slot_date, start_time, end_time, label)
SELECT p.id, d::date, s.start_time, s.end_time, s.label
FROM public.exam_periods p
CROSS JOIN generate_series('2026-11-02'::date, '2026-11-20'::date, '1 day') d
CROSS JOIN (VALUES ('08:00'::time,'11:00'::time,'Morning'), ('12:00'::time,'15:00'::time,'Midday'), ('16:00'::time,'19:00'::time,'Afternoon')) AS s(start_time,end_time,label)
WHERE p.name = 'November 2026 Main Examinations';

INSERT INTO public.lecturers (department_id, staff_number, full_name, email)
SELECT id, 'STF001','Dr. Naledi Mokoena','n.mokoena@university.edu' FROM public.departments WHERE code='CS';
INSERT INTO public.lecturers (department_id, staff_number, full_name, email)
SELECT id, 'STF002','Prof. Adam Fourie','a.fourie@university.edu' FROM public.departments WHERE code='CS';
INSERT INTO public.lecturers (department_id, staff_number, full_name, email)
SELECT id, 'STF003','Dr. Priya Naidoo','p.naidoo@university.edu' FROM public.departments WHERE code='MATH';
INSERT INTO public.lecturers (department_id, staff_number, full_name, email)
SELECT id, 'STF004','Mr. Sipho Dlamini','s.dlamini@university.edu' FROM public.departments WHERE code='ACC';

INSERT INTO public.modules (department_id, lecturer_id, code, name, nqf_level, duration_minutes)
SELECT d.id, l.id, m.code, m.name, m.lvl, 180
FROM (VALUES
  ('CS101','Introduction to Programming',5,'CS','STF001'),
  ('CS102','Computer Systems',5,'CS','STF002'),
  ('CS201','Data Structures & Algorithms',6,'CS','STF001'),
  ('CS301','Software Engineering',7,'CS','STF002'),
  ('MATH101','Calculus I',5,'MATH','STF003'),
  ('MATH201','Linear Algebra',6,'MATH','STF003'),
  ('ACC101','Financial Accounting I',5,'ACC','STF004')
) AS m(code,name,lvl,dept,staff)
JOIN public.departments d ON d.code = m.dept
JOIN public.lecturers l ON l.staff_number = m.staff;

INSERT INTO public.students (department_id, student_number, full_name, email, year_of_study)
SELECT d.id, s.num, s.name, s.email, s.yr
FROM (VALUES
  ('2026001','Thabo Nkosi','2026001@student.edu',1,'CS'),
  ('2026002','Lerato Khumalo','2026002@student.edu',1,'CS'),
  ('2026003','Aisha Patel','2026003@student.edu',2,'CS'),
  ('2026004','Johan van Wyk','2026004@student.edu',2,'CS'),
  ('2026005','Zanele Mthembu','2026005@student.edu',3,'CS'),
  ('2026006','Kabelo Sithole','2026006@student.edu',1,'MATH'),
  ('2026007','Emma Botha','2026007@student.edu',2,'MATH'),
  ('2026008','Sizwe Mahlangu','2026008@student.edu',1,'ACC')
) AS s(num,name,email,yr,dept)
JOIN public.departments d ON d.code = s.dept;

-- Enrolments (note: 2026003, a 2nd year, is repeating CS101 -> clash source)
INSERT INTO public.student_modules (student_id, module_id, academic_year, is_repeat)
SELECT st.id, mo.id, 2026, e.rep
FROM (VALUES
  ('2026001','CS101',false),('2026001','CS102',false),('2026001','MATH101',false),
  ('2026002','CS101',false),('2026002','CS102',false),
  ('2026003','CS201',false),('2026003','CS101',true),('2026003','MATH201',false),
  ('2026004','CS201',false),('2026004','MATH201',false),
  ('2026005','CS301',false),('2026005','CS201',true),
  ('2026006','MATH101',false),('2026006','CS101',false),
  ('2026007','MATH201',false),('2026007','MATH101',true),
  ('2026008','ACC101',false),('2026008','MATH101',false)
) AS e(snum,mcode,rep)
JOIN public.students st ON st.student_number = e.snum
JOIN public.modules mo ON mo.code = e.mcode;
