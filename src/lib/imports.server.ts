// Server-only logic for the bulk Student Registration Import and Examination Timetable Import.
// Reuses the existing repositories, account-creation helpers and scheduling engine — no parallel
// data paths are created here.
import type { Repositories } from "./db/repositories.server";
import type { Actor } from "./scheduling/scheduling.service.server";
import { scheduleExam, writeAudit } from "./scheduling/scheduling.service.server";
import { loadSchedulingContext } from "./scheduling/engine.server";
import type { Conflict } from "./scheduling/types";

// ---------------------------------------------------------------------------
// Student Registration Import (students + modules + enrolments, one sheet)
// ---------------------------------------------------------------------------

export interface StudentImportRow {
  studentNumber: string;
  fullName: string;
  email: string;
  departmentCode: string;
  yearOfStudy?: number;
  moduleCode: string;
  moduleName?: string;
  academicYear: number;
  isRepeat?: boolean;
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface StudentImportReport {
  rowsProcessed: number;
  studentsCreated: number;
  studentsUpdated: number;
  modulesCreated: number;
  enrolmentsCreated: number;
  enrolmentsUpdated: number;
  accountsCreated: number;
  errors: ImportRowError[];
}

function required(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function runStudentImport(
  repos: Repositories,
  actor: Actor,
  rows: StudentImportRow[],
): Promise<StudentImportReport> {
  const report: StudentImportReport = {
    rowsProcessed: 0,
    studentsCreated: 0,
    studentsUpdated: 0,
    modulesCreated: 0,
    enrolmentsCreated: 0,
    enrolmentsUpdated: 0,
    accountsCreated: 0,
    errors: [],
  };

  const [departments, existingStudents, existingModules, existingProfiles, existingEnrolments] = await Promise.all([
    repos.departments.list({}),
    repos.students.list({}),
    repos.modules.list({}),
    repos.profiles.list({}),
    repos.studentModules.list({}),
  ]);

  const departmentByCode = new Map(
    (departments as unknown as { id: string; code: string }[]).map((d) => [d.code.trim().toLowerCase(), d.id]),
  );
  const studentByNumber = new Map(
    (existingStudents as unknown as { id: string; student_number: string; profile_id: string | null }[]).map((s) => [
      s.student_number.trim().toLowerCase(),
      s,
    ]),
  );
  const moduleByCode = new Map(
    (existingModules as unknown as { id: string; code: string }[]).map((m) => [m.code.trim().toLowerCase(), m]),
  );
  const profileByEmail = new Map(
    (existingProfiles as unknown as { id: string; email: string }[]).map((p) => [p.email.trim().toLowerCase(), p.id]),
  );
  const enrolmentKey = (studentId: string, moduleId: string, academicYear: number) => `${studentId}::${moduleId}::${academicYear}`;
  const enrolmentByKey = new Map(
    (existingEnrolments as unknown as { id: string; student_id: string; module_id: string; academic_year: number; is_repeat: boolean }[]).map(
      (e) => [enrolmentKey(e.student_id, e.module_id, e.academic_year), e],
    ),
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // account for the header row in the source spreadsheet
    report.rowsProcessed++;
    try {
      if (!required(row.studentNumber)) throw new Error("Student number is required.");
      if (!required(row.fullName)) throw new Error("Full name is required.");
      if (!required(row.email)) throw new Error("Email is required.");
      if (!required(row.departmentCode)) throw new Error("Department code is required.");
      if (!required(row.moduleCode)) throw new Error("Module code is required.");
      if (!row.academicYear) throw new Error("Academic year is required.");

      const departmentId = departmentByCode.get(row.departmentCode.trim().toLowerCase());
      if (!departmentId) throw new Error(`Unknown department code "${row.departmentCode}".`);

      const studentKey = row.studentNumber.trim().toLowerCase();
      let student = studentByNumber.get(studentKey);
      if (!student) {
        const created = await repos.students.create({
          student_number: row.studentNumber.trim(),
          full_name: row.fullName.trim(),
          email: row.email.trim().toLowerCase(),
          department_id: departmentId,
          year_of_study: row.yearOfStudy ?? 1,
        });
        student = created as unknown as { id: string; student_number: string; profile_id: string | null };
        studentByNumber.set(studentKey, student);
        report.studentsCreated++;
      } else {
        await repos.students.update(student.id, {
          full_name: row.fullName.trim(),
          email: row.email.trim().toLowerCase(),
          department_id: departmentId,
          ...(row.yearOfStudy ? { year_of_study: row.yearOfStudy } : {}),
        });
        report.studentsUpdated++;
      }

      if (!student.profile_id) {
        const email = row.email.trim().toLowerCase();
        let profileId = profileByEmail.get(email);
        if (!profileId) {
          const { createManagedUserAccount, randomTemporaryPassword } = await import("./admin.server");
          const { userId } = await createManagedUserAccount(repos, actor, {
            email,
            password: randomTemporaryPassword(),
            fullName: row.fullName.trim(),
            departmentId,
            roles: ["student"],
          });
          profileId = userId;
          profileByEmail.set(email, profileId);
          report.accountsCreated++;
        }
        await repos.students.update(student.id, { profile_id: profileId });
        student.profile_id = profileId;
      }

      const moduleKey = row.moduleCode.trim().toLowerCase();
      let module = moduleByCode.get(moduleKey);
      if (!module) {
        if (!required(row.moduleName)) throw new Error(`Module "${row.moduleCode}" does not exist yet — provide a module name to create it.`);
        const created = await repos.modules.create({
          code: row.moduleCode.trim(),
          name: row.moduleName.trim(),
          department_id: departmentId,
        });
        module = created as unknown as { id: string; code: string };
        moduleByCode.set(moduleKey, module);
        report.modulesCreated++;
      }

      const academicYear = Number(row.academicYear);
      const key = enrolmentKey(student.id, module.id, academicYear);
      const existingEnrolment = enrolmentByKey.get(key);
      if (existingEnrolment) {
        if (existingEnrolment.is_repeat !== Boolean(row.isRepeat)) {
          await repos.studentModules.update(existingEnrolment.id, { is_repeat: Boolean(row.isRepeat) });
          report.enrolmentsUpdated++;
        }
      } else {
        const created = await repos.studentModules.create({
          student_id: student.id,
          module_id: module.id,
          academic_year: academicYear,
          is_repeat: Boolean(row.isRepeat),
        });
        enrolmentByKey.set(
          key,
          created as unknown as { id: string; student_id: string; module_id: string; academic_year: number; is_repeat: boolean },
        );
        report.enrolmentsCreated++;
      }
    } catch (error) {
      report.errors.push({ row: rowNumber, message: error instanceof Error ? error.message : String(error) });
    }
  }

  await writeAudit(repos, actor, {
    action: "students.import",
    entity: "students",
    outcome: report.errors.length > 0 && report.rowsProcessed === report.errors.length ? "failure" : "success",
    details: { ...report, errors: report.errors.slice(0, 50) },
  });

  return report;
}

// ---------------------------------------------------------------------------
// Examination Timetable Import (creates proposed exams via the scheduling engine)
// ---------------------------------------------------------------------------

export interface ExamImportRow {
  moduleCode: string;
  date: string;
  startTime: string;
  venueCode: string;
  invigilatorStaffNumber?: string;
  notes?: string;
}

export interface ExamImportConflictDetail {
  row: number;
  moduleCode: string;
  conflicts: { code: string; reason: string }[];
}

export interface ExamImportReport {
  rowsProcessed: number;
  examsImported: number;
  conflictsFound: number;
  errors: ImportRowError[];
  conflictDetails: ExamImportConflictDetail[];
}

export async function runExamTimetableImport(
  repos: Repositories,
  actor: Actor,
  examPeriodId: string,
  rows: ExamImportRow[],
): Promise<ExamImportReport> {
  const report: ExamImportReport = {
    rowsProcessed: 0,
    examsImported: 0,
    conflictsFound: 0,
    errors: [],
    conflictDetails: [],
  };

  const [lecturers, venues] = await Promise.all([repos.lecturers.list({}), repos.venues.list({})]);
  const lecturerByStaffNumber = new Map(
    (lecturers as unknown as { id: string; staff_number: string }[]).map((l) => [l.staff_number.trim().toLowerCase(), l.id]),
  );
  const venueByCode = new Map(
    (venues as unknown as { id: string; code: string }[]).map((v) => [v.code.trim().toLowerCase(), v.id]),
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;
    report.rowsProcessed++;
    try {
      if (!required(row.moduleCode)) throw new Error("Module code is required.");
      if (!required(row.date)) throw new Error("Date is required.");
      if (!required(row.startTime)) throw new Error("Start time is required.");
      if (!required(row.venueCode)) throw new Error("Venue code is required.");

      // Reload the scheduling context on every row so earlier rows in this same
      // import are reflected in clash detection (duplicate/venue/invigilator checks).
      const ctx = await loadSchedulingContext(repos, examPeriodId);
      const module = [...ctx.modules.values()].find((m) => m.code.trim().toLowerCase() === row.moduleCode.trim().toLowerCase());
      if (!module) throw new Error(`Unknown module code "${row.moduleCode}".`);

      const timeslot = ctx.timeslots.find(
        (t) => t.slot_date === row.date.trim() && t.start_time.slice(0, 5) === row.startTime.trim().slice(0, 5),
      );
      if (!timeslot) throw new Error(`No timeslot exists for ${row.date} ${row.startTime}. Create it under Timeslots first.`);

      const venueId = venueByCode.get(row.venueCode.trim().toLowerCase());
      if (!venueId) throw new Error(`Unknown venue code "${row.venueCode}".`);

      let invigilatorId: string | null = null;
      if (required(row.invigilatorStaffNumber)) {
        const found = lecturerByStaffNumber.get(row.invigilatorStaffNumber.trim().toLowerCase());
        if (!found) throw new Error(`Unknown invigilator staff number "${row.invigilatorStaffNumber}".`);
        invigilatorId = found;
      }

      const result = await scheduleExam(repos, actor, {
        moduleId: module.id,
        examPeriodId,
        timeslotId: timeslot.id,
        venueId,
        invigilatorId,
        notes: row.notes ?? "",
      });

      if (result.ok) {
        report.examsImported++;
      } else {
        report.conflictsFound++;
        report.conflictDetails.push({
          row: rowNumber,
          moduleCode: row.moduleCode,
          conflicts: result.validation.conflicts.map((c: Conflict) => ({ code: c.code, reason: c.reason })),
        });
      }
    } catch (error) {
      report.errors.push({ row: rowNumber, message: error instanceof Error ? error.message : String(error) });
    }
  }

  await writeAudit(repos, actor, {
    action: "exams.import",
    entity: "exams",
    entityId: examPeriodId,
    outcome: report.conflictsFound > 0 || report.errors.length > 0 ? "rejected" : "success",
    details: {
      examPeriodId,
      rowsProcessed: report.rowsProcessed,
      examsImported: report.examsImported,
      conflictsFound: report.conflictsFound,
      errors: report.errors.slice(0, 50),
    },
  });

  return report;
}
