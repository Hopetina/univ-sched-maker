import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { listManagedUsers, listRows, updateUserDepartment, updateUserRoles } from "@/lib/exam.functions";
import type { AppRole } from "@/lib/exam.functions";
import { useSession } from "@/hooks/use-session";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users & roles — ExamSched" },
      { name: "description", content: "Grant roles and assign departments to user accounts." },
      { property: "og:title", content: "Users & roles — ExamSched" },
      { property: "og:description", content: "System Admin control over roles and department assignment." },
    ],
  }),
  component: UsersPage,
});

const ROLES: { value: AppRole; label: string }[] = [
  { value: "system_admin", label: "System Admin" },
  { value: "department_admin", label: "Department Admin" },
  { value: "lecturer", label: "Lecturer" },
  { value: "student", label: "Student" },
];

const NO_DEPARTMENT = "__none__";

interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  departmentId: string | null;
  roles: AppRole[];
}

function UsersPage() {
  const { isSystemAdmin, isLoading: sessionLoading } = useSession();
  const fetchUsers = useServerFn(listManagedUsers);
  const fetchRows = useServerFn(listRows);
  const saveRoles = useServerFn(updateUserRoles);
  const saveDepartment = useServerFn(updateUserDepartment);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const usersQuery = useQuery({
    queryKey: ["managed-users"],
    queryFn: () => fetchUsers() as Promise<ManagedUser[]>,
    enabled: isSystemAdmin,
  });

  const departmentsQuery = useQuery({
    queryKey: ["rows", "departments"],
    queryFn: () => fetchRows({ data: { table: "departments" as never } }) as Promise<any[]>,
    enabled: isSystemAdmin,
  });

  const rolesMutation = useMutation({
    mutationFn: (input: { userId: string; roles: AppRole[] }) => saveRoles({ data: input }),
    onSuccess: () => {
      toast.success("Roles updated");
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      queryClient.invalidateQueries({ queryKey: ["session-context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const departmentMutation = useMutation({
    mutationFn: (input: { userId: string; departmentId: string | null }) => saveDepartment({ data: input }),
    onSuccess: () => {
      toast.success("Department updated");
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      queryClient.invalidateQueries({ queryKey: ["session-context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const users = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = usersQuery.data ?? [];
    if (!term) return list;
    return list.filter((u) => `${u.fullName} ${u.email}`.toLowerCase().includes(term));
  }, [usersQuery.data, search]);

  if (!sessionLoading && !isSystemAdmin) {
    return (
      <div>
        <PageHeader title="Users & roles" description="Restricted area." />
        <Card>
          <CardContent className="p-8 text-sm text-muted-foreground">
            Only a System Admin may manage user roles and department assignment.
          </CardContent>
        </Card>
      </div>
    );
  }

  function toggleRole(user: ManagedUser, role: AppRole, checked: boolean) {
    const next = checked ? [...user.roles, role] : user.roles.filter((r) => r !== role);
    rolesMutation.mutate({ userId: user.id, roles: next });
  }

  return (
    <div>
      <PageHeader
        title="Users & roles"
        description="Elevated access is never self-assigned. Grant roles and set the department that scopes a Department Admin's data."
        action={
          <Input
            placeholder="Search name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-56"
          />
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  {ROLES.map((role) => (
                    <TableHead key={role.value} className="whitespace-nowrap">
                      {role.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-56">Department</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No user accounts found.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="align-top">
                        <p className="text-sm font-medium">{user.fullName || "—"}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </TableCell>
                      {ROLES.map((role) => (
                        <TableCell key={role.value} className="align-top">
                          <Checkbox
                            aria-label={`${role.label} for ${user.email}`}
                            checked={user.roles.includes(role.value)}
                            disabled={rolesMutation.isPending}
                            onCheckedChange={(checked) => toggleRole(user, role.value, Boolean(checked))}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="align-top">
                        <Select
                          value={user.departmentId ?? NO_DEPARTMENT}
                          onValueChange={(value) =>
                            departmentMutation.mutate({
                              userId: user.id,
                              departmentId: value === NO_DEPARTMENT ? null : value,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="No department" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                            {(departmentsQuery.data ?? []).map((department: any) => (
                              <SelectItem key={department.id} value={department.id}>
                                {department.code} — {department.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
