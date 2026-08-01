import { createFileRoute } from "@tanstack/react-router";
import { CrudPage, lookup, type Row } from "@/components/crud-page";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/holidays")({
  head: () => ({
    meta: [
      { title: "Public holidays — ExamSched" },
      { name: "description", content: "Dates on which examinations may not be scheduled." },
      { property: "og:title", content: "Public holidays — ExamSched" },
      { property: "og:description", content: "Dates on which examinations may not be scheduled." },
    ],
  }),
  component: Page,
});

function Page() {
  const { isAdmin, isSystemAdmin } = useSession();
  return (
    <CrudPage
      table="public_holidays"
      title="Public holidays"
      description="Dates on which examinations may not be scheduled."
      orderBy="holiday_date"
      refs={[]}
      canWrite={isSystemAdmin}
      columns={(refs) => ([{ key: "holiday_date", label: "Date" }, { key: "name", label: "Name" }])}
      fields={(refs) => ([{ name: "holiday_date", label: "Date", type: "date", required: true }, { name: "name", label: "Name", type: "text", required: true }])}
    />
  );
}
