import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, ShieldCheck, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ExamSched — Conflict-Free University Exam Scheduling" },
      {
        name: "description",
        content:
          "Schedule university examinations with enrolment-based clash detection, venue capacity checks, invigilator rules and a full audit trail.",
      },
      { property: "og:title", content: "ExamSched — Conflict-Free University Exam Scheduling" },
      {
        property: "og:description",
        content: "Schedule university examinations with enrolment-based clash detection, venue capacity checks, invigilator rules and a full audit trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Sparkles,
    title: "Scheduling engine",
    body: "Every booking passes seven business rules before it is written. Rejections come with reasons, conflicting modules, timeslots and the exact students affected.",
  },
  {
    icon: Users,
    title: "Enrolment-based clash detection",
    body: "Clashes are computed from actual StudentModule enrolments — a second-year repeating a first-year module is caught, year level is never used.",
  },
  {
    icon: CalendarClock,
    title: "Intelligent alternatives",
    body: "When a slot fails, the engine proposes alternative timeslot and venue pairs that satisfy every rule, ranked by venue utilisation.",
  },
  {
    icon: ShieldCheck,
    title: "Governance",
    body: "Role-based access for System Admins, Department Admins, Lecturers and Students, with an immutable audit trail of accepted and rejected requests.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <span className="font-display text-lg font-bold">ExamSched</span>
          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          University Examination Scheduling System
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight lg:text-5xl">
          Examination timetables that cannot clash.
        </h1>
        <p className="mt-5 max-w-2xl text-base text-muted-foreground">
          Department administrators submit scheduling requests; the engine validates venue capacity, double bookings,
          invigilator availability, holidays, weekends and real student enrolment overlaps before anything is saved.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Enter the system</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-2">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold">{feature.title}</h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-8 text-xs text-muted-foreground">
          ExamSched — layered architecture: repositories, services, scheduling engine, audit logging.
        </div>
      </footer>
    </div>
  );
}
