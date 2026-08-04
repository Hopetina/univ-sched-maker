import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createRepositories } from "./db/repositories.server";
import type { TableName } from "./db/repositories.server";
import { scheduleExam, validateScheduleRequest, writeAudit } from "./scheduling/scheduling.service.server";
import type { ScheduleRequest } from "./scheduling/types";

export type AppRole = "system_admin" | "department_admin" | "lecturer" | "student";

const SYS_ADMIN_TABLES: TableName[] = ["faculties", "departments", "venues", "exam_periods", "timeslots", "public_holidays"];
const ADMIN_TABLES: TableName[] = ["lecturers", "students", "modules", "student_modules", "exams"];
const READABLE_TABLES: TableName[] = [...SYS_ADMIN_TABLES, ...ADMIN_TABLES, "audit_logs", "profiles"];

function assertWritable(table: TableName, roles: AppRole[]) {
  const isSys = roles.includes("system_admin");
  const isDeptAdmin = roles.includes("department_admin");
  if (SYS_ADMIN_TABLES.includes(table) && !isSys) throw new Error("Only a System Admin may modify this data.");
  if (ADMIN_TABLES.includes(table) && !isSys && !isDeptAdmin) throw new Error("Only administrators may modify this data.");
  if (!SYS_ADMIN_TABLES.includes(table) && !ADMIN_TABLES.includes(table)) throw new Error("This table is not writable.");
}

export const getSessionContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const repos = createRepositories(context.supabase as never);
    const [roles, profile] = await Promise.all([
      repos.userRoles.list({ filters: { user_id: context.userId } }),
      repos.profiles.getById(context.userId),
    ]);
    const roleNames = (roles as unknown as { role: AppRole }[]).map((r) => r.role);
    const email = String(context.claims["email"] ?? profile?.email ?? "");
    let studentId: string | null = null;
    let lecturerId: string | null = null;
    if (roleNames.includes("student")) {
      const matches = await repos.students.list({ filters: { profile_id: context.userId }, limit: 1 });
      studentId = matches[0]?.id ?? null;
    }
    if (roleNames.includes("lecturer")) {
      const matches = await repos.lecturers.list({ filters: { profile_id: context.userId }, limit: 1 });
      lecturerId = matches[0]?.id ?? null;
    }
    return {
      userId: context.userId,
      email,
      fullName: profile?.full_name ?? "",
      departmentId: profile?.department_id ?? null,
      roles: roleNames,
      studentId,
      lecturerId,
    };
  });


export const listRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { table: TableName; orderBy?: string; ascending?: boolean; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    if (!READABLE_TABLES.includes(data.table)) throw new Error("Unknown table");
    const repos = createRepositories(context.supabase as never);
    return (await createRepositoriesList(repos, data)) as unknown as any[];
  });

function createRepositoriesList(
  repos: ReturnType<typeof createRepositories>,
  data: { table: TableName; orderBy?: string; ascending?: boolean; limit?: number },
) {
  const map: Record<string, { list: (o: never) => Promise<unknown[]> }> = {
    faculties: repos.faculties,
    departments: repos.departments,
    lecturers: repos.lecturers,
    students: repos.students,
    modules: repos.modules,
    student_modules: repos.studentModules,
    venues: repos.venues,
    exam_periods: repos.examPeriods,
    public_holidays: repos.publicHolidays,
    timeslots: repos.timeslots,
    exams: repos.exams,
    audit_logs: repos.auditLogs,
    profiles: repos.profiles,
  } as never;
  return map[data.table]!.list({
    orderBy: data.orderBy ?? "created_at",
    ascending: data.ascending ?? true,
    limit: data.limit ?? 500,
  } as never) as Promise<any[]>;
}

export const saveRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { table: TableName; id?: string | null; values: Record<string, unknown> }) => input)
  .handler(async ({ data, context }) => {
    const repos = createRepositories(context.supabase as never);
    const roles = (await repos.userRoles.list({ filters: { user_id: context.userId } })) as unknown as {
      role: AppRole;
    }[];
    assertWritable(data.table, roles.map((r) => r.role));
    const repo = (createRepositoriesMap(repos) as Record<string, ReturnType<typeof repos.faculties.create> extends never ? never : any>)[
      data.table
    ];
    const row = data.id ? await repo.update(data.id, data.values) : await repo.create(data.values);
    await writeAudit(repos, { userId: context.userId, email: String(context.claims["email"] ?? "") }, {
      action: data.id ? `${data.table}.update` : `${data.table}.create`,
      entity: data.table,
      entityId: row.id,
      details: data.values,
    });
    return row as unknown as any;
  });

export const deleteRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { table: TableName; id: string }) => input)
  .handler(async ({ data, context }) => {
    const repos = createRepositories(context.supabase as never);
    const roles = (await repos.userRoles.list({ filters: { user_id: context.userId } })) as unknown as {
      role: AppRole;
    }[];
    assertWritable(data.table, roles.map((r) => r.role));
    await (createRepositoriesMap(repos) as Record<string, any>)[data.table].remove(data.id);
    await writeAudit(repos, { userId: context.userId, email: String(context.claims["email"] ?? "") }, {
      action: `${data.table}.delete`,
      entity: data.table,
      entityId: data.id,
    });
    return { ok: true };
  });

