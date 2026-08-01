import { createFileRoute } from "@tanstack/react-router";
import { CrudPage, lookup, type Row } from "@/components/crud-page";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/modules")({
  head: () => ({
    meta: [
      { title: "Modules — ExamSched" },
      { name: "description", content: "Modules offered by departments, each examinable once per exam period." },
      { property: "og:title", content: "Modules — ExamSched" },
      { property: "og:description", content: "Modules offered by departments, each examinable once per exam period." },
    ],
  }),
  component: Page,
});

function Page() {
  const { isAdmin, isSystemAdmin } = useSession();
  return (
    <CrudPage
      table="modules"
      title="Modules"
      description="Modules offered by departments, each examinable once per exam period."
      orderBy="code"
      refs={["departments", "lecturers"]}
      canWrite={isAdmin}
      columns={(refs) => ([{ key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "nqf_level", label: "Level" }, { key: "duration_minutes", label: "Duration (min)" }, { key: "department_id", label: "Department", render: (r: Row) => lookup(refs["departments"], r["department_id"]) }, { key: "lecturer_id", label: "Lecturer", render: (r: Row) => lookup(refs["lecturers"], r["lecturer_id"], "full_name") }])}
      fields={(refs) => ([{ name: "code", label: "Code", type: "text", required: true }, { name: "name", label: "Name", type: "text", required: true }, { name: "nqf_level", label: "NQF level", type: "number", defaultValue: 5 }, { name: "duration_minutes", label: "Duration (minutes)", type: "number", defaultValue: 180 }, { name: "department_id", label: "Department", type: "select", required: true, options: (refs["departments"] ?? []).map((d: Row) => ({ value: d["id"], label: d["name"] })) }, { name: "lecturer_id", label: "Lecturer", type: "select", options: (refs["lecturers"] ?? []).map((l: Row) => ({ value: l["id"], label: l["full_name"] })) }])}
    />
  );
}
