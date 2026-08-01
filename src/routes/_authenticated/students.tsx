import { createFileRoute } from "@tanstack/react-router";
import { CrudPage, lookup, type Row } from "@/components/crud-page";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({
    meta: [
      { title: "Students — ExamSched" },
      { name: "description", content: "Registered students. Clash detection uses their enrolments, never their year level." },
      { property: "og:title", content: "Students — ExamSched" },
      { property: "og:description", content: "Registered students. Clash detection uses their enrolments, never their year level." },
    ],
  }),
  component: Page,
});

function Page() {
  const { isAdmin, isSystemAdmin } = useSession();
  return (
    <CrudPage
      table="students"
      title="Students"
      description="Registered students. Clash detection uses their enrolments, never their year level."
      orderBy="student_number"
      refs={["departments"]}
      canWrite={isAdmin}
      columns={(refs) => ([{ key: "student_number", label: "Student no." }, { key: "full_name", label: "Name" }, { key: "email", label: "Email" }, { key: "year_of_study", label: "Year" }, { key: "department_id", label: "Department", render: (r: Row) => lookup(refs["departments"], r["department_id"]) }])}
      fields={(refs) => ([{ name: "student_number", label: "Student number", type: "text", required: true }, { name: "full_name", label: "Full name", type: "text", required: true }, { name: "email", label: "Email", type: "text", required: true }, { name: "year_of_study", label: "Year of study", type: "number", defaultValue: 1 }, { name: "department_id", label: "Department", type: "select", required: true, options: (refs["departments"] ?? []).map((d: Row) => ({ value: d["id"], label: d["name"] })) }])}
    />
  );
}
