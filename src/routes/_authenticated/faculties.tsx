import { createFileRoute } from "@tanstack/react-router";
import { CrudPage, lookup, type Row } from "@/components/crud-page";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/faculties")({
  head: () => ({
    meta: [
      { title: "Faculties — ExamSched" },
      { name: "description", content: "Top-level academic faculties of the university." },
      { property: "og:title", content: "Faculties — ExamSched" },
      { property: "og:description", content: "Top-level academic faculties of the university." },
    ],
  }),
  component: Page,
});

function Page() {
  const { isAdmin, isSystemAdmin } = useSession();
  return (
    <CrudPage
      table="faculties"
      title="Faculties"
      description="Top-level academic faculties of the university."
      orderBy="code"
      refs={[]}
      canWrite={isSystemAdmin}
      columns={(refs) => ([{ key: "code", label: "Code" }, { key: "name", label: "Name" }])}
      fields={(refs) => ([{ name: "code", label: "Code", type: "text", required: true }, { name: "name", label: "Name", type: "text", required: true }])}
    />
  );
}
