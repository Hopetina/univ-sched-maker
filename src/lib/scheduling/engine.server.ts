// Scheduling engine: composes the individual rule services over a prefetched context.
import type { Repositories } from "../db/repositories.server";
import {
  checkCapacityConflict,
  checkDuplicateExam,
  checkHolidayRules,
  checkInvigilatorConflict,
  checkStudentConflict,
  checkVenueConflict,
} from "./rules.server";
import type {
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

/**
 * Evaluates EVERY business rule for one requested placement and returns the full
 * list of conflicts — evaluation never stops at the first failure.
 */
export function evaluateRequest(
  ctx: SchedulingContext,
  request: ScheduleRequest,
): { conflicts: Conflict[]; enrolledStudents: number; venueCapacity: number } {
  const slot = ctx.timeslots.find((t) => t.id === request.timeslotId);
  const venue = ctx.venues.find((v) => v.id === request.venueId);
  const enrolledStudents = (ctx.enrolmentsByModule.get(request.moduleId) ?? []).length;
  const venueCapacity = venue?.capacity ?? 0;

  if (!slot || slot.exam_period_id !== ctx.period.id) {
    return {
      conflicts: [
        {
          code: "TIMESLOT_NOT_IN_PERIOD",
          severity: "blocking",
          reason: "The selected timeslot does not belong to the selected examination period.",
        },
      ],
      enrolledStudents,
      venueCapacity,
    };
  }

  const conflicts: Conflict[] = [
    ...checkHolidayRules(ctx, slot),
    ...checkDuplicateExam(ctx, request),
    ...checkVenueConflict(ctx, request, slot),
    ...checkInvigilatorConflict(ctx, request, slot),
    ...checkCapacityConflict(ctx, request),
    ...checkStudentConflict(ctx, request, slot),
  ];

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
