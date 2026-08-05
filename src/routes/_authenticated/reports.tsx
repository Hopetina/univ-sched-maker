import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileDown, Sheet } from "lucide-react";
import { toast } from "sonner";

import { getTimetableReport } from "@/lib/exam.functions";
import { useSession } from "@/hooks/use-session";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Timetable reports — ExamSched" },
      { name: "description", content: "Filter the examination timetable and export it to PDF or Excel." },
      { property: "og:title", content: "Timetable reports — ExamSched" },
      { property: "og:description", content: "Examination timetable reporting with PDF and Excel export." },
    ],
  }),
  component: ReportsPage,
});

const ALL = "__all__";

const COLUMNS = [
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "moduleCode", label: "Module" },
  { key: "moduleName", label: "Title" },
  { key: "departmentName", label: "Department" },
  { key: "venueName", label: "Venue" },
  { key: "expectedStudents", label: "Candidates" },
  { key: "venueCapacity", label: "Capacity" },
  { key: "invigilator", label: "Invigilator" },
];

function ReportsPage() {
  const { session, isSystemAdmin } = useSession();
  const fetchReport = useServerFn(getTimetableReport);
  const [periodId, setPeriodId] = useState(ALL);
  const [departmentId, setDepartmentId] = useState(ALL);
  const [venueId, setVenueId] = useState(ALL);
  const [moduleId, setModuleId] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["timetable-report", periodId, departmentId, venueId, moduleId, dateFrom, dateTo],
    queryFn: () =>
      fetchReport({
        data: {
          examPeriodId: periodId === ALL ? null : periodId,
          departmentId: departmentId === ALL ? null : departmentId,
          venueId: venueId === ALL ? null : venueId,
          moduleId: moduleId === ALL ? null : moduleId,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
        },
      }) as Promise<any>,
  });


  const rows = useMemo(
    () =>
      (data?.rows ?? []).map((row: any) => ({
        ...row,
        time: `${row.startTime}–${row.endTime}`,
      })),
    [data],
  );

  const periodName = periodId === ALL ? "All examination periods" : (data?.periods ?? []).find((p: any) => p.id === periodId)?.name;
  const departmentName =
    departmentId === ALL ? "All departments" : (data?.departments ?? []).find((d: any) => d.id === departmentId)?.name;
  const subtitle = `${periodName ?? ""} · ${departmentName ?? ""} · ${rows.length} examination(s)`;

  async function runExport(kind: "pdf" | "excel") {
    if (rows.length === 0) {
      toast.error("Nothing to export for the current filters.");
      return;
    }
    setBusy(true);
    try {
      const { exportToPdf, exportToExcel } = await import("@/lib/export-utils");
      const fileName = `examination-timetable-${new Date().toISOString().slice(0, 10)}`;
      if (kind === "pdf") {
        await exportToPdf(rows, COLUMNS, fileName, "Examination Timetable", subtitle);
      } else {
        await exportToExcel(rows, COLUMNS, fileName);
      }
      toast.success(`Exported ${rows.length} examination(s)`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Timetable reports"
        description={
          isSystemAdmin
            ? "Institution-wide examination timetable with export to PDF and Excel."
            : "Examination timetable for the data your role may access."
        }
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => runExport("excel")} disabled={busy}>
              <Sheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button onClick={() => runExport("pdf")} disabled={busy}>
              <FileDown className="mr-1.5 h-4 w-4" /> PDF
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Examination period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All examination periods</SelectItem>
            {(data?.periods ?? []).map((period: any) => (
              <SelectItem key={period.id} value={period.id}>
                {period.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {(data?.departments ?? []).map((department: any) => (
              <SelectItem key={department.id} value={department.id}>
                {department.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={venueId} onValueChange={setVenueId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Venue" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All venues</SelectItem>
            {(data?.venues ?? []).map((venue: any) => (
              <SelectItem key={venue.id} value={venue.id}>
                {venue.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={moduleId} onValueChange={setModuleId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All modules</SelectItem>
            {(data?.modules ?? []).map((module: any) => (
              <SelectItem key={module.id} value={module.id}>
                {module.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          aria-label="From date"
          className="w-44"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
        />
        <Input
          type="date"
          aria-label="To date"
          className="w-44"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
        />

        {session?.departmentId && !isSystemAdmin ? (
          <p className="self-center text-xs text-muted-foreground">Scoped to your assigned department.</p>
        ) : null}
      </div>


      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((column) => (
                    <TableHead key={column.key}>{column.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} className="py-10 text-center text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} className="py-10 text-center text-sm text-muted-foreground">
                      No examinations match these filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row: any) => (
                    <TableRow key={row.examId}>
                      {COLUMNS.map((column) => (
                        <TableCell key={column.key} className="text-sm">
                          {String(row[column.key] ?? "—")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
