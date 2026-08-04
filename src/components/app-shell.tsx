import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  Building2,
  FileDown,

  CalendarClock,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MapPin,
  ScrollText,
  Sparkles,
  Users,
  UserSquare2,
} from "lucide-react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type NavItem = { to: string; label: string; icon: typeof Users; access: "admin" | "sysadmin" | "any" };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, access: "any" },
      { to: "/my-timetable", label: "My timetable", icon: CalendarDays, access: "any" },
      { to: "/analytics", label: "Analytics", icon: BarChart3, access: "admin" },
      { to: "/reports", label: "Timetable reports", icon: FileDown, access: "admin" },
    ],
  },

  {
    group: "Scheduling",
    items: [
      { to: "/schedule", label: "Scheduling engine", icon: Sparkles, access: "admin" },
      { to: "/exams", label: "Exams", icon: ClipboardList, access: "admin" },
      { to: "/exam-periods", label: "Exam periods", icon: CalendarClock, access: "sysadmin" },
      { to: "/timeslots", label: "Timeslots", icon: CalendarDays, access: "sysadmin" },
      { to: "/holidays", label: "Public holidays", icon: CalendarDays, access: "sysadmin" },
    ],
  },
  {
    group: "Academic structure",
    items: [
      { to: "/faculties", label: "Faculties", icon: Building2, access: "sysadmin" },
      { to: "/departments", label: "Departments", icon: Building2, access: "sysadmin" },
      { to: "/venues", label: "Venues", icon: MapPin, access: "sysadmin" },
      { to: "/modules", label: "Modules", icon: BookOpen, access: "admin" },
      { to: "/lecturers", label: "Lecturers", icon: UserSquare2, access: "admin" },
      { to: "/students", label: "Students", icon: GraduationCap, access: "admin" },
      { to: "/enrolments", label: "Enrolments", icon: Users, access: "admin" },
    ],
  },
  {
    group: "Governance",
    items: [{ to: "/audit", label: "Audit trail", icon: ScrollText, access: "admin" }],
  },
];

const ROLE_LABEL: Record<string, string> = {
  system_admin: "System Admin",
  department_admin: "Department Admin",
  lecturer: "Lecturer",
  student: "Student",
};

export function AppShell({ children }: { children: ReactNode }) {
  const { session, isAdmin, isSystemAdmin } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const visible = (item: NavItem) =>
    item.access === "any" || (item.access === "admin" && isAdmin) || (item.access === "sysadmin" && isSystemAdmin);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-primary text-primary-foreground lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="font-display text-lg font-bold">ExamSched</p>
          <p className="text-xs text-primary-foreground/70">Examination Scheduling Engine</p>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {NAV.map((group) => {
            const items = group.items.filter(visible);
            if (items.length === 0) return null;
            return (
              <div key={group.group}>
                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/50">
                  {group.group}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.to;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                          active
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-primary-foreground/80 hover:bg-white/10",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4 text-xs">
          <p className="truncate font-medium">{session?.fullName || session?.email}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {(session?.roles ?? []).map((role) => (
              <Badge key={role} variant="secondary" className="text-[10px]">
                {ROLE_LABEL[role] ?? role}
              </Badge>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="mt-3 w-full justify-start text-primary-foreground/80 hover:bg-white/10">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-3 lg:hidden">
          <span className="font-display font-bold">ExamSched</span>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </header>
        <div className="overflow-x-auto border-b border-border bg-card px-3 py-2 lg:hidden">
          <div className="flex gap-1">
            {NAV.flatMap((g) => g.items)
              .filter(visible)
              .map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs",
                    pathname === item.to ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
          </div>
        </div>
        <main className="flex-1 p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
