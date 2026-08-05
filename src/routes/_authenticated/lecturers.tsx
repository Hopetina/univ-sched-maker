import { useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { CrudPage, lookup, type Row } from "@/components/crud-page";
import { createLecturerAccount, listRows } from "@/lib/exam.functions";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/lecturers")({
  head: () => ({
    meta: [
      { title: "Lecturers — ExamSched" },
      { name: "description", content: "Academic staff who lecture modules and invigilate examinations." },
      { property: "og:title", content: "Lecturers — ExamSched" },
      { property: "og:description", content: "Academic staff who lecture modules and invigilate examinations." },
    ],
  }),
  component: Page,
});

function Page() {
  const { isAdmin, isSystemAdmin } = useSession();
  const search = useSearch({ strict: false }) as { q?: string };
  return (
    <div>
      <CrudPage
        table="lecturers"
        title="Lecturers"
        description="Academic staff who lecture modules and invigilate examinations."
        orderBy="staff_number"
        refs={["departments"]}
        canWrite={isAdmin}
        initialSearch={search.q}
        columns={(refs) => ([{ key: "staff_number", label: "Staff no." }, { key: "full_name", label: "Name" }, { key: "email", label: "Email" }, { key: "department_id", label: "Department", render: (r: Row) => lookup(refs["departments"], r["department_id"]) }])}
        fields={(refs) => ([{ name: "staff_number", label: "Staff number", type: "text", required: true }, { name: "full_name", label: "Full name", type: "text", required: true }, { name: "email", label: "Email", type: "text", required: true }, { name: "department_id", label: "Department", type: "select", required: true, options: (refs["departments"] ?? []).map((d: Row) => ({ value: d["id"], label: d["name"] })) }])}
      />
      {isSystemAdmin ? <LecturerAccounts /> : null}
    </div>
  );
}

function LecturerAccounts() {
  const list = useServerFn(listRows);
  const create = useServerFn(createLecturerAccount);
  const queryClient = useQueryClient();
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["rows", "lecturers"],
    queryFn: () => list({ data: { table: "lecturers" as never } }) as Promise<Row[]>,
  });

  const mutation = useMutation({
    mutationFn: (lecturer: Row) => create({ data: { lecturerId: lecturer["id"] } }) as Promise<{ password: string }>,
    onSuccess: (result, lecturer) => {
      setTempPassword({ name: lecturer["full_name"], password: result.password });
      queryClient.invalidateQueries({ queryKey: ["rows", "lecturers"] });
      toast.success("Login account created");
    },
    onError: (error: Error) => {
      const msg = error.message.includes("SUPABASE_SERVICE_ROLE_KEY")
        ? "SUPABASE_SERVICE_ROLE_KEY is missing from .env — add your Supabase service role key and restart the dev server."
        : error.message;
      toast.error(msg, { duration: 8000 });
    },
  });

  const pending = (data ?? []).filter((l) => !l["profile_id"]);
  if (!isLoading && pending.length === 0) return null;

  return (
    <div className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Lecturers without a login account</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff no.</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Loading…</TableCell>
                  </TableRow>
                ) : (
                  pending.map((lecturer) => (
                    <TableRow key={lecturer["id"]}>
                      <TableCell className="text-sm">{lecturer["staff_number"]}</TableCell>
                      <TableCell className="text-sm">{lecturer["full_name"]}</TableCell>
                      <TableCell className="text-sm">{lecturer["email"] || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={mutation.isPending || !lecturer["email"]}
                          onClick={() => mutation.mutate(lecturer)}
                        >
                          Create login account
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(tempPassword)} onOpenChange={(open) => !open && setTempPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login account created</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Share this temporary password with {tempPassword?.name} through a secure channel. It will not be shown again
            and must be changed at next sign-in.
          </p>
          <Input readOnly value={tempPassword?.password ?? ""} className="font-mono" />
          <DialogFooter>
            <Button onClick={() => setTempPassword(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
