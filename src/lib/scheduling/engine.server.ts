// Scheduling engine: pure, in-memory rule evaluation over a prefetched context.
import type { Repositories } from "../db/repositories.server";
import type {
  AffectedStudent,
  Conflict,
  SchedulingSuggestion,
  ScheduleRequest,
  ValidationResult,
} from "./types";

type Timeslot = { id: string; exam_period_id: string; slot_date: string; start_time: string; end_time: string; label: string };
type Venue = { id: string; name: string; code: string; capacity: number; is_active: boolean };
type ModuleRow = { id: string; code: string; name: string; department_id: string };
type ExamRow = {
  id: string;
  module_id: string;
  exam_period_id: string;
  timeslot_id: string;
  venue_id: string;
  invigilator_id: string | null;
};
type Enrolment = { student_id: string; module_id: string; is_repeat: boolean };
type StudentRow = { id: string; student_number: string; full_name: string };
type LecturerRow = { id: string; full_name: string; department_id: string };

export interface SchedulingContext {
  period: { id: string; name: string; start_date: string; end_date: string; allow_weekends: boolean };
  timeslots: Timeslot[];
  venues: Venue[];
  modules: Map<string, ModuleRow>;
  exams: ExamRow[];
  enrolmentsByModule: Map<string, Enrolment[]>;
  students: Map<string, StudentRow>;
  lecturers: LecturerRow[];
  holidays: Set<string>;
}