function createRepositoriesMap(repos: ReturnType<typeof createRepositories>) {
  return {
    faculties: repos.faculties,
    departments: repos.departments,
    lecturers: repos.lecturers,
    students: repos.students,
    modules: repos.modules,
    student_modules: repos.studentModules,
    venues: repos.venues,
    exam_periods: repos.examPeriods,
    public_holidays: repos.publicHolidays,
    timeslots: repos.timeslots,
    exams: repos.exams,
    audit_logs: repos.auditLogs,
    profiles: repos.profiles,
  };
}

export const getSchedulingData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const repos = createRepositories(context.supabase as never);
    const [periods, modules, venues, lecturers, timeslots, exams, holidays, enrolments] = await Promise.all([
      repos.examPeriods.list({ orderBy: "start_date" }),
      repos.modules.list({ orderBy: "code" }),
      repos.venues.list({ orderBy: "name" }),
      repos.lecturers.list({ orderBy: "full_name" }),
      repos.timeslots.list({ orderBy: "slot_date" }),
      repos.exams.list({ orderBy: "created_at" }),
      repos.publicHolidays.list({ orderBy: "holiday_date" }),
      repos.studentModules.list({ select: "module_id" }),
    ]);
    const counts: Record<string, number> = {};
    for (const e of enrolments as unknown as { module_id: string }[]) {
      counts[e.module_id] = (counts[e.module_id] ?? 0) + 1;
    }
    return { periods, modules, venues, lecturers, timeslots, exams, holidays, enrolmentCounts: counts };
  });

export const validateSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ScheduleRequest) => input)
  .handler(async ({ data, context }) => {
    const repos = createRepositories(context.supabase as never);
    return validateScheduleRequest(repos, data);
  });

export const submitSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ScheduleRequest) => input)
  .handler(async ({ data, context }) => {
    const repos = createRepositories(context.supabase as never);
    const roles = (await repos.userRoles.list({ filters: { user_id: context.userId } })) as unknown as {
      role: AppRole;
    }[];
    const names = roles.map((r) => r.role);
    if (!names.includes("system_admin") && !names.includes("department_admin")) {
      throw new Error("Only administrators may schedule examinations.");
    }
    return scheduleExam(repos, { userId: context.userId, email: String(context.claims["email"] ?? "") }, data);
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const repos = createRepositories(context.supabase as never);
    const [faculties, departments, modules, students, lecturers, venues, exams, timeslots, periods, audit] =
      await Promise.all([
        repos.faculties.count(),
        repos.departments.count(),
        repos.modules.count(),
        repos.students.count(),
        repos.lecturers.count(),
        repos.venues.count(),
        repos.exams.list({ orderBy: "created_at", ascending: false }),
        repos.timeslots.list({}),
        repos.examPeriods.list({ orderBy: "start_date" }),
        repos.auditLogs.list({ orderBy: "created_at", ascending: false, limit: 8 }),
      ]);
    return {
      counts: {
        faculties,
        departments,
        modules,
        students,
        lecturers,
        venues,
        exams: exams.length,
        timeslots: timeslots.length,
        unscheduledModules: modules - exams.length,
      },
      periods,
      recentAudit: audit,
    };
  });

export const getMyTimetable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const repos = createRepositories(context.supabase as never);
    const email = String(context.claims["email"] ?? "");
    const [students, lecturers, exams, modules, timeslots, venues, enrolments] = await Promise.all([
      repos.students.list({ filters: { email }, limit: 1 }),
      repos.lecturers.list({ filters: { email }, limit: 1 }),
      repos.exams.list({}),
      repos.modules.list({}),
      repos.timeslots.list({}),
      repos.venues.list({}),
      repos.studentModules.list({ select: "student_id, module_id" }),
    ]);

    const student = students[0] ?? null;
    const lecturer = lecturers[0] ?? null;
    const moduleMap = new Map((modules as unknown as { id: string }[]).map((m) => [m.id, m]));
    const slotMap = new Map((timeslots as unknown as { id: string }[]).map((t) => [t.id, t]));
    const venueMap = new Map((venues as unknown as { id: string }[]).map((v) => [v.id, v]));

    const myModuleIds = new Set(
      (enrolments as unknown as { student_id: string; module_id: string }[])
        .filter((e) => student && e.student_id === student.id)
        .map((e) => e.module_id),
    );

    const rows = (exams as unknown as { id: string; module_id: string; timeslot_id: string; venue_id: string; invigilator_id: string | null }[])
      .filter((e) => (student ? myModuleIds.has(e.module_id) : false) || (lecturer ? e.invigilator_id === lecturer.id : false))
      .map((e) => ({
        id: e.id,
        module: moduleMap.get(e.module_id) as never,
        timeslot: slotMap.get(e.timeslot_id) as never,
        venue: venueMap.get(e.venue_id) as never,
        role: lecturer && e.invigilator_id === lecturer.id ? "Invigilator" : "Candidate",
      }));

    return { student, lecturer, rows };
  });
