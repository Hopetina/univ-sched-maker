import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

import { importExamTimetable, listRows } from "@/lib/exam.functions";
import type { ExamImportRow } from "@/lib/imports.server";
import { guessColumnMapping, parseSpreadsheetFile, type FieldDefinition, type ParsedSheet } from "@/lib/import-utils";
import { useSession } from "@/hooks/use-session";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/import-exams")({
  head: () => ({
    meta: [
      { title: "Import exam timetable — ExamSched" },
      { name: "description", content: "Bulk-create proposed examinations and detect clashes via the scheduling engine." },
      { property: "og:title", content: "Import exam timetable — ExamSched" },
      { property: "og:description", content: "Bulk-create proposed examinations and detect clashes via the scheduling engine." },
    ],
  }),
  component: Page,
});

const FIELDS: FieldDefinition[] = [
  { key: "moduleCode", label: "Module code", aliases: ["module", "course code"], required: true },
  { key: "date", label: "Date", aliases: ["exam date", "slot date"], required: true },
  { key: "startTime", label: "Start time", aliases: ["start", "time"], required: true },
  { key: "venueCode", label: "Venue code", aliases: ["venue", "room"], required: true },
  { key: "invigilatorStaffNumber", label: "Invigilator staff no.", aliases: ["invigilator", "staff no", "staff number"] },
  { key: "notes", label: "Notes", aliases: ["remarks", "comments"] },
];

const NONE = "__none__";

function Page() {
  const { isAdmin } = useSession();
  const list = useServerFn(listRows);
  const run = useServerFn(importExamTimetable);
  const queryClient = useQueryClient();

  const { data: periods } = useQuery({
    queryKey: ["rows", "exam_periods"],
    queryFn: () => list({ data: { table: "exam_periods" as never, orderBy: "start_date" } }) as Promise<{ id: string; name: string }[]>,
  });

  const [periodId, setPeriodId] = useState("");
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [report, setReport] = useState<Awaited<ReturnType<typeof run>> | null>(null);

  const mutation = useMutation({
    mutationFn: (rows: ExamImportRow[]) => run({ data: { examPeriodId: periodId, rows } }),
    onSuccess: (result) => {
      setReport(result);
      queryClient.invalidateQueries({ queryKey: ["rows"] });
      queryClient.invalidateQueries({ queryKey: ["scheduling-data"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`${result.examsImported} exam(s) imported, ${result.conflictsFound} conflict(s) found`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function onFile(file: File) {
    setFileName(file.name);
    setReport(null);
    const parsed = await parseSpreadsheetFile(file);
    setSheet(parsed);
    setMapping(guessColumnMapping(parsed.headers, FIELDS));
  }

  const rows = useMemo<ExamImportRow[]>(() => {
    if (!sheet) return [];
    return sheet.rows.map((raw) => ({
      moduleCode: raw[mapping.moduleCode ?? ""] ?? "",
      date: raw[mapping.date ?? ""] ?? "",
      startTime: raw[mapping.startTime ?? ""] ?? "",
      venueCode: raw[mapping.venueCode ?? ""] ?? "",
      invigilatorStaffNumber: mapping.invigilatorStaffNumber ? raw[mapping.invigilatorStaffNumber] : undefined,
      notes: mapping.notes ? raw[mapping.notes] : undefined,
    }));
  }, [sheet, mapping]);

  const missingRequired = FIELDS.filter((f) => f.required && !mapping[f.key]);

  if (!isAdmin) {
    return <PageHeader title="Import exam timetable" description="Only administrators may import examination timetables." />;
  }

  return (
    <div>
      <PageHeader
        title="Import exam timetable"
        description="Bulk-create proposed examinations from a CSV/XLSX timetable extract. Every row is run through the same scheduling engine used elsewhere in ExamSched, so clashes are detected automatically."
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">1. Exam period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-1">
            <Label className="text-xs">Exam period</Label>
            <Select value={periodId} onValueChange={setPeriodId}>
              <SelectTrigger><SelectValue placeholder="Select the exam period to import into" /></SelectTrigger>
              <SelectContent>
                {(periods ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="font-display text-base">2. Choose a file</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed p-6 text-sm text-muted-foreground hover:border-primary/60">
            <UploadCloud className="size-5" />
            {fileName || "Click to choose a .csv or .xlsx file"}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Timeslots and venues must already exist — this import does not create them.
          </p>
        </CardContent>
      </Card>

      {sheet ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="font-display text-base">3. Map columns</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label className="text-xs">
                  {field.label}
                  {field.required ? <span className="text-destructive"> *</span> : null}
                </Label>
                <Select
                  value={mapping[field.key] ?? NONE}
                  onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: v === NONE ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Not mapped" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not mapped</SelectItem>
                    {sheet.headers.map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {sheet ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="font-display text-base">4. Preview ({rows.length} row(s))</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!periodId ? <p className="text-sm text-destructive">Select an exam period before importing.</p> : null}
            {missingRequired.length > 0 ? (
              <p className="text-sm text-destructive">
                Map required fields before importing: {missingRequired.map((f) => f.label).join(", ")}.
              </p>
            ) : null}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {FIELDS.map((f) => <TableHead key={f.key}>{f.label}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      {FIELDS.map((f) => (
                        <TableCell key={f.key} className="text-xs">{String((row as never)[f.key] ?? "")}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button
              disabled={missingRequired.length > 0 || rows.length === 0 || !periodId || mutation.isPending}
              onClick={() => mutation.mutate(rows)}
            >
              {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileUp className="mr-2 size-4" />}
              Run import ({rows.length} row(s))
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {report ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="font-display text-base">Import report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{report.rowsProcessed} rows processed</Badge>
              <Badge variant="secondary">{report.examsImported} exams imported</Badge>
              {report.conflictsFound > 0 ? (
                <Badge variant="destructive">{report.conflictsFound} conflicts found</Badge>
              ) : (
                <Badge variant="secondary">0 conflicts found</Badge>
              )}
              {report.errors.length > 0 ? <Badge variant="destructive">{report.errors.length} row error(s)</Badge> : null}
            </div>
            {report.conflictsFound > 0 ? (
              <p className="text-sm text-muted-foreground">
                Rows with conflicts were not scheduled. Review and resolve them on the{" "}
                <Link to="/conflicts" className="underline">Conflicts dashboard</Link>.
              </p>
            ) : null}
            {report.conflictDetails.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Conflicts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.conflictDetails.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{c.row}</TableCell>
                        <TableCell className="text-xs">{c.moduleCode}</TableCell>
                        <TableCell className="text-xs">{c.conflicts.map((cf) => cf.reason).join("; ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            {report.errors.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.errors.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{e.row}</TableCell>
                        <TableCell className="text-xs">{e.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
