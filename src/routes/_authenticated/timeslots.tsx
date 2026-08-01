import { createFileRoute } from "@tanstack/react-router";
import { CrudPage, lookup, type Row } from "@/components/crud-page";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/timeslots")({
  head: () => ({
    meta: [
      { title: "Timeslots — ExamSched" },
      { name: "description", content: "Predefined slots within an exam period. Exams can only be placed into these slots." },
      { property: "og:title", content: "Timeslots — ExamSched" },
      { property: "og:description", content: "Predefined slots within an exam period. Exams can only be placed into these slots." },
    ],
  }),
  component: Page,
});

function Page() {
  const { isAdmin, isSystemAdmin } = useSession();
  return (
    <CrudPage
      table="timeslots"
      title="Timeslots"
      description="Predefined slots within an exam period. Exams can only be placed into these slots."
      orderBy="slot_date"
      refs={["exam_periods"]}
      canWrite={isSystemAdmin}
      columns={(refs) => ([{ key: "slot_date", label: "Date" }, { key: "start_time", label: "Start" }, { key: "end_time", label: "End" }, { key: "label", label: "Session" }, { key: "exam_period_id", label: "Period", render: (r: Row) => lookup(refs["exam_periods"], r["exam_period_id"]) }])}
      fields={(refs) => ([{ name: "exam_period_id", label: "Exam period", type: "select", required: true, options: (refs["exam_periods"] ?? []).map((p: Row) => ({ value: p["id"], label: p["name"] })) }, { name: "slot_date", label: "Date", type: "date", required: true }, { name: "start_time", label: "Start time", type: "time", required: true }, { name: "end_time", label: "End time", type: "time", required: true }, { name: "label", label: "Session label", type: "text" }])}
    />
  );
}