export async function loadSchedulingContext(
  repos: Repositories,
  examPeriodId: string,
): Promise<SchedulingContext> {
  const [period, timeslots, venues, modules, exams, enrolments, students, lecturers, holidays] =
    await Promise.all([
      repos.examPeriods.getById(examPeriodId),
      repos.timeslots.list({ filters: { exam_period_id: examPeriodId }, orderBy: "slot_date" }),
      repos.venues.list({ orderBy: "capacity", ascending: false }),
      repos.modules.list({ orderBy: "code" }),
      repos.exams.list({ filters: { exam_period_id: examPeriodId } }),
      repos.studentModules.list({ select: "student_id, module_id, is_repeat" }),
      repos.students.list({ orderBy: "student_number" }),
      repos.lecturers.list({ orderBy: "full_name" }),
      repos.publicHolidays.list(),
    ]);

  if (!period) throw new Error("Exam period not found");

  const enrolmentsByModule = new Map<string, Enrolment[]>();
  for (const enrolment of enrolments as unknown as Enrolment[]) {
    const bucket = enrolmentsByModule.get(enrolment.module_id) ?? [];
    bucket.push(enrolment);
    enrolmentsByModule.set(enrolment.module_id, bucket);
  }

  return {
    period: period as SchedulingContext["period"],
    timeslots: (timeslots as unknown as Timeslot[]).sort(
      (a, b) => `${a.slot_date}${a.start_time}`.localeCompare(`${b.slot_date}${b.start_time}`),
    ),
    venues: venues as unknown as Venue[],
    modules: new Map((modules as unknown as ModuleRow[]).map((m) => [m.id, m])),
    exams: exams as unknown as ExamRow[],
    enrolmentsByModule,
    students: new Map((students as unknown as StudentRow[]).map((s) => [s.id, s])),
    lecturers: lecturers as unknown as LecturerRow[],
    holidays: new Set((holidays as unknown as { holiday_date: string }[]).map((h) => h.holiday_date)),
  };
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function describeTimeslot(slot: Timeslot) {
  return {
    id: slot.id,
    date: slot.slot_date,
    startTime: slot.start_time,
    endTime: slot.end_time,
    label: slot.label,
  };
}

/** Evaluates every business rule for one requested placement. */
export function evaluateRequest(
  ctx: SchedulingContext,
  request: ScheduleRequest,
): { conflicts: Conflict[]; enrolledStudents: number; venueCapacity: number } {
  const conflicts: Conflict[] = [];
  const slot = ctx.timeslots.find((t) => t.id === request.timeslotId);
  const venue = ctx.venues.find((v) => v.id === request.venueId);
  const module = ctx.modules.get(request.moduleId);
  const enrolments = ctx.enrolmentsByModule.get(request.moduleId) ?? [];
  const enrolledStudents = enrolments.length;
  const venueCapacity = venue?.capacity ?? 0;

  if (!slot || slot.exam_period_id !== ctx.period.id) {
    conflicts.push({
      code: "TIMESLOT_NOT_IN_PERIOD",
      severity: "blocking",
      reason: "The selected timeslot does not belong to the selected examination period.",
    });
    return { conflicts, enrolledStudents, venueCapacity };
  }

  // Rule 7 — weekends
  if (!ctx.period.allow_weekends && isWeekend(slot.slot_date)) {
    conflicts.push({
      code: "WEEKEND_RESTRICTION",
      severity: "blocking",
      reason: `${slot.slot_date} falls on a weekend and this exam period does not permit weekend examinations.`,
      conflictingTimeslot: describeTimeslot(slot),
    });
  }

  // Rule 6 — public holidays
  if (ctx.holidays.has(slot.slot_date)) {
    conflicts.push({
      code: "PUBLIC_HOLIDAY",
      severity: "blocking",
      reason: `${slot.slot_date} is a gazetted public holiday. Examinations may not be scheduled on public holidays.`,
      conflictingTimeslot: describeTimeslot(slot),
    });
  }

  const otherExams = ctx.exams.filter((e) => e.id !== request.examId);

  // Rule 4 — duplicate exam in the same period
  const duplicate = otherExams.find((e) => e.module_id === request.moduleId);
  if (duplicate) {
    const dupSlot = ctx.timeslots.find((t) => t.id === duplicate.timeslot_id);
    conflicts.push({
      code: "DUPLICATE_EXAM",
      severity: "blocking",
      reason: `${module?.code ?? "This module"} already has an examination scheduled in ${ctx.period.name}.`,
      conflictingModule: module ? { id: module.id, code: module.code, name: module.name } : null,
      conflictingTimeslot: dupSlot ? describeTimeslot(dupSlot) : null,
    });
  }

  const examsInSlot = otherExams.filter((e) => e.timeslot_id === slot.id);

  // Rule 1 — venue double booking
  const venueClash = examsInSlot.find((e) => e.venue_id === request.venueId);
  if (venueClash) {
    const clashModule = ctx.modules.get(venueClash.module_id);
    conflicts.push({
      code: "VENUE_DOUBLE_BOOKED",
      severity: "blocking",
      reason: `${venue?.name ?? "The venue"} is already booked in this timeslot.`,
      conflictingModule: clashModule ? { id: clashModule.id, code: clashModule.code, name: clashModule.name } : null,
      conflictingTimeslot: describeTimeslot(slot),
      conflictingVenue: venue ? { id: venue.id, code: venue.code, name: venue.name } : null,
    });
  }

  // Rule 2 — invigilator double booking
  if (request.invigilatorId) {
    const invigilatorClash = examsInSlot.find((e) => e.invigilator_id === request.invigilatorId);
    if (invigilatorClash) {
      const clashModule = ctx.modules.get(invigilatorClash.module_id);
      const lecturer = ctx.lecturers.find((l) => l.id === request.invigilatorId);
      conflicts.push({
        code: "INVIGILATOR_DOUBLE_BOOKED",
        severity: "blocking",
        reason: `${lecturer?.full_name ?? "The invigilator"} is already invigilating another examination in this timeslot.`,
        conflictingModule: clashModule ? { id: clashModule.id, code: clashModule.code, name: clashModule.name } : null,
        conflictingTimeslot: describeTimeslot(slot),
      });
    }
  }

  // Rule 3 — venue capacity
  if (!venue) {
    conflicts.push({ code: "VENUE_CAPACITY", severity: "blocking", reason: "The selected venue could not be found." });
  } else if (venue.capacity < enrolledStudents) {
    conflicts.push({
      code: "VENUE_CAPACITY",
      severity: "blocking",
      reason: `${venue.name} seats ${venue.capacity} but ${enrolledStudents} students are enrolled for ${module?.code ?? "this module"}.`,
      conflictingVenue: { id: venue.id, code: venue.code, name: venue.name },
    });
  }

  // Rule 5 — student clash detection, based on ACTUAL enrolments (not year level)
  const enrolledIds = new Map(enrolments.map((e) => [e.student_id, e.is_repeat]));
  for (const exam of examsInSlot) {
    const otherEnrolments = ctx.enrolmentsByModule.get(exam.module_id) ?? [];
    const affected: AffectedStudent[] = [];
    for (const other of otherEnrolments) {
      if (!enrolledIds.has(other.student_id)) continue;
      const student = ctx.students.get(other.student_id);
      if (!student) continue;
      affected.push({
        id: student.id,
        studentNumber: student.student_number,
        fullName: student.full_name,
        isRepeat: Boolean(enrolledIds.get(other.student_id)) || other.is_repeat,
      });
    }
    if (affected.length > 0) {
      const clashModule = ctx.modules.get(exam.module_id);
      conflicts.push({
        code: "STUDENT_CLASH",
        severity: "blocking",
        reason: `${affected.length} student(s) enrolled for ${module?.code ?? "this module"} are also writing ${clashModule?.code ?? "another module"} in this timeslot.`,
        conflictingModule: clashModule ? { id: clashModule.id, code: clashModule.code, name: clashModule.name } : null,
        conflictingTimeslot: describeTimeslot(slot),
        affectedStudents: affected,
      });
    }
  }

  return { conflicts, enrolledStudents, venueCapacity };
}

/** Suggests alternative timeslot/venue pairs that satisfy every rule. */
export function suggestAlternatives(
  ctx: SchedulingContext,
  request: ScheduleRequest,
  limit = 6,
): SchedulingSuggestion[] {
  const enrolled = (ctx.enrolmentsByModule.get(request.moduleId) ?? []).length;
  const candidateVenues = ctx.venues
    .filter((v) => v.is_active && v.capacity >= enrolled)
    .sort((a, b) => a.capacity - b.capacity);
  const suggestions: SchedulingSuggestion[] = [];

  for (const slot of ctx.timeslots) {
    for (const venue of candidateVenues) {
      const candidate: ScheduleRequest = { ...request, timeslotId: slot.id, venueId: venue.id };
      const { conflicts } = evaluateRequest(ctx, candidate);
      const blocking = conflicts.filter((c) => c.code !== "DUPLICATE_EXAM");
      if (blocking.length > 0) continue;

      let invigilatorId = request.invigilatorId ?? null;
      let invigilatorName: string | null = null;
      if (invigilatorId) {
        const taken = ctx.exams.some(
          (e) => e.id !== request.examId && e.timeslot_id === slot.id && e.invigilator_id === invigilatorId,
        );
        if (taken) {
          const free = ctx.lecturers.find(
            (l) => !ctx.exams.some((e) => e.timeslot_id === slot.id && e.invigilator_id === l.id),
          );
          invigilatorId = free?.id ?? null;
          invigilatorName = free?.full_name ?? null;
        } else {
          invigilatorName = ctx.lecturers.find((l) => l.id === invigilatorId)?.full_name ?? null;
        }
      }

      const utilisation = enrolled === 0 ? 0 : enrolled / venue.capacity;
      suggestions.push({
        timeslotId: slot.id,
        timeslotLabel: slot.label,
        date: slot.slot_date,
        startTime: slot.start_time,
        endTime: slot.end_time,
        venueId: venue.id,
        venueName: venue.name,
        venueCapacity: venue.capacity,
        invigilatorId,
        invigilatorName,
        score: Math.round(utilisation * 100),
      });
      break; // one venue suggestion per timeslot keeps the list readable
    }
    if (suggestions.length >= limit) break;
  }

  return suggestions;
}

export function validateRequest(ctx: SchedulingContext, request: ScheduleRequest): ValidationResult {
  const { conflicts, enrolledStudents, venueCapacity } = evaluateRequest(ctx, request);
  return {
    valid: conflicts.length === 0,
    enrolledStudents,
    venueCapacity,
    conflicts,
    suggestions: conflicts.length === 0 ? [] : suggestAlternatives(ctx, request),
  };
}
