// Service layer: orchestrates repositories + scheduling engine + audit logging.
import type { Repositories } from "../db/repositories.server";
import { evaluateRequest, loadSchedulingContext, suggestAlternatives, validateRequest } from "./engine.server";
import type { ConflictSummaryItem, ScheduleRequest, ValidationResult } from "./types";

export interface Actor {
  userId: string;
  email: string;
}

export async function writeAudit(
  repos: Repositories,
  actor: Actor,
  entry: {
    action: string;
    entity: string;
    entityId?: string | null;
    outcome?: "success" | "rejected" | "failure";
    details?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await repos.auditLogs.create({
      actor_id: actor.userId,
      actor_email: actor.email,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      outcome: entry.outcome ?? "success",
      details: entry.details ?? {},
    });
  } catch (error) {
    console.error("audit write failed", error);
  }
}

export async function validateScheduleRequest(
  repos: Repositories,
  request: ScheduleRequest,
): Promise<ValidationResult> {
  const ctx = await loadSchedulingContext(repos, request.examPeriodId);
  return validateRequest(ctx, request);
}

export async function scheduleExam(
  repos: Repositories,
  actor: Actor,
  request: ScheduleRequest,
): Promise<{ ok: boolean; examId?: string; validation: ValidationResult }> {
  const ctx = await loadSchedulingContext(repos, request.examPeriodId);
  const validation = validateRequest(ctx, request);

  if (!validation.valid) {
    await writeAudit(repos, actor, {
      action: request.examId ? "exam.reschedule" : "exam.schedule",
      entity: "exams",
      entityId: request.examId ?? null,
      outcome: "rejected",
      details: {
        request,
        conflicts: validation.conflicts.map((c) => ({ code: c.code, reason: c.reason })),
      },
    });
    return { ok: false, validation };
  }

  const values = {
    module_id: request.moduleId,
    exam_period_id: request.examPeriodId,
    timeslot_id: request.timeslotId,
    venue_id: request.venueId,
    invigilator_id: request.invigilatorId ?? null,
    expected_students: validation.enrolledStudents,
    notes: request.notes ?? "",
    created_by: actor.userId,
    status: "scheduled",
  };

  const exam = request.examId
    ? await repos.exams.update(request.examId, values)
    : await repos.exams.create(values);

  await writeAudit(repos, actor, {
    action: request.examId ? "exam.reschedule" : "exam.schedule",
    entity: "exams",
    entityId: exam.id,
    outcome: "success",
    details: { request, expectedStudents: validation.enrolledStudents },
  });

  return { ok: true, examId: exam.id, validation };
}

/**
 * Sweeps every currently-scheduled exam in a period through the same engine used for
 * new requests (evaluateRequest excludes the exam's own row via examId), surfacing only
 * the ones that now have blocking conflicts, plus conflict-free suggestions for each.
 */
export async function sweepConflicts(repos: Repositories, examPeriodId: string): Promise<ConflictSummaryItem[]> {
  const ctx = await loadSchedulingContext(repos, examPeriodId);
  const items: ConflictSummaryItem[] = [];

  for (const exam of ctx.exams) {
    const request: ScheduleRequest = {
      moduleId: exam.module_id,
      examPeriodId,
      timeslotId: exam.timeslot_id,
      venueId: exam.venue_id,
      invigilatorId: exam.invigilator_id,
      examId: exam.id,
    };
    const { conflicts } = evaluateRequest(ctx, request);
    if (conflicts.length === 0) continue;

    const module = ctx.modules.get(exam.module_id);
    const slot = ctx.timeslots.find((t) => t.id === exam.timeslot_id);
    const venue = ctx.venues.find((v) => v.id === exam.venue_id);
    const suggestions = suggestAlternatives(ctx, request);

    const affected = new Set<string>();
    for (const conflict of conflicts) {
      for (const student of conflict.affectedStudents ?? []) affected.add(student.id);
    }

    items.push({
      examId: exam.id,
      moduleId: exam.module_id,
      moduleCode: module?.code ?? "",
      moduleName: module?.name ?? "",
      examPeriodId,
      timeslotId: exam.timeslot_id,
      timeslotLabel: slot?.label ?? "",
      date: slot?.slot_date ?? "",
      startTime: slot?.start_time ?? "",
      endTime: slot?.end_time ?? "",
      venueId: exam.venue_id,
      venueName: venue?.name ?? "",
      invigilatorId: exam.invigilator_id,
      affectedStudentCount: affected.size,
      conflicts,
      suggestions,
    });
  }

  return items;
}
