import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarSync } from "lucide-react";
import { toast } from "sonner";

import { CrudPage, type Row } from "@/components/crud-page";
import { useSession } from "@/hooks/use-session";
import { syncPublicHolidays } from "@/lib/exam.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const { isSystemAdmin } = useSession();
  const queryClient = useQueryClient();
  const sync = useServerFn(syncPublicHolidays);
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const syncMutation = useMutation({
    mutationFn: () => sync({ data: { year: Number(year) } }) as Promise<{ added: number; skipped: number }>,
    onSuccess: (result) => {
      toast.success(`Calendar synced — ${result.added} added, ${result.skipped} already present.`);
      queryClient.invalidateQueries({ queryKey: ["rows", "public_holidays"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <CrudPage
      table="public_holidays"
      title="Public holidays"
      description="Dates on which examinations may not be scheduled. Sync pulls the official calendar, including Sunday observances and the movable Easter dates."
      orderBy="holiday_date"
      refs={[]}
      canWrite={isSystemAdmin}
      searchPlaceholder="Search holiday name"
      searchText={(r: Row) => `${r["name"]} ${r["holiday_date"]}`}
      extraActions={
        isSystemAdmin ? (
          <div className="flex items-center gap-2">
            <Input
              aria-label="Calendar year"
              className="w-24"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
            <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <CalendarSync className="mr-1.5 h-4 w-4" />
              {syncMutation.isPending ? "Syncing…" : "Sync calendar"}
            </Button>
          </div>
        ) : null
      }
      columns={() => [
        { key: "holiday_date", label: "Date" },
        { key: "name", label: "Name" },
      ]}
      fields={() => [
        { name: "holiday_date", label: "Date", type: "date", required: true },
        { name: "name", label: "Name", type: "text", required: true },
      ]}
    />
  );
}
