// Server-only helpers for timetable reporting and analytics.
import type { Repositories } from "./db/repositories.server";

export interface TimetableReportRow {
  examId: string;
  moduleCode: string;
  moduleName: string;
  departmentId: string;
  departmentName: string;
  facultyName: string;
  periodName: string;
  date: string;
  startTime: string;
  endTime: string;
  venueName: string;
  venueCapacity: number;
  invigilator: string;
  expectedStudents: number;
}

export interface TimetableReport {
  rows: TimetableReportRow[];
  periods: { id: string; name: string }[];
  departments: { id: string; name: string }[];
}

export interface AnalyticsResult {
  venueUtilisation: { venue: string; capacity: number; booked: number; utilisation: number }[];
  moduleCoverage: { scheduled: number; unscheduled: number };
  examsPerDay: { date: string; exams: number }[];
  conflictsByType: { type: string; count: number }[];
  departmentLoad: { department: string; exams: number; modules: number }[];
  scopedDepartmentId: string | null;
}

const CONFLICT_LABELS: Record<string, string> = {
  TIMESLOT_NOT_IN_PERIOD: "Timeslot outside period",
  WEEKEND_RESTRICTION: "Weekend restriction",
  PUBLIC_HOLIDAY: "Public holiday",
  DUPLICATE_EXAM: "Duplicate exam",
  VENUE_DOUBLE_BOOKED: "Venue double-booked",
  INVIGILATOR_DOUBLE_BOOKED: "Invigilator double-booked",
  VENUE_CAPACITY: "Venue capacity",
  STUDENT_CLASH: "Student clash",
};

async function loadCore(repos: Repositories) {
  const [exams, modules, departments, faculties, venues, timeslots, periods, lecturers] = await Promise.all([
    repos.exams.list({}),
    repos.modules.list({ orderBy: "code" }),
    repos.departments.list({ orderBy: "name" }),
    repos.faculties.list({ orderBy: "name" }),
    repos.venues.list({ orderBy: "name" }),
    repos.timeslots.list({}),
    repos.examPeriods.list({ orderBy: "start_date" }),
    repos.lecturers.list({}),
  ]);
  return { exams, modules, departments, faculties, venues, timeslots, periods, lecturers } as never as {
    exams: any[];
    modules: any[];
    departments: any[];
    faculties: any[];
    venues: any[];
    timeslots: any[];
    periods: any[];
    lecturers: any[];
  };
}

export async function buildTimetableReport(
  repos: Repositories,
  filters: { examPeriodId?: string | null; departmentId?: string | null },
): Promise<TimetableReport> {
  const core = await loadCore(repos);
  const moduleMap = new Map(core.modules.map((m) => [m.id, m]));
  const deptMap = new Map(core.departments.map((d) => [d.id, d]));
  const facultyMap = new Map(core.faculties.map((f) => [f.id, f]));
  const venueMap = new Map(core.venues.map((v) => [v.id, v]));
  const slotMap = new Map(core.timeslots.map((t) => [t.id, t]));
  const periodMap = new Map(core.periods.map((p) => [p.id, p]));
  const lecturerMap = new Map(core.lecturers.map((l) => [l.id, l]));

  const rows: TimetableReportRow[] = core.exams
    .filter((exam) => !filters.examPeriodId || exam.exam_period_id === filters.examPeriodId)
    .map((exam) => {
      const module = moduleMap.get(exam.module_id);
      const department = module ? deptMap.get(module.department_id) : undefined;
      const faculty = department ? facultyMap.get(department.faculty_id) : undefined;
      const slot = slotMap.get(exam.timeslot_id);
      const venue = venueMap.get(exam.venue_id);
      const lecturer = exam.invigilator_id ? lecturerMap.get(exam.invigilator_id) : undefined;
      return {
        examId: exam.id,
        moduleCode: module?.code ?? "—",
        moduleName: module?.name ?? "—",
        departmentId: module?.department_id ?? "",
        departmentName: department?.name ?? "—",
        facultyName: faculty?.name ?? "—",
        periodName: periodMap.get(exam.exam_period_id)?.name ?? "—",
        date: slot?.slot_date ?? "—",
        startTime: String(slot?.start_time ?? "").slice(0, 5),
        endTime: String(slot?.end_time ?? "").slice(0, 5),
        venueName: venue?.name ?? "—",
        venueCapacity: venue?.capacity ?? 0,
        invigilator: lecturer?.full_name ?? "Unassigned",
        expectedStudents: exam.expected_students ?? 0,
      };
    })
    .filter((row) => !filters.departmentId || row.departmentId === filters.departmentId)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));

  return {
    rows,
    periods: core.periods.map((p) => ({ id: p.id, name: p.name })),
    departments: core.departments.map((d) => ({ id: d.id, name: d.name })),
  };
}

