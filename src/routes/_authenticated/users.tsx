import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Pencil, Plus, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import {
  createManagedUser,
  listManagedUsers,
  listRows,
  resetUserPassword,
  setUserActive,
  updateManagedUser,
  updateUserDepartment,
  updateUserRoles,
} from "@/lib/exam.functions";
import type { AppRole } from "@/lib/exam.functions";
import { useSession } from "@/hooks/use-session";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users & roles — ExamSched" },
      { name: "description", content: "Create accounts, grant roles, reset passwords and assign departments." },
      { property: "og:title", content: "Users & roles — ExamSched" },
      { property: "og:description", content: "System Admin control over accounts, roles and department assignment." },
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
const ALL = "__all__";

interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  departmentId: string | null;
  roles: AppRole[];
  isActive: boolean;
  lastSignInAt: string | null;
}

function UsersPage() {
  const { isSystemAdmin, isLoading: sessionLoading } = useSession();
  const fetchUsers = useServerFn(listManagedUsers);
  const fetchRows = useServerFn(listRows);
  const saveRoles = useServerFn(updateUserRoles);
  const saveDepartment = useServerFn(updateUserDepartment);
  const createUser = useServerFn(createManagedUser);
  const updateUser = useServerFn(updateManagedUser);
  const resetPassword = useServerFn(resetUserPassword);
  const toggleActive = useServerFn(setUserActive);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [departmentFilter, setDepartmentFilter] = useState(ALL);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [passwordFor, setPasswordFor] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    departmentId: NO_DEPARTMENT,
    roles: ["student"] as AppRole[],
  });
  const [editForm, setEditForm] = useState({ fullName: "", email: "", departmentId: NO_DEPARTMENT });

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

  const createMutation = useMutation({
    mutationFn: () =>
      createUser({
        data: {
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          departmentId: form.departmentId === NO_DEPARTMENT ? null : form.departmentId,
          roles: form.roles,
        },
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setForm({ email: "", password: "", fullName: "", departmentId: NO_DEPARTMENT, roles: ["student"] });
      refresh("User account created");
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateUser({
        data: {
          userId: editing!.id,
          fullName: editForm.fullName,
          email: editForm.email,
          departmentId: editForm.departmentId === NO_DEPARTMENT ? null : editForm.departmentId,
        },
      }),
    onSuccess: () => {
      setEditing(null);
      refresh("User details updated");
    },
    onError,
  });

  const passwordMutation = useMutation({
    mutationFn: () => resetPassword({ data: { userId: passwordFor!.id, password: newPassword } }),
    onSuccess: () => {
      setPasswordFor(null);
      setNewPassword("");
      refresh("Password saved");
    },
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
            Only a System Admin may create accounts and manage roles or department assignment.
          </CardContent>
        </Card>
      </div>
    );
  }

  function toggleRole(user: ManagedUser, role: AppRole, checked: boolean) {
    const next = checked ? [...user.roles, role] : user.roles.filter((r) => r !== role);
    rolesMutation.mutate({ userId: user.id, roles: next });
  }

  const departments = departmentsQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="Users & roles"
        description="Accounts exist only when a System Admin creates them. Grant roles, set the department that scopes a Department Admin's data, reset passwords and deactivate access."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New user
          </Button>
        }
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
                  <TableHead>User</TableHead>
                  {ROLES.map((role) => (
                    <TableHead key={role.value} className="whitespace-nowrap">
                      {role.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-56">Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      No user accounts match these filters.
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
                      <TableCell className="text-right align-top">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${user.email}`}
                          onClick={() => {
                            setEditing(user);
                            setEditForm({
                              fullName: user.fullName,
                              email: user.email,
                              departmentId: user.departmentId ?? NO_DEPARTMENT,
                            });
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Reset password for ${user.email}`}
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
                          aria-label={`${user.isActive ? "Deactivate" : "Activate"} ${user.email}`}
                          disabled={activeMutation.isPending}
                          onClick={() => activeMutation.mutate({ userId: user.id, isActive: !user.isActive })}
                        >
                          {user.isActive ? (
                            <ShieldOff className="h-4 w-4 text-destructive" />
                          ) : (
                            <ShieldCheck className="h-4 w-4" />
                          )}
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New user account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-full-name">Full name</Label>
              <Input
                id="new-full-name"
                value={form.fullName}
                onChange={(event) => setForm((f) => ({ ...f, fullName: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-user-password">Temporary password</Label>
              <Input
                id="new-user-password"
                type="text"
                value={form.password}
                onChange={(event) => setForm((f) => ({ ...f, password: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Roles</Label>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((role) => (
                  <label key={role.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.roles.includes(role.value)}
                      onCheckedChange={(checked) =>
                        setForm((f) => ({
                          ...f,
                          roles: checked ? [...f.roles, role.value] : f.roles.filter((r) => r !== role.value),
                        }))
                      }
                    />
                    {role.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select
                value={form.departmentId}
                onValueChange={(value) => setForm((f) => ({ ...f, departmentId: value }))}
              >
                <SelectTrigger aria-label="Department">
                  <SelectValue placeholder="Select department" />
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
              <p className="text-xs text-muted-foreground">
                Department Admins, Lecturers and Students must belong to a department.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update user details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-full-name">Full name</Label>
              <Input
                id="edit-full-name"
                value={editForm.fullName}
                onChange={(event) => setEditForm((f) => ({ ...f, fullName: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(event) => setEditForm((f) => ({ ...f, email: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select
                value={editForm.departmentId}
                onValueChange={(value) => setEditForm((f) => ({ ...f, departmentId: value }))}
              >
                <SelectTrigger aria-label="Department">
                  <SelectValue placeholder="Select department" />
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(passwordFor)} onOpenChange={(open) => !open && setPasswordFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{passwordFor?.email}</p>
            <div className="space-y-1.5">
              <Label htmlFor="reset-new-password">New password</Label>
              <Input
                id="reset-new-password"
                type="text"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordFor(null)}>
              Cancel
            </Button>
            <Button onClick={() => passwordMutation.mutate()} disabled={passwordMutation.isPending}>
              {passwordMutation.isPending ? "Saving…" : "Save password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
