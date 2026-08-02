import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, ExternalLink, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { getSchedulingData, submitSchedule, validateSchedule } from "@/lib/exam.functions";
import type { ValidationResult } from "@/lib/scheduling/types";
import { CONFLICT_STORAGE_KEY } from "@/routes/_authenticated/conflicts";
import { useSession } from "@/hooks/use-session";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({
    meta: [
      { title: "Scheduling engine — ExamSched" },
      {
        name: "description",
        content: "Submit exam scheduling requests, see detailed conflict reports and conflict-free alternatives.",
      },
      { property: "og:title", content: "Scheduling engine — ExamSched" },
      { property: "og:description", content: "Validate exam bookings against every business rule before saving." },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const { isAdmin } = useSession();
  const fetchData = useServerFn(getSchedulingData);
  const validate = useServerFn(validateSchedule);
  const submit = useServerFn(submitSchedule);
  const queryClient = useQueryClient();

  const { data } = useQuery({ queryKey: ["scheduling-data"], queryFn: () => fetchData() as Promise<any> });
  const [periodId, setPeriodId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [timeslotId, setTimeslotId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [invigilatorId, setInvigilatorId] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);

  const periods = data?.periods ?? [];
  const activePeriod = periodId || periods[0]?.id || "";
  const timeslots = useMemo(
    () => (data?.timeslots ?? []).filter((t: any) => t.exam_period_id === activePeriod),
    [data, activePeriod],
  );
  const enrolled = data?.enrolmentCounts?.[moduleId] ?? 0;

  const request = {
    moduleId,
    examPeriodId: activePeriod,
    timeslotId,
    venueId,
    invigilatorId: invigilatorId || null,
  };

  const persist = (res: ValidationResult | null) => {
    if (!res) return;
    const slot = timeslots.find((t: any) => t.id === timeslotId);
    const module = (data?.modules ?? []).find((m: any) => m.id === moduleId);
    const venue = (data?.venues ?? []).find((v: any) => v.id === venueId);
    window.sessionStorage.setItem(
      CONFLICT_STORAGE_KEY,
      JSON.stringify({
        moduleLabel: module ? `${module.code} — ${module.name}` : "",
        timeslotLabel: slot
          ? `${slot.slot_date} · ${String(slot.start_time).slice(0, 5)}–${String(slot.end_time).slice(0, 5)}`
          : "",
        venueLabel: venue ? `${venue.name} (seats ${venue.capacity})` : "",
        checkedAt: new Date().toISOString(),
        result: res,
      }),
    );
  };

  const check = useMutation({
    mutationFn: () => validate({ data: request }) as Promise<ValidationResult>,
    onSuccess: (res) => {
      setResult(res);
      persist(res);
      toast[res.valid ? "success" : "error"](
        res.valid ? "No conflicts — this placement is valid" : `${res.conflicts.length} conflict(s) found`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: () => submit({ data: request }) as Promise<any>,
    onSuccess: (res) => {
      setResult(res.validation);
      persist(res.validation);
      if (res.ok) {
        toast.success("Examination scheduled");
        queryClient.invalidateQueries({ queryKey: ["scheduling-data"] });
        queryClient.invalidateQueries({ queryKey: ["rows"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      } else {
        toast.error("Rejected — see the conflict report");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });


  if (!isAdmin) {
    return <PageHeader title="Scheduling engine" description="Only administrators may schedule examinations." />;
  }

  const ready = moduleId && timeslotId && venueId && activePeriod;

  return (
    <div>
      <PageHeader
        title="Scheduling engine"
        description="Every request is validated against venue capacity, double bookings, invigilator availability, duplicates, holidays, weekends and real student enrolment overlaps."
      />

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Scheduling request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Exam period">
              <Select value={activePeriod} onValueChange={(v) => { setPeriodId(v); setTimeslotId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                <SelectContent>
                  {periods.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Module${moduleId ? ` — ${enrolled} enrolled` : ""}`}>
              <Select value={moduleId} onValueChange={setModuleId}>
                <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
                <SelectContent>
                  {(data?.modules ?? []).map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.code} — {m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Timeslot">
              <Select value={timeslotId} onValueChange={setTimeslotId}>
                <SelectTrigger><SelectValue placeholder="Select timeslot" /></SelectTrigger>
                <SelectContent>
                  {timeslots.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.slot_date} · {String(t.start_time).slice(0, 5)}–{String(t.end_time).slice(0, 5)} ({t.label})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Venue">
              <Select value={venueId} onValueChange={setVenueId}>
                <SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger>
                <SelectContent>
                  {(data?.venues ?? []).map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>{v.name} (seats {v.capacity})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Invigilator (optional)">
              <Select value={invigilatorId} onValueChange={setInvigilatorId}>
                <SelectTrigger><SelectValue placeholder="Select lecturer" /></SelectTrigger>
                <SelectContent>
                  {(data?.lecturers ?? []).map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" disabled={!ready || check.isPending} onClick={() => check.mutate()}>
                Validate
              </Button>
              <Button className="flex-1" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
                Submit
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-base">
                {result?.valid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                Conflict report
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!result ? (
                <p className="text-sm text-muted-foreground">Validate or submit a request to see the rule evaluation.</p>
              ) : result.valid ? (
                <p className="text-sm">
                  All rules satisfied. {result.enrolledStudents} enrolled student(s), venue capacity {result.venueCapacity}.
                </p>
              ) : (
                result.conflicts.map((conflict, index) => (
                  <div key={index} className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="destructive">{conflict.code.replaceAll("_", " ")}</Badge>
                      {conflict.conflictingModule ? (
                        <Badge variant="outline">Module: {conflict.conflictingModule.code}</Badge>
                      ) : null}
                      {conflict.conflictingTimeslot ? (
                        <Badge variant="outline">
                          {conflict.conflictingTimeslot.date} {conflict.conflictingTimeslot.startTime.slice(0, 5)}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm">{conflict.reason}</p>
                    {conflict.affectedStudents?.length ? (
                      <div className="mt-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Affected students
                        </p>
                        <ul className="mt-1 space-y-0.5 text-xs">
                          {conflict.affectedStudents.map((student) => (
                            <li key={student.id}>
                              {student.studentNumber} — {student.fullName}
                              {student.isRepeat ? " (repeating)" : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
              {result && !result.valid ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/conflicts">
                    View full conflict details <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : null}
            </CardContent>

          </Card>

          {result && !result.valid ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Wand2 className="h-4 w-4" /> Suggested conflict-free alternatives
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
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                    >
                      <div className="text-sm">
                        <p className="font-medium">
                          {suggestion.date} · {suggestion.startTime.slice(0, 5)}–{suggestion.endTime.slice(0, 5)} ({suggestion.timeslotLabel})
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {suggestion.venueName} · seats {suggestion.venueCapacity} · {suggestion.score}% utilisation
                          {suggestion.invigilatorName ? ` · ${suggestion.invigilatorName}` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTimeslotId(suggestion.timeslotId);
                          setVenueId(suggestion.venueId);
                          if (suggestion.invigilatorId) setInvigilatorId(suggestion.invigilatorId);
                          toast.success("Applied suggestion — submit to confirm");
                        }}
                      >
                        Apply
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
