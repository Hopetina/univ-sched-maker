import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import { getDashboard } from "@/lib/exam.functions";
import { useSession } from "@/hooks/use-session";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — ExamSched" },
      { name: "description", content: "Examination scheduling overview: periods, coverage and recent activity." },
      { property: "og:title", content: "Dashboard — ExamSched" },
      { property: "og:description", content: "Examination scheduling overview and recent activity." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchDashboard = useServerFn(getDashboard);
  const { session, isAdmin } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard() as Promise<any>,
  });

  const counts = data?.counts;
  const stats = [
    { label: "Faculties", value: counts?.faculties },
    { label: "Departments", value: counts?.departments },
    { label: "Modules", value: counts?.modules },
    { label: "Students", value: counts?.students },
    { label: "Lecturers", value: counts?.lecturers },
    { label: "Venues", value: counts?.venues },
    { label: "Timeslots", value: counts?.timeslots },
    { label: "Scheduled exams", value: counts?.exams },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome${session?.fullName ? `, ${session.fullName.split(" ")[0]}` : ""}`}
        description="Operational overview of the examination scheduling system."
        action={
          isAdmin ? (
            <Button asChild>
              <Link to="/schedule">Open scheduling engine</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/my-timetable">View my timetable</Link>
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</p>
              <p className="mt-1 font-display text-3xl font-bold">{isLoading ? "—" : (stat.value ?? 0)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Examination periods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.periods ?? []).map((period: any) => (
              <div key={period.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{period.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {period.start_date} → {period.end_date}
                  </p>
                </div>
                <Badge variant={period.allow_weekends ? "secondary" : "outline"}>
                  {period.allow_weekends ? "Weekends allowed" : "Weekdays only"}
                </Badge>
              </div>
            ))}
            {!isLoading && (data?.periods ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No examination periods defined yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.recentAudit ?? []).map((entry: any) => (
              <div key={entry.id} className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{entry.action}</p>
                  <p className="truncate text-xs text-muted-foreground">{entry.actor_email || "system"}</p>
                </div>
                <Badge variant={entry.outcome === "success" ? "secondary" : "destructive"}>{entry.outcome}</Badge>
              </div>
            ))}
            {(data?.recentAudit ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {isAdmin ? "No activity recorded yet." : "Audit activity is visible to administrators."}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
