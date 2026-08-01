import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyTimetable } from "@/lib/exam.functions";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/my-timetable")({
  head: () => ({
    meta: [
      { title: "My timetable — ExamSched" },
      { name: "description", content: "Your personal examination timetable: modules, venues, dates and times." },
      { property: "og:title", content: "My timetable — ExamSched" },
      { property: "og:description", content: "Your personal examination timetable." },
    ],
  }),
  component: TimetablePage,
});

function TimetablePage() {
  const fetchTimetable = useServerFn(getMyTimetable);
  const { data, isLoading } = useQuery({
    queryKey: ["my-timetable"],
    queryFn: () => fetchTimetable() as Promise<any>,
  });

  const rows = (data?.rows ?? []).slice().sort((a: any, b: any) =>
    `${a.timeslot?.slot_date}${a.timeslot?.start_time}`.localeCompare(`${b.timeslot?.slot_date}${b.timeslot?.start_time}`),
  );

  return (
    <div>
      <PageHeader
        title="My examination timetable"
        description={
          data?.student
            ? `Candidate ${data.student.student_number} — ${data.student.full_name}`
            : data?.lecturer
              ? `Invigilation duties for ${data.lecturer.full_name}`
              : "Matched to your institutional email address."
        }
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No examinations linked to your account yet. Student and lecturer records are matched by email
                    address.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm font-medium">
                      {row.module?.code} — {row.module?.name}
                    </TableCell>
                    <TableCell className="text-sm">{row.timeslot?.slot_date}</TableCell>
                    <TableCell className="text-sm">
                      {row.timeslot?.start_time?.slice(0, 5)}–{row.timeslot?.end_time?.slice(0, 5)}
                    </TableCell>
                    <TableCell className="text-sm">{row.venue?.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.role}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
