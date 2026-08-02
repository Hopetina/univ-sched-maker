// Individual rule services. Each service is pure, independent and returns a list
// of conflicts (never throws, never stops at the first error) so that the engine
// can aggregate every violation for one scheduling request.
import type { SchedulingContext } from "./engine.server";
import type { AffectedStudent, Conflict, ScheduleRequest } from "./types";

type Timeslot = SchedulingContext["timeslots"][number];

export function describeTimeslot(slot: Timeslot) {
  return {
    id: slot.id,
    date: slot.slot_date,
    startTime: slot.start_time,
    endTime: slot.end_time,
    label: slot.label,
  };
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** Exams in the same timeslot, excluding the exam being edited. */
export function examsInTimeslot(ctx: SchedulingContext, request: ScheduleRequest, slot: Timeslot) {
  return ctx.exams.filter((e) => e.id !== request.examId && e.timeslot_id === slot.id);
}

/** Rule 1 — a venue may host only one examination per timeslot. */
export function checkVenueConflict(
  ctx: SchedulingContext,
  request: ScheduleRequest,
  slot: Timeslot,
): Conflict[] {
  const venue = ctx.venues.find((v) => v.id === request.venueId);
  const clash = examsInTimeslot(ctx, request, slot).find((e) => e.venue_id === request.venueId);
  if (!clash) return [];
  const clashModule = ctx.modules.get(clash.module_id);
  return [
    {
      code: "VENUE_DOUBLE_BOOKED",
      severity: "blocking",
      reason: `${venue?.name ?? "The venue"} is already booked in this timeslot.`,
      conflictingModule: clashModule ? { id: clashModule.id, code: clashModule.code, name: clashModule.name } : null,
      conflictingTimeslot: describeTimeslot(slot),
      conflictingVenue: venue ? { id: venue.id, code: venue.code, name: venue.name } : null,
    },
  ];
}

/** Rule 2 — an invigilator may not cover two examinations in one timeslot. */
export function checkInvigilatorConflict(
  ctx: SchedulingContext,
  request: ScheduleRequest,
  slot: Timeslot,
): Conflict[] {
  if (!request.invigilatorId) return [];
  const clash = examsInTimeslot(ctx, request, slot).find((e) => e.invigilator_id === request.invigilatorId);
  if (!clash) return [];
  const clashModule = ctx.modules.get(clash.module_id);
  const lecturer = ctx.lecturers.find((l) => l.id === request.invigilatorId);
  return [
    {
      code: "INVIGILATOR_DOUBLE_BOOKED",
      severity: "blocking",
      reason: `${lecturer?.full_name ?? "The invigilator"} is already invigilating another examination in this timeslot.`,
      conflictingModule: clashModule ? { id: clashModule.id, code: clashModule.code, name: clashModule.name } : null,
      conflictingTimeslot: describeTimeslot(slot),
    },
  ];
}

/** Rule 3 — venue capacity must cover every enrolled student. */
export function checkCapacityConflict(ctx: SchedulingContext, request: ScheduleRequest): Conflict[] {
  const venue = ctx.venues.find((v) => v.id === request.venueId);
  const module = ctx.modules.get(request.moduleId);
  const enrolled = (ctx.enrolmentsByModule.get(request.moduleId) ?? []).length;
  if (!venue) {
    return [{ code: "VENUE_CAPACITY", severity: "blocking", reason: "The selected venue could not be found." }];
  }
  if (venue.capacity >= enrolled) return [];
  return [
    {
      code: "VENUE_CAPACITY",
      severity: "blocking",
      reason: `${venue.name} seats ${venue.capacity} but ${enrolled} students are enrolled for ${module?.code ?? "this module"}.`,
      conflictingVenue: { id: venue.id, code: venue.code, name: venue.name },
    },
  ];
}

/** Rule 4 — one examination per module per examination period. */
export function checkDuplicateExam(ctx: SchedulingContext, request: ScheduleRequest): Conflict[] {
  const module = ctx.modules.get(request.moduleId);
  const duplicate = ctx.exams.find((e) => e.id !== request.examId && e.module_id === request.moduleId);
  if (!duplicate) return [];
  const dupSlot = ctx.timeslots.find((t) => t.id === duplicate.timeslot_id);
  return [
    {
      code: "DUPLICATE_EXAM",
      severity: "blocking",
      reason: `${module?.code ?? "This module"} already has an examination scheduled in ${ctx.period.name}.`,
      conflictingModule: module ? { id: module.id, code: module.code, name: module.name } : null,
      conflictingTimeslot: dupSlot ? describeTimeslot(dupSlot) : null,
    },
  ];
}

/**
 * Rule 5 — student clash detection driven by ACTUAL enrolments, never year level.
 * A repeating student enrolled for a lower-level module is therefore detected as
 * a clash against any other module they are enrolled for in the same timeslot.
 */
export function checkStudentConflict(
  ctx: SchedulingContext,
  request: ScheduleRequest,
  slot: Timeslot,
): Conflict[] {
  const module = ctx.modules.get(request.moduleId);
  const enrolments = ctx.enrolmentsByModule.get(request.moduleId) ?? [];
  const enrolledIds = new Map(enrolments.map((e) => [e.student_id, e.is_repeat]));
  const conflicts: Conflict[] = [];

  for (const exam of examsInTimeslot(ctx, request, slot)) {
    const affected: AffectedStudent[] = [];
    for (const other of ctx.enrolmentsByModule.get(exam.module_id) ?? []) {
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
    if (affected.length === 0) continue;
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
  return conflicts;
}

/** Rules 6 & 7 — gazetted public holidays and weekend restrictions. */
export function checkHolidayRules(ctx: SchedulingContext, slot: Timeslot): Conflict[] {
  const conflicts: Conflict[] = [];
  if (!ctx.period.allow_weekends && isWeekend(slot.slot_date)) {
    conflicts.push({
      code: "WEEKEND_RESTRICTION",
      severity: "blocking",
      reason: `${slot.slot_date} falls on a weekend and this exam period does not permit weekend examinations.`,
      conflictingTimeslot: describeTimeslot(slot),
    });
  }
  if (ctx.holidays.has(slot.slot_date)) {
    conflicts.push({
      code: "PUBLIC_HOLIDAY",
      severity: "blocking",
      reason: `${slot.slot_date} is a gazetted public holiday. Examinations may not be scheduled on public holidays.`,
      conflictingTimeslot: describeTimeslot(slot),
    });
  }
  return conflicts;
}
