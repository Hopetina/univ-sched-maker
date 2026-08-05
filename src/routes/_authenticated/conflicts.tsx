import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Pencil, RefreshCw, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { getConflictDashboard, listRows, submitSchedule } from "@/lib/exam.functions";
import type { ConflictSummaryItem, SchedulingSuggestion } from "@/lib/scheduling/types";
import { useSession } from "@/hooks/use-session";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/conflicts")({
  head: () => ({
    meta: [
      { title: "Conflicts — ExamSched" },
      { name: "description", content: "Review and resolve examination scheduling conflicts." },
      { property: "og:title", content: "Conflicts — ExamSched" },
      { property: "og:description", content: "Review and resolve examination scheduling conflicts." },
    ],
  }),
  component: Page,
});

function Page() {
  const { isAdmin } = useSession();
  const list = useServerFn(listRows);
  const dashboard = useServerFn(getConflictDashboard);
  const apply = useServerFn(submitSchedule);
  const queryClient = useQueryClient();

  const { data: periods } = useQuery({
    queryKey: ["rows", "exam_periods"],
    queryFn: () => list({ data: { table: "exam_periods" as never, orderBy: "start_date" } }) as Promise<{ id: string; name: string }[]>,
  });
  const [periodId, setPeriodId] = useState("");
  const activePeriod = periodId || periods?.[0]?.id || "";

  const { data: items, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["conflict-dashboard", activePeriod],
    queryFn: () => dashboard({ data: { examPeriodId: activePeriod } }) as Promise<ConflictSummaryItem[]>,
    enabled: Boolean(activePeriod),
  });

  const applyMutation = useMutation({
    mutationFn: (vars: { item: ConflictSummaryItem; suggestion: SchedulingSuggestion }) =>
      apply({
        data: {
          moduleId: vars.item.moduleId,
          examPeriodId: vars.item.examPeriodId,
          examId: vars.item.examId,
          timeslotId: vars.suggestion.timeslotId,
          venueId: vars.suggestion.venueId,
          invigilatorId: vars.suggestion.invigilatorId ?? null,
        },
      }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Suggestion applied — exam rescheduled");
        queryClient.invalidateQueries({ queryKey: ["conflict-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["rows"] });
        queryClient.invalidateQueries({ queryKey: ["scheduling-data"] });
      } else {
        toast.error("The suggestion is no longer conflict-free — revalidate and try another.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return <PageHeader title="Conflicts" description="Only administrators may view the conflicts dashboard." />;
  }

  return (
    <div>
      <PageHeader
        title="Conflicts"
        description="Every currently scheduled examination in this period, re-checked live against the same scheduling engine used everywhere else in ExamSched."
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Exam period</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="max-w-sm flex-1 space-y-1">
            <Label className="text-xs">Exam period</Label>
            <Select value={activePeriod} onValueChange={setPeriodId}>
              <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
              <SelectContent>
                {(periods ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" disabled={!activePeriod || isFetching} onClick={() => refetch()}>
            <RefreshCw className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`} /> Revalidate
          </Button>
        </CardContent>
      </Card>

      <div className="mt-4 space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !activePeriod ? (
          <p className="text-sm text-muted-foreground">Select an exam period to sweep for conflicts.</p>
        ) : (items ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No conflicts — every scheduled examination in this period satisfies all rules.
            </CardContent>
          </Card>
        ) : (
          (items ?? []).map((item) => (
            <Card key={item.examId}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 font-display text-base">
                  <AlertTriangle className="size-4 text-destructive" />
                  {item.moduleCode} — {item.moduleName}
                  <Badge variant="outline">
                    {item.date} {item.startTime.slice(0, 5)}–{item.endTime.slice(0, 5)} ({item.timeslotLabel})
                  </Badge>
                  <Badge variant="outline">{item.venueName}</Badge>
                  {item.affectedStudentCount > 0 ? (
                    <Badge variant="destructive">{item.affectedStudentCount} student(s) affected</Badge>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {item.conflicts.map((conflict, i) => (
                    <div key={i} className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="destructive">{conflict.code.replaceAll("_", " ")}</Badge>
                        {conflict.conflictingModule ? (
                          <Badge variant="outline">vs. {conflict.conflictingModule.code}</Badge>
                        ) : null}
                        {conflict.conflictingVenue ? (
                          <Badge variant="outline">Venue: {conflict.conflictingVenue.name}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1">{conflict.reason}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Wand2 className="size-3.5" /> Suggested timeslots &amp; venues
                  </p>
                  {item.suggestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No conflict-free alternative found. Add timeslots or venues.</p>
                  ) : (
                    <div className="space-y-2">
                      {item.suggestions.map((suggestion) => (
                        <div
                          key={`${suggestion.timeslotId}-${suggestion.venueId}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
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
                            disabled={applyMutation.isPending}
                            onClick={() => applyMutation.mutate({ item, suggestion })}
                          >
                            Apply suggestion
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Link
                    to="/schedule"
                    search={{
                      examId: item.examId,
                      moduleId: item.moduleId,
                      periodId: item.examPeriodId,
                      timeslotId: item.timeslotId,
                      venueId: item.venueId,
                      invigilatorId: item.invigilatorId ?? undefined,
                    } as never}
                  >
                    <Button variant="outline" size="sm">
                      <Pencil className="mr-2 size-3.5" /> Edit exam
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
