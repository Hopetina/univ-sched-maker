import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteRow, listRows, saveRow } from "@/lib/exam.functions";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Row = Record<string, any>;

export interface CrudField {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "time" | "checkbox" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: string | number | boolean;
}

export interface CrudColumn {
  key: string;
  label: string;
  render?: (row: Row, refs: Record<string, Row[]>) => ReactNode;
}

export interface CrudPageProps {
  table: string;
  title: string;
  description: string;
  refs?: string[];
  orderBy?: string;
  columns: (refs: Record<string, Row[]>) => CrudColumn[];
  fields: (refs: Record<string, Row[]>) => CrudField[];
  canWrite: boolean;
  emptyHint?: string;
}

export function lookup(rows: Row[] | undefined, id: string | null | undefined, key = "name") {
  if (!id) return "—";
  const row = rows?.find((r) => r["id"] === id);
  return row ? String(row[key] ?? row["name"] ?? row["code"] ?? id) : "—";
}

export function CrudPage(props: CrudPageProps) {
  const { table, title, description, columns, fields, canWrite, refs = [], orderBy } = props;
  const list = useServerFn(listRows);
  const save = useServerFn(saveRow);
  const remove = useServerFn(deleteRow);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const tables = [table, ...refs];
  const results = useQueries({
    queries: tables.map((t) => ({
      queryKey: ["rows", t],
      queryFn: () =>
        list({
          data: { table: t as never, ...(t === table && orderBy ? { orderBy } : {}) },
        }) as Promise<Row[]>,
    })),
  });

  const refData = useMemo(() => {
    const map: Record<string, Row[]> = {};
    tables.forEach((t, i) => {
      map[t] = (results[i]?.data as Row[]) ?? [];
    });
    return map;
  }, [results, tables]);

  const rows = refData[table] ?? [];
  const cols = columns(refData);
  const formFields = fields(refData);

  const mutation = useMutation({
    mutationFn: (values: Record<string, any>) =>
      save({ data: { table: table as never, id: editing?.["id"] ?? null, values } }),
    onSuccess: () => {
      toast.success(editing ? "Record updated" : "Record created");
      setOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["rows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removal = useMutation({
    mutationFn: (id: string) => remove({ data: { table: table as never, id } }),
    onSuccess: () => {
      toast.success("Record deleted");
      queryClient.invalidateQueries({ queryKey: ["rows"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function startCreate() {
    setEditing(null);
    const initial: Record<string, any> = {};
    formFields.forEach((f) => {
      initial[f.name] = f.defaultValue ?? (f.type === "checkbox" ? false : "");
    });
    setForm(initial);
    setOpen(true);
  }

  function startEdit(row: Row) {
    setEditing(row);
    const initial: Record<string, any> = {};
    formFields.forEach((f) => {
      initial[f.name] = row[f.name] ?? (f.type === "checkbox" ? false : "");
    });
    setForm(initial);
    setOpen(true);
  }

  function submit() {
    const values: Record<string, any> = {};
    for (const field of formFields) {
      const raw = form[field.name];
      if (field.required && (raw === "" || raw === undefined || raw === null)) {
        toast.error(`${field.label} is required`);
        return;
      }
      values[field.name] = field.type === "number" ? Number(raw || 0) : raw === "" ? null : raw;
    }
    mutation.mutate(values);
  }

  const loading = results.some((r) => r.isLoading);

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        action={
          canWrite ? (
            <Button onClick={startCreate}>
              <Plus className="mr-1.5 h-4 w-4" /> New
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {cols.map((c) => (
                    <TableHead key={c.key}>{c.label}</TableHead>
                  ))}
                  {canWrite ? <TableHead className="w-24 text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={cols.length + 1} className="py-10 text-center text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={cols.length + 1} className="py-10 text-center text-sm text-muted-foreground">
                      {props.emptyHint ?? "No records yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row["id"]}>
                      {cols.map((c) => (
                        <TableCell key={c.key} className="align-top text-sm">
                          {c.render ? c.render(row, refData) : String(row[c.key] ?? "—")}
                        </TableCell>
                      ))}
                      {canWrite ? (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => startEdit(row)} aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            onClick={() => removal.mutate(row["id"])}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${title.replace(/s$/, "")}` : `New ${title.replace(/s$/, "")}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {formFields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={field.name}>{field.label}</Label>
                {field.type === "select" ? (
                  <Select
                    value={form[field.name] ? String(form[field.name]) : ""}
                    onValueChange={(value) => setForm((f) => ({ ...f, [field.name]: value }))}
                  >
                    <SelectTrigger id={field.name}>
                      <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options ?? []).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type === "checkbox" ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={field.name}
                      checked={Boolean(form[field.name])}
                      onCheckedChange={(checked) => setForm((f) => ({ ...f, [field.name]: Boolean(checked) }))}
                    />
                    <span className="text-sm text-muted-foreground">Enabled</span>
                  </div>
                ) : (
                  <Input
                    id={field.name}
                    type={field.type}
                    value={form[field.name] ?? ""}
                    onChange={(event) => setForm((f) => ({ ...f, [field.name]: event.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
