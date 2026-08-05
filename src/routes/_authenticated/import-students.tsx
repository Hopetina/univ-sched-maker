import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { importStudents } from "@/lib/exam.functions";
import type { StudentImportRow } from "@/lib/imports.server";
import { guessColumnMapping, parseSpreadsheetFile, type FieldDefinition, type ParsedSheet } from "@/lib/import-utils";
import { useSession } from "@/hooks/use-session";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/import-students")({
  head: () => ({
    meta: [
      { title: "Import students — ExamSched" },
      { name: "description", content: "Bulk import students, modules and enrolments from a spreadsheet." },
      { property: "og:title", content: "Import students — ExamSched" },
      { property: "og:description", content: "Bulk import students, modules and enrolments from a spreadsheet." },
    ],
  }),
  component: Page,
});

const FIELDS: FieldDefinition[] = [
  { key: "studentNumber", label: "Student number", aliases: ["student no", "student id", "reg no", "registration number"], required: true },
  { key: "fullName", label: "Full name", aliases: ["name", "student name"], required: true },
  { key: "email", label: "Email", aliases: ["email address"], required: true },
  { key: "departmentCode", label: "Department code", aliases: ["dept code", "department", "dept"], required: true },
  { key: "yearOfStudy", label: "Year of study", aliases: ["year", "yos"] },
  { key: "moduleCode", label: "Module code", aliases: ["module", "course code", "subject code"], required: true },
  { key: "moduleName", label: "Module name", aliases: ["module title", "course name", "subject"] },
  { key: "academicYear", label: "Academic year", aliases: ["enrolment year", "acad year"], required: true },
  { key: "isRepeat", label: "Repeat module", aliases: ["repeat", "is repeat", "repeating"] },
];

const NONE = "__none__";

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  return ["y", "yes", "true", "1"].includes(value.trim().toLowerCase());
}

function Page() {
  const { isAdmin } = useSession();
  const run = useServerFn(importStudents);
  const queryClient = useQueryClient();

  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [report, setReport] = useState<Awaited<ReturnType<typeof run>> | null>(null);

  const mutation = useMutation({
    mutationFn: (rows: StudentImportRow[]) => run({ data: { rows } }),
    onSuccess: (result) => {
      setReport(result);
      queryClient.invalidateQueries({ queryKey: ["rows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Import complete — ${result.studentsCreated + result.studentsUpdated} students processed`);
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

  const rows = useMemo<StudentImportRow[]>(() => {
    if (!sheet) return [];
    return sheet.rows.map((raw) => ({
      studentNumber: raw[mapping.studentNumber ?? ""] ?? "",
      fullName: raw[mapping.fullName ?? ""] ?? "",
      email: raw[mapping.email ?? ""] ?? "",
      departmentCode: raw[mapping.departmentCode ?? ""] ?? "",
      yearOfStudy: mapping.yearOfStudy ? Number(raw[mapping.yearOfStudy]) || undefined : undefined,
      moduleCode: raw[mapping.moduleCode ?? ""] ?? "",
      moduleName: mapping.moduleName ? raw[mapping.moduleName] : undefined,
      academicYear: Number(raw[mapping.academicYear ?? ""]) || 0,
      isRepeat: mapping.isRepeat ? truthy(raw[mapping.isRepeat]) : false,
    }));
  }, [sheet, mapping]);

  const missingRequired = FIELDS.filter((f) => f.required && !mapping[f.key]);

  if (!isAdmin) {
    return <PageHeader title="Import students" description="Only administrators may import student registrations." />;
  }

  return (
    <div>
      <PageHeader
        title="Import students"
        description="Bulk-create or update students, modules and enrolments from a CSV/XLSX registration extract. The scheduling engine uses these enrolments for clash detection, and repeat modules are supported."
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">1. Choose a file</CardTitle>
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
        </CardContent>
      </Card>

      {sheet ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="font-display text-base">2. Map columns</CardTitle>
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
            <CardTitle className="font-display text-base">3. Preview ({rows.length} row(s))</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
              disabled={missingRequired.length > 0 || rows.length === 0 || mutation.isPending}
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
              <Badge variant="secondary">{report.studentsCreated} students created</Badge>
              <Badge variant="secondary">{report.studentsUpdated} students updated</Badge>
              <Badge variant="secondary">{report.modulesCreated} modules created</Badge>
              <Badge variant="secondary">{report.enrolmentsCreated} enrolments created</Badge>
              <Badge variant="secondary">{report.enrolmentsUpdated} enrolments updated</Badge>
              <Badge variant="secondary">{report.accountsCreated} login accounts created</Badge>
              {report.errors.length > 0 ? <Badge variant="destructive">{report.errors.length} row error(s)</Badge> : null}
            </div>
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
