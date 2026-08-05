import { createFileRoute } from "@tanstack/react-router";
import { CrudPage, lookup, type Row } from "@/components/crud-page";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/exams")({
  head: () => ({
    meta: [
      { title: "Exams — ExamSched" },
      { name: "description", content: "All scheduled examinations with module, timeslot, venue and invigilator." },
      { property: "og:title", content: "Exams — ExamSched" },
      { property: "og:description", content: "All scheduled examinations in the current periods." },
    ],
  }),
  component: Page,
});

function Page() {
  const { isAdmin } = useSession();
  return (
    <CrudPage
      table="exams"
      title="Scheduled examinations"
      description="Created through the scheduling engine. Edits here bypass no rules — reschedules should be made in the engine."
      refs={["modules", "timeslots", "venues", "lecturers", "exam_periods"]}
      canWrite={isAdmin}
      canCreate={false}
      columns={(refs) => [
        { key: "module_id", label: "Module", render: (r: Row) => lookup(refs["modules"], r["module_id"], "code") },
        { key: "exam_period_id", label: "Period", render: (r: Row) => lookup(refs["exam_periods"], r["exam_period_id"]) },
        {
          key: "timeslot_id",
          label: "Timeslot",
          render: (r: Row) => {
            const slot = refs["timeslots"]?.find((t: Row) => t["id"] === r["timeslot_id"]);
            return slot ? `${slot["slot_date"]} ${String(slot["start_time"]).slice(0, 5)}` : "—";
          },
        },
        { key: "venue_id", label: "Venue", render: (r: Row) => lookup(refs["venues"], r["venue_id"]) },
        { key: "invigilator_id", label: "Invigilator", render: (r: Row) => lookup(refs["lecturers"], r["invigilator_id"], "full_name") },
        { key: "expected_students", label: "Candidates" },
        { key: "status", label: "Status" },
      ]}
      fields={(refs) => [
        {
          name: "venue_id",
          label: "Venue",
          type: "select",
          required: true,
          options: (refs["venues"] ?? []).map((v: Row) => ({ value: v["id"], label: v["name"] })),
        },
        {
          name: "invigilator_id",
          label: "Invigilator",
          type: "select",
          options: (refs["lecturers"] ?? []).map((l: Row) => ({ value: l["id"], label: l["full_name"] })),
        },
        { name: "notes", label: "Notes", type: "text" },
      ]}
      emptyHint="No examinations scheduled yet — use the scheduling engine."
    />
  );
}
