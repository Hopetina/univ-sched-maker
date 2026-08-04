# System Audit & Gap Analysis — ExamSched

No changes have been made. This is a read-only report plus a proposed plan.

## Part 1 — System Audit

### 1. Database entities and relationships — Implemented
faculties → departments → (modules, lecturers, students); modules → lecturer (nullable);
student_modules joins students ↔ modules (academic_year, is_repeat); exam_periods → timeslots;
exams → module, exam_period, timeslot, venue, invigilator (lecturer); profiles (id → auth user,
department_id present but unused); user_roles (separate table, app_role enum); audit_logs.
Gap: `student_modules` has no unique constraint on (student_id, module_id, academic_year);
`exams` has no unique constraint on (module_id, exam_period_id) or (venue_id, timeslot_id).

### 2. Roles and permissions — Partially Implemented
Four roles exist (system_admin, department_admin, lecturer, student) in `user_roles` with
`has_role`/`is_admin` security-definer helpers. Server-side write allowlists split sysadmin-only
tables (faculties, departments, venues, exam_periods, timeslots, holidays) from admin tables
(lecturers, students, modules, enrolments, exams). Sidebar hides items by role.
Gap: no department scoping — a department admin can edit every department's data; there is no
admin UI to grant or revoke roles; `user_roles` has no insert/update/delete policy at all.

### 3. Authentication and registration — Partially Implemented
Email/password sign-in and sign-up via the auth page, protected `_authenticated` layout,
`handle_new_user` trigger creating profile + role and linking student/lecturer records by email.
Gap: the sign-up form lets anyone self-select System Admin / Department Admin / Lecturer —
this is an open privilege-escalation path. No Google sign-in. No department selection.

### 4. Scheduling engine — Implemented
Prefetched in-memory context per exam period, full rule evaluation, alternative
timeslot/venue suggestion generator with a utilisation score, service layer wrapping
validate → persist → audit.

### 5. Validation rules — Implemented
All seven: timeslot-in-period, weekend restriction, public holidays, duplicate exam per period,
venue double-booking, invigilator double-booking, venue capacity vs enrolments.
Note: rules are application-level only; no database constraints back them up.

### 6. Conflict detection — Implemented
Student clashes are computed from actual `student_modules` rows (not year level), so a repeating
first-year module is caught. Conflicts report reason, conflicting module, conflicting timeslot,
conflicting venue and the affected student list.

### 7. Reporting — Missing
No PDF export, no Excel/CSV export, no printable timetable, no cross-entity reports.

### 8. Dashboards — Partially Implemented
One dashboard with eight counts, exam periods and recent audit entries. Same view for every role,
counts are institution-wide, no charts or analytics, no department filtering.

### 9. Security controls — Partially Implemented
RLS on every table, security-definer helpers with fixed search_path, role checks re-verified
server-side, audit_logs append-only with UPDATE/DELETE revoked, bearer-token middleware on all
server functions, CSRF middleware.
Gap: role self-assignment at sign-up; no department-level authorisation.

### 10. RLS policies — Implemented (broad by design)
Reference data (faculties, departments, modules, venues, periods, timeslots, holidays, exams)
readable by all authenticated users — required by the conflict engine. students/lecturers/
enrolments restricted to admins or the owning profile. profiles and user_roles owner-or-admin.
audit_logs insert-own / read-admin, no update or delete.

### 11. API / services — Implemented
Layered: repositories (`repositories.server.ts`) → engine (`engine.server.ts`) → service
(`scheduling.service.server.ts`) → server functions (`exam.functions.ts`): session context,
generic list/save/delete, scheduling data, validate, submit, dashboard, my timetable.

### 12. Module enrolment — Partially Implemented
Full CRUD on enrolments with student, module, academic year and repeat flag; enrolments drive
clash detection. Gap: no duplicate prevention, no bulk enrolment, no per-student enrolment view.

### 13. Timetable — Partially Implemented
"My timetable" resolves student/lecturer by email and lists their exams. Gap: matching should use
`profile_id` (already backfilled) rather than email; no institution-wide or per-department
timetable view, no calendar/grid layout, no export or print.

### 14. Audit logging — Implemented
Every CRUD write and every schedule attempt (including rejections with conflict codes) is logged
with actor, entity, outcome and JSON details; DB trigger stamps actor server-side; append-only
table; admin-only audit trail page.

## Part 2 — Gap Analysis vs Target Requirements

| Requirement | Status |
| --- | --- |
| No public registration for Admin / Dept Admin / Lecturer | Missing — role picker is public |
| Department Admin assigned by System Admin | Missing |
| Lecturer assigned by System Admin or Dept Admin | Partially — lecturer records exist, no account/role link |
| Role determined automatically from profile | Partially — role stored in user_roles, but chosen at sign-up |
| Department assigned automatically from profile | Missing — profiles.department_id unused |
| Student enrolment management | Implemented |
| Repeat module support | Implemented |
| Duplicate enrolment prevention | Missing |
| Department-restricted dashboards | Missing |
| Timetable reporting | Partially — personal timetable only |
| PDF export | Missing |
| Excel export | Missing |
| Analytics dashboard | Partially — counts only |
| Full role-based security | Partially — role layer solid, department layer absent |

### Potential impact of the changes
- Removing role self-selection means existing self-created admin accounts must be re-granted by a
  System Admin; sign-up becomes student-only (or invite-only).
- Department scoping narrows what department admins currently see and edit — some existing
  workflows will start returning fewer rows.
- Duplicate-enrolment constraints may fail to apply until existing duplicate rows are cleaned.
- Exports and analytics are additive and carry no regression risk.

## Part 3 — Proposed remediation plan (not yet applied)

1. **Registration lockdown** — sign-up creates a student-only account; remove the role picker.
   Add a System Admin "Users & roles" screen to grant/revoke roles and set a user's department.
2. **Profile-driven identity** — populate `profiles.department_id`; derive role and department from
   the profile everywhere; switch timetable/session matching from email to `profile_id`.
3. **Department scoping** — department admins restricted to their own department's modules,
   students, lecturers, enrolments and exams, enforced in RLS and in the service layer.
4. **Enrolment integrity** — unique constraint on (student_id, module_id, academic_year) with a
   clear duplicate error; optional bulk enrolment.
5. **Reporting** — institution/department/module timetable report with filters, plus PDF and
   Excel (XLSX) export.
6. **Analytics dashboard** — venue utilisation, scheduled vs unscheduled modules, conflicts by
   type over time, exams per day, scoped to the viewer's department.

## Technical notes
Work splits into database migrations (role-grant policies, department scoping policies, enrolment
unique index), server-function/service changes (department filters, report queries, role
management functions), and frontend (users screen, reports screen, export buttons, analytics
charts). Exports run client-side (jspdf + autotable, xlsx) to avoid worker-runtime limits.
