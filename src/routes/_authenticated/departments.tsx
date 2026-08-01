import { createFileRoute } from "@tanstack/react-router";
import { CrudPage, lookup, type Row } from "@/components/crud-page";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/departments")({
  head: () => ({
    meta: [
      { title: "Departments — ExamSched" },
      { name: "description", content: "Departments belong to a faculty and own modules, lecturers and students." },
      { property: "og:title", content: "Departments — ExamSched" },
      { property: "og:description", content: "Departments belong to a faculty and own modules, lecturers and students." },
    ],
  }),
  component: Page,
});

function Page() {
  const { isAdmin, isSystemAdmin } = useSession();
  return (
    <CrudPage
      table="departments"
      title="Departments"
      description="Departments belong to a faculty and own modules, lecturers and students."
      orderBy="code"
      refs={["faculties"]}
      canWrite={isSystemAdmin}
      columns={(refs) => ([{ key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "faculty_id", label: "Faculty", render: (r: Row) => lookup(refs["faculties"], r["faculty_id"]) }])}
      fields={(refs) => ([{ name: "code", label: "Code", type: "text", required: true }, { name: "name", label: "Name", type: "text", required: true }, { name: "faculty_id", label: "Faculty", type: "select", required: true, options: (refs["faculties"] ?? []).map((f: Row) => ({ value: f["id"], label: f["name"] })) }])}
    />
  );
}