export async function buildAnalytics(
  repos: Repositories,
  scopedDepartmentId: string | null,
): Promise<AnalyticsResult> {
  const core = await loadCore(repos);
  const audit = await repos.auditLogs.list({ orderBy: "created_at", ascending: false, limit: 300 });

  const moduleMap = new Map(core.modules.map((m) => [m.id, m]));
  const inScope = (moduleId: string) =>
    !scopedDepartmentId || moduleMap.get(moduleId)?.department_id === scopedDepartmentId;

  const exams = core.exams.filter((e) => inScope(e.module_id));
  const modules = core.modules.filter((m) => !scopedDepartmentId || m.department_id === scopedDepartmentId);
  const slotMap = new Map(core.timeslots.map((t) => [t.id, t]));

  const bookedByVenue = new Map<string, number>();
  const seatsByVenue = new Map<string, number>();
  for (const exam of exams) {
    bookedByVenue.set(exam.venue_id, (bookedByVenue.get(exam.venue_id) ?? 0) + 1);
    seatsByVenue.set(exam.venue_id, (seatsByVenue.get(exam.venue_id) ?? 0) + (exam.expected_students ?? 0));
  }

  const venueUtilisation = core.venues.map((venue) => {
    const booked = bookedByVenue.get(venue.id) ?? 0;
    const seats = seatsByVenue.get(venue.id) ?? 0;
    return {
      venue: venue.code || venue.name,
      capacity: venue.capacity,
      booked,
      utilisation: booked === 0 || venue.capacity === 0 ? 0 : Math.round((seats / (booked * venue.capacity)) * 100),
    };
  });

  const perDay = new Map<string, number>();
  for (const exam of exams) {
    const date = slotMap.get(exam.timeslot_id)?.slot_date;
    if (!date) continue;
    perDay.set(date, (perDay.get(date) ?? 0) + 1);
  }

  const conflictCounts = new Map<string, number>();
  for (const entry of audit as unknown as { outcome: string; details: any }[]) {
    if (entry.outcome !== "rejected") continue;
    for (const conflict of entry.details?.conflicts ?? []) {
      const label = CONFLICT_LABELS[conflict.code] ?? conflict.code;
      conflictCounts.set(label, (conflictCounts.get(label) ?? 0) + 1);
    }
  }

  const departmentLoad = core.departments
    .filter((d) => !scopedDepartmentId || d.id === scopedDepartmentId)
    .map((department) => ({
      department: department.code || department.name,
      modules: core.modules.filter((m) => m.department_id === department.id).length,
      exams: core.exams.filter((e) => moduleMap.get(e.module_id)?.department_id === department.id).length,
    }));

  const scheduledModuleIds = new Set(exams.map((e) => e.module_id));

  return {
    venueUtilisation: venueUtilisation.sort((a, b) => b.booked - a.booked).slice(0, 10),
    moduleCoverage: {
      scheduled: scheduledModuleIds.size,
      unscheduled: Math.max(modules.length - scheduledModuleIds.size, 0),
    },
    examsPerDay: [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, exams: count })),
    conflictsByType: [...conflictCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    departmentLoad,
    scopedDepartmentId,
  };
}
