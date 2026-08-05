import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, KeyRound, ShieldCheck, ShieldOff, Wand2 } from "lucide-react";
import { toast } from "sonner";

import {
  forceUserPasswordChange,
  generateUserTempPassword,
  listManagedUsers,
  listRows,
  resetUserPassword,
  setUserActive,
  updateUserDepartment,
  updateUserRoles,
} from "@/lib/exam.functions";
import type { AppRole } from "@/lib/exam.functions";
import { useSession } from "@/hooks/use-session";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users & roles — ExamSched" },
      { name: "description", content: "Account administration: access, roles, department scope and password security." },
      { property: "og:title", content: "Users & roles — ExamSched" },
      { property: "og:description", content: "System Admin control over access and permissions for existing accounts." },
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
const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

const NO_DEPARTMENT = "__none__";
const ALL = "__all__";

interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  departmentId: string | null;
  roles: AppRole[];
  isActive: boolean;
  lastSignInAt: string | null;
  passwordResetRequired: boolean;
  linkedRecord: { type: "student" | "lecturer"; id: string; label: string } | null;
}

function UsersPage() {
  const { isSystemAdmin, isLoading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const fetchUsers = useServerFn(listManagedUsers);
  const fetchRows = useServerFn(listRows);
  const saveRoles = useServerFn(updateUserRoles);
  const saveDepartment = useServerFn(updateUserDepartment);
  const resetPassword = useServerFn(resetUserPassword);
  const generateTempPassword = useServerFn(generateUserTempPassword);
  const forcePasswordChange = useServerFn(forceUserPasswordChange);
  const toggleActive = useServerFn(setUserActive);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [departmentFilter, setDepartmentFilter] = useState(ALL);

  const [passwordFor, setPasswordFor] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [tempPasswordResult, setTempPasswordResult] = useState<{ email: string; password: string } | null>(null);

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

  function refresh(message: string) {
    toast.success(message);
    queryClient.invalidateQueries({ queryKey: ["managed-users"] });
    queryClient.invalidateQueries({ queryKey: ["session-context"] });
  }
  const onError = (error: Error) => toast.error(error.message);

  const rolesMutation = useMutation({
    mutationFn: (input: { userId: string; roles: AppRole[] }) => saveRoles({ data: input }),
    onSuccess: () => refresh("Roles updated"),
    onError,
  });

  const departmentMutation = useMutation({
    mutationFn: (input: { userId: string; departmentId: string | null }) => saveDepartment({ data: input }),
    onSuccess: () => refresh("Department updated"),
    onError,
  });

  const passwordMutation = useMutation({
    mutationFn: () => resetPassword({ data: { userId: passwordFor!.id, password: newPassword } }),
    onSuccess: () => {
      setPasswordFor(null);
      setNewPassword("");
      refresh("Password reset — the account must change it at next sign-in");
    },
    onError,
  });

  const tempPasswordMutation = useMutation({
    mutationFn: (user: ManagedUser) => generateTempPassword({ data: { userId: user.id } }) as Promise<{ password: string }>,
    onSuccess: (result, user) => {
      setTempPasswordResult({ email: user.email, password: result.password });
      refresh("Temporary password generated");
    },
    onError,
  });

  const forceChangeMutation = useMutation({
    mutationFn: (user: ManagedUser) => forcePasswordChange({ data: { userId: user.id } }),
    onSuccess: () => refresh("The account must change its password at next sign-in"),
    onError,
  });

  const activeMutation = useMutation({
    mutationFn: (input: { userId: string; isActive: boolean }) => toggleActive({ data: input }),
    onSuccess: () => refresh("Account status updated"),
    onError,
  });

  const users = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (usersQuery.data ?? []).filter((user) => {
      if (term && !`${user.fullName} ${user.email}`.toLowerCase().includes(term)) return false;
      if (roleFilter !== ALL && !user.roles.includes(roleFilter as AppRole)) return false;
      if (departmentFilter !== ALL) {
        const value = departmentFilter === NO_DEPARTMENT ? null : departmentFilter;
        if (user.departmentId !== value) return false;
      }
      return true;
    });
  }, [usersQuery.data, search, roleFilter, departmentFilter]);

  if (!sessionLoading && !isSystemAdmin) {
    return (
      <div>
        <PageHeader title="Users & roles" description="Restricted area." />
        <Card>
          <CardContent className="p-8 text-sm text-muted-foreground">
            Only a System Admin may manage access, roles and department assignment.
          </CardContent>
        </Card>
      </div>
    );
  }

  function toggleRole(user: ManagedUser, role: AppRole, checked: boolean) {
    const next = checked ? [...user.roles, role] : user.roles.filter((r) => r !== role);
    rolesMutation.mutate({ userId: user.id, roles: next });
  }

  function viewLinkedRecord(user: ManagedUser) {
    if (!user.linkedRecord) return;
    const to = user.linkedRecord.type === "student" ? "/students" : "/lecturers";
    const q = user.linkedRecord.label.split(" — ")[0];
    navigate({ to, search: { q } as never });
  }

  const departments = departmentsQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="Users & roles"
        description="A synchronized account-administration directory. Every row is an account already linked to the authentication system — manage access, roles, department scope and password security here. Accounts are created through Student Import or approved administrative workflows, never on this page."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Search name or email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-64"
          aria-label="Search name or email"
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-52" aria-label="Role">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All roles</SelectItem>
            {ROLES.map((role) => (
              <SelectItem key={role.value} value={role.value}>
                {role.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-56" aria-label="Department">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
            {departments.map((department: any) => (
              <SelectItem key={department.id} value={department.id}>
                {department.code} — {department.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Full name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-56">Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead>Password reset required</TableHead>
                  <TableHead>Account active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : usersQuery.isError ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center">
                      <p className="text-sm font-medium text-destructive">Failed to load user accounts</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(usersQuery.error as Error)?.message ?? "Unknown error"}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                      No user accounts match these filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="align-top text-sm">{user.email}</TableCell>
                      <TableCell className="align-top text-sm">{user.fullName || "—"}</TableCell>
                      <TableCell className="align-top">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex flex-wrap gap-1" aria-label={`Edit roles for ${user.email}`}>
                              {user.roles.length === 0 ? (
                                <Badge variant="outline">No role</Badge>
                              ) : (
                                user.roles.map((role) => (
                                  <Badge key={role} variant="secondary">
                                    {ROLE_LABEL[role] ?? role}
                                  </Badge>
                                ))
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64">
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Roles
                            </p>
                            <div className="space-y-2">
                              {ROLES.map((role) => (
                                <label key={role.value} className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={user.roles.includes(role.value)}
                                    disabled={rolesMutation.isPending}
                                    onCheckedChange={(checked) => toggleRole(user, role.value, Boolean(checked))}
                                  />
                                  {role.label}
                                </label>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
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
                          <SelectTrigger aria-label={`Department for ${user.email}`}>
                            <SelectValue placeholder="No department" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                            {departments.map((department: any) => (
                              <SelectItem key={department.id} value={department.id}>
                                {department.code} — {department.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        <span className={user.isActive ? "text-foreground" : "text-destructive"}>
                          {user.isActive ? "Active" : "Deactivated"}
                        </span>
                      </TableCell>
                      <TableCell className="align-top text-xs text-muted-foreground">
                        {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={user.passwordResetRequired ? "destructive" : "outline"}>
                          {user.passwordResetRequired ? "Required" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={user.isActive ? "secondary" : "destructive"}>
                          {user.isActive ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right align-top whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Reset password for ${user.email}`}
                          title="Reset password"
                          onClick={() => {
                            setPasswordFor(user);
                            setNewPassword("");
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Generate temporary password for ${user.email}`}
                          title="Generate temporary password"
                          disabled={tempPasswordMutation.isPending}
                          onClick={() => tempPasswordMutation.mutate(user)}
                        >
                          <Wand2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Force password change for ${user.email}`}
                          title="Force password change"
                          disabled={forceChangeMutation.isPending || user.passwordResetRequired}
                          onClick={() => forceChangeMutation.mutate(user)}
                        >
                          <ShieldOff className="h-4 w-4 text-amber-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${user.isActive ? "Deactivate" : "Activate"} ${user.email}`}
                          title={user.isActive ? "Deactivate account" : "Activate account"}
                          disabled={activeMutation.isPending}
                          onClick={() => activeMutation.mutate({ userId: user.id, isActive: !user.isActive })}
                        >
                          {user.isActive ? (
                            <ShieldOff className="h-4 w-4 text-destructive" />
                          ) : (
                            <ShieldCheck className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`View linked record for ${user.email}`}
                          title="View linked record"
                          disabled={!user.linkedRecord}
                          onClick={() => viewLinkedRecord(user)}
                        >
                          <ExternalLink className="h-4 w-4" />
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

      <Dialog open={Boolean(passwordFor)} onOpenChange={(open) => !open && setPasswordFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password — {passwordFor?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reset-password-value">New password</Label>
            <Input
              id="reset-password-value"
              type="text"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The account will be required to change this password at next sign-in.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordFor(null)}>
              Cancel
            </Button>
            <Button onClick={() => passwordMutation.mutate()} disabled={passwordMutation.isPending || newPassword.length < 8}>
              {passwordMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(tempPasswordResult)} onOpenChange={(open) => !open && setTempPasswordResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password generated</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Share this password with {tempPasswordResult?.email} through a secure channel. It will not be shown again and
            the account must change it at next sign-in.
          </p>
          <Input readOnly value={tempPasswordResult?.password ?? ""} className="font-mono" />
          <DialogFooter>
            <Button onClick={() => setTempPasswordResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
