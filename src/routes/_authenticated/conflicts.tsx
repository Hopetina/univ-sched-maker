import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, CalendarClock, GraduationCap, Layers } from "lucide-react";

import type { ValidationResult } from "@/lib/scheduling/types";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const CONFLICT_STORAGE_KEY = "examsched:last-conflict-report";

export type StoredConflictReport = {
  moduleLabel: string;
  timeslotLabel: string;
  venueLabel: string;
  checkedAt: string;
  result: ValidationResult;
};

export const Route = createFileRoute("/_authenticated/conflicts")({
  head: () => ({
    meta: [
      { title: "Conflict details — ExamSched" },
      {
        name: "description",
        content:
          "Full breakdown of scheduling conflicts: affected students, conflicting modules and recommended alternative timeslots.",
      },
      { property: "og:title", content: "Conflict details — ExamSched" },
      { property: "og:description", content: "Affected students, conflicting modules and recommended timeslots." },
    ],
  }),
  component: ConflictDetailsPage,
});

function ConflictDetailsPage() {
  const [report, setReport] = useState<StoredConflictReport | null>(null);

  useEffect(() => {
    const raw = window.sessionStorage.getItem(CONFLICT_STORAGE_KEY);
    if (raw) {
      try {
        setReport(JSON.parse(raw) as StoredConflictReport);
      } catch {
        setReport(null);
      }
    }
  }, []);

  const result = report?.result ?? null;
  const students = dedupeStudents(result);
  const modules = dedupeModules(result);

  return (
    <div>
      <PageHeader
        title="Conflict details"
        description="Every rule violation for the last validated scheduling request, with the students and modules involved and conflict-free alternatives."
      />

      <div className="mb-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/schedule">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to scheduling engine
          </Link>
        </Button>
      </div>

      {!report || !result ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No conflict report yet. Validate or submit a scheduling request and any conflicts will appear here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Request under review</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
              <Detail label="Module" value={report.moduleLabel} />
              <Detail label="Timeslot" value={report.timeslotLabel} />
              <Detail label="Venue" value={report.venueLabel} />
              <Detail label="Enrolled students" value={String(result.enrolledStudents)} />
              <Detail label="Venue capacity" value={String(result.venueCapacity)} />
              <Detail label="Checked" value={new Date(report.checkedAt).toLocaleString()} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                {result.conflicts.length} rule violation(s)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.conflicts.length === 0 ? (
                <p className="text-sm">This placement satisfied every rule.</p>
              ) : (
                result.conflicts.map((conflict, index) => (
                  <div key={index} className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="destructive">{conflict.code.replaceAll("_", " ")}</Badge>
                      {conflict.conflictingModule ? (
                        <Badge variant="outline">Module: {conflict.conflictingModule.code}</Badge>
                      ) : null}
                      {conflict.conflictingVenue ? (
                        <Badge variant="outline">Venue: {conflict.conflictingVenue.name}</Badge>
                      ) : null}
                      {conflict.conflictingTimeslot ? (
                        <Badge variant="outline">
                          {conflict.conflictingTimeslot.date} {conflict.conflictingTimeslot.startTime.slice(0, 5)}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm">{conflict.reason}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <GraduationCap className="h-4 w-4" /> Conflicting students ({students.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {students.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No student is double-booked by this request.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {students.map((student) => (
                      <li key={student.id} className="flex items-center justify-between gap-2">
                        <span>
                          <span className="font-medium">{student.studentNumber}</span> — {student.fullName}
                        </span>
                        {student.isRepeat ? <Badge variant="secondary">Repeat enrolment</Badge> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Layers className="h-4 w-4" /> Conflicting modules ({modules.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {modules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No other module is implicated.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {modules.map((module) => (
                      <li key={module.id}>
                        <span className="font-medium">{module.code}</span> — {module.name}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <CalendarClock className="h-4 w-4" /> Recommended timeslots ({result.suggestions.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No alternative slot in this period satisfies every rule. Add timeslots or venues.
                </p>
              ) : (
                result.suggestions.map((suggestion) => (
                  <div
                    key={`${suggestion.timeslotId}-${suggestion.venueId}`}
                    className="rounded-md border border-border p-3 text-sm"
                  >
                    <p className="font-medium">
                      {suggestion.date} · {suggestion.startTime.slice(0, 5)}–{suggestion.endTime.slice(0, 5)} (
                      {suggestion.timeslotLabel})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {suggestion.venueName} · seats {suggestion.venueCapacity} · {suggestion.score}% utilisation
                      {suggestion.invigilatorName ? ` · ${suggestion.invigilatorName}` : ""}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function dedupeStudents(result: ValidationResult | null) {
  const map = new Map<string, { id: string; studentNumber: string; fullName: string; isRepeat: boolean }>();
  for (const conflict of result?.conflicts ?? []) {
    for (const student of conflict.affectedStudents ?? []) {
      const existing = map.get(student.id);
      map.set(student.id, { ...student, isRepeat: student.isRepeat || Boolean(existing?.isRepeat) });
    }
  }
  return [...map.values()].sort((a, b) => a.studentNumber.localeCompare(b.studentNumber));
}

function dedupeModules(result: ValidationResult | null) {
  const map = new Map<string, { id: string; code: string; name: string }>();
  for (const conflict of result?.conflicts ?? []) {
    if (conflict.conflictingModule) map.set(conflict.conflictingModule.id, conflict.conflictingModule);
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}
