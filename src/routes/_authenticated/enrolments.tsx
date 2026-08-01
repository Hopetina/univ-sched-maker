import { createFileRoute } from "@tanstack/react-router";
import { CrudPage, lookup, type Row } from "@/components/crud-page";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/enrolments")({
  head: () => ({
    meta: [
      { title: "Enrolments — ExamSched" },
      { name: "description", content: "Actual student-module enrolments — the single source of truth for clash detection." },
      { property: "og:title", content: "Enrolments — ExamSched" },
      { property: "og:description", content: "Actual student-module enrolments — the single source of truth for clash detection." },
    ],
  }),
  component: Page,
});

function Page() {
  const { isAdmin, isSystemAdmin } = useSession();
  return (
    <CrudPage
      table="student_modules"
      title="Enrolments"
      description="Actual student-module enrolments — the single source of truth for clash detection."
      orderBy="created_at"
      refs={["students", "modules"]}
      canWrite={isAdmin}
      columns={(refs) => ([{ key: "student_id", label: "Student", render: (r: Row) => lookup(refs["students"], r["student_id"], "full_name") }, { key: "module_id", label: "Module", render: (r: Row) => lookup(refs["modules"], r["module_id"], "code") }, { key: "academic_year", label: "Year" }, { key: "is_repeat", label: "Repeat", render: (r: Row) => (r["is_repeat"] ? "Yes" : "No") }])}
      fields={(refs) => ([{ name: "student_id", label: "Student", type: "select", required: true, options: (refs["students"] ?? []).map((s: Row) => ({ value: s["id"], label: `${s["student_number"]} — ${s["full_name"]}` })) }, { name: "module_id", label: "Module", type: "select", required: true, options: (refs["modules"] ?? []).map((m: Row) => ({ value: m["id"], label: `${m["code"]} — ${m["name"]}` })) }, { name: "academic_year", label: "Academic year", type: "number", defaultValue: 2026 }, { name: "is_repeat", label: "Repeating module", type: "checkbox", defaultValue: false }])}
    />
  );
}
