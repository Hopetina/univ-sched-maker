// Shared (client-safe) types for the scheduling engine.

export type ConflictCode =
  | "TIMESLOT_NOT_IN_PERIOD"
  | "WEEKEND_RESTRICTION"
  | "PUBLIC_HOLIDAY"
  | "DUPLICATE_EXAM"
  | "VENUE_DOUBLE_BOOKED"
  | "INVIGILATOR_DOUBLE_BOOKED"
  | "VENUE_CAPACITY"
  | "STUDENT_CLASH";

export interface AffectedStudent {
  id: string;
  studentNumber: string;
  fullName: string;
  isRepeat: boolean;
}

export interface Conflict {
  code: ConflictCode;
  severity: "blocking";
  reason: string;
  conflictingModule?: { id: string; code: string; name: string } | null;
  conflictingTimeslot?: { id: string; date: string; startTime: string; endTime: string; label: string } | null;
  conflictingVenue?: { id: string; code: string; name: string } | null;
  affectedStudents?: AffectedStudent[];
}

export interface SchedulingSuggestion {
  timeslotId: string;
  timeslotLabel: string;
  date: string;
  startTime: string;
  endTime: string;
  venueId: string;
  venueName: string;
  venueCapacity: number;
  invigilatorId: string | null;
  invigilatorName: string | null;
  score: number;
}

export interface ValidationResult {
  valid: boolean;
  enrolledStudents: number;
  venueCapacity: number;
  conflicts: Conflict[];
  suggestions: SchedulingSuggestion[];
}

export interface ScheduleRequest {
  moduleId: string;
  examPeriodId: string;
  timeslotId: string;
  venueId: string;
  invigilatorId?: string | null;
  examId?: string | null;
  notes?: string;
}
