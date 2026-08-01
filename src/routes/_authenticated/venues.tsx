import { createFileRoute } from "@tanstack/react-router";
import { CrudPage, lookup, type Row } from "@/components/crud-page";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/venues")({
  head: () => ({
    meta: [
      { title: "Venues — ExamSched" },
      { name: "description", content: "Examination venues and their seating capacity." },
      { property: "og:title", content: "Venues — ExamSched" },
      { property: "og:description", content: "Examination venues and their seating capacity." },
    ],
  }),
  component: Page,
});

function Page() {
  const { isAdmin, isSystemAdmin } = useSession();
  return (
    <CrudPage
      table="venues"
      title="Venues"
      description="Examination venues and their seating capacity."
      orderBy="code"
      refs={[]}
      canWrite={isSystemAdmin}
      columns={(refs) => ([{ key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "building", label: "Building" }, { key: "capacity", label: "Capacity" }, { key: "is_active", label: "Active", render: (r: Row) => (r["is_active"] ? "Yes" : "No") }])}
      fields={(refs) => ([{ name: "code", label: "Code", type: "text", required: true }, { name: "name", label: "Name", type: "text", required: true }, { name: "building", label: "Building", type: "text" }, { name: "capacity", label: "Capacity", type: "number", required: true, defaultValue: 50 }, { name: "is_active", label: "Active", type: "checkbox", defaultValue: true }])}
    />
  );
}
