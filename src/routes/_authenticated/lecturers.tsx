import { createFileRoute } from "@tanstack/react-router";
import { CrudPage, lookup, type Row } from "@/components/crud-page";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/lecturers")({
  head: () => ({
    meta: [
      { title: "Lecturers — ExamSched" },
      { name: "description", content: "Academic staff who lecture modules and invigilate examinations." },
      { property: "og:title", content: "Lecturers — ExamSched" },
      { property: "og:description", content: "Academic staff who lecture modules and invigilate examinations." },
    ],
  }),
  component: Page,
});

function Page() {
  const { isAdmin, isSystemAdmin } = useSession();
  return (
    <CrudPage
      table="lecturers"
      title="Lecturers"
      description="Academic staff who lecture modules and invigilate examinations."
      orderBy="staff_number"
      refs={["departments"]}
      canWrite={isAdmin}
      searchPlaceholder="Search name or staff number"
      searchText={(r: Row) => `${r["full_name"]} ${r["staff_number"]} ${r["email"]}`}
      filters={(refs) => ([{ key: "department_id", label: "Department", options: (refs["departments"] ?? []).map((d: Row) => ({ value: d["id"], label: d["name"] })) }])}
      columns={(refs) => ([{ key: "staff_number", label: "Staff no." }, { key: "full_name", label: "Name" }, { key: "email", label: "Email" }, { key: "department_id", label: "Department", render: (r: Row) => lookup(refs["departments"], r["department_id"]) }])}
      fields={(refs) => ([{ name: "staff_number", label: "Staff number", type: "text", required: true }, { name: "full_name", label: "Full name", type: "text", required: true }, { name: "email", label: "Email", type: "text", required: true }, { name: "department_id", label: "Department", type: "select", required: true, options: (refs["departments"] ?? []).map((d: Row) => ({ value: d["id"], label: d["name"] })) }])}

    />
  );
}
