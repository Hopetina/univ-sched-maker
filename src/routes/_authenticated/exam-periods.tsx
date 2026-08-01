import { createFileRoute } from "@tanstack/react-router";
import { CrudPage, lookup, type Row } from "@/components/crud-page";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/exam-periods")({
  head: () => ({
    meta: [
      { title: "Exam periods — ExamSched" },
      { name: "description", content: "Windows in which examinations may be scheduled." },
      { property: "og:title", content: "Exam periods — ExamSched" },
      { property: "og:description", content: "Windows in which examinations may be scheduled." },
    ],
  }),
  component: Page,
});

function Page() {
  const { isAdmin, isSystemAdmin } = useSession();
  return (
    <CrudPage
      table="exam_periods"
      title="Exam periods"
      description="Windows in which examinations may be scheduled."
      orderBy="start_date"
      refs={[]}
      canWrite={isSystemAdmin}
      columns={(refs) => ([{ key: "name", label: "Name" }, { key: "start_date", label: "Start" }, { key: "end_date", label: "End" }, { key: "allow_weekends", label: "Weekends", render: (r: Row) => (r["allow_weekends"] ? "Allowed" : "Blocked") }])}
      fields={(refs) => ([{ name: "name", label: "Name", type: "text", required: true }, { name: "start_date", label: "Start date", type: "date", required: true }, { name: "end_date", label: "End date", type: "date", required: true }, { name: "allow_weekends", label: "Allow weekends", type: "checkbox", defaultValue: false }])}
    />
  );
}
