import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listRows } from "@/lib/exam.functions";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit trail — ExamSched" },
      { name: "description", content: "Every accepted and rejected scheduling request, with actor and reasons." },
      { property: "og:title", content: "Audit trail — ExamSched" },
      { property: "og:description", content: "Full governance trail of scheduling and data changes." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const list = useServerFn(listRows);
  const { data, isLoading } = useQuery({
    queryKey: ["rows", "audit_logs"],
    queryFn: () => list({ data: { table: "audit_logs", orderBy: "created_at", ascending: false } }) as Promise<any[]>,
  });

  return (
    <div>
      <PageHeader title="Audit trail" description="Immutable record of scheduling decisions and data changes." />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell>
                  </TableRow>
                ) : (data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No audit entries yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (data ?? []).map((entry) => (
                    <TableRow key={entry["id"]}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(entry["created_at"]).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">{entry["actor_email"] || "—"}</TableCell>
                      <TableCell className="text-xs font-medium">{entry["action"]}</TableCell>
                      <TableCell className="text-xs">{entry["entity"]}</TableCell>
                      <TableCell>
                        <Badge variant={entry["outcome"] === "success" ? "secondary" : "destructive"}>
                          {entry["outcome"]}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md text-xs text-muted-foreground">
                        <code className="break-all">{JSON.stringify(entry["details"]).slice(0, 220)}</code>
                      </TableCell>
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
