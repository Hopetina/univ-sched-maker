// Server-only helpers for user / role administration.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Repositories } from "./db/repositories.server";
import { writeAudit, type Actor } from "./scheduling/scheduling.service.server";

export type AppRoleName = "system_admin" | "department_admin" | "lecturer" | "student";

export const ALL_ROLES: AppRoleName[] = ["system_admin", "department_admin", "lecturer", "student"];

/** Roles that must always be attached to a department. */
const DEPARTMENT_SCOPED_ROLES: AppRoleName[] = ["department_admin", "lecturer", "student"];

export interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  departmentId: string | null;
  roles: AppRoleName[];
  isActive: boolean;
  lastSignInAt: string | null;
  passwordResetRequired: boolean;
  linkedRecord: { type: "student" | "lecturer"; id: string; label: string } | null;
}

export async function assertSystemAdmin(repos: Repositories, userId: string): Promise<void> {
  const roles = (await repos.userRoles.list({ filters: { user_id: userId } })) as unknown as {
    role: AppRoleName;
  }[];
  if (!roles.some((r) => r.role === "system_admin")) {
    throw new Error("Only a System Admin may manage users and roles.");
  }
}

function requireDepartment(roles: AppRoleName[], departmentId: string | null) {
  if (departmentId) return;
  if (roles.some((role) => DEPARTMENT_SCOPED_ROLES.includes(role))) {
    throw new Error("Department Admins, Lecturers and Students must be assigned to a department.");
  }
}

export async function listUsersWithRoles(repos: Repositories): Promise<ManagedUser[]> {
  const [profiles, roles, students, lecturers] = await Promise.all([
    repos.profiles.list({ orderBy: "created_at" }),
    repos.userRoles.list({}),
    repos.students.list({}),
    repos.lecturers.list({}),
  ]);
  const byUser = new Map<string, AppRoleName[]>();
  for (const row of roles as unknown as { user_id: string; role: AppRoleName }[]) {
    byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row.role]);
  }
  const studentByProfile = new Map(
    (students as unknown as { id: string; profile_id: string | null; student_number: string; full_name: string }[])
      .filter((s) => s.profile_id)
      .map((s) => [s.profile_id as string, s]),
  );
  const lecturerByProfile = new Map(
    (lecturers as unknown as { id: string; profile_id: string | null; staff_number: string; full_name: string }[])
      .filter((l) => l.profile_id)
      .map((l) => [l.profile_id as string, l]),
  );
  return (profiles as unknown as {
    id: string;
    full_name: string;
    email: string;
    department_id: string | null;
    password_reset_required: boolean;
  }[]).map((profile) => {
    const student = studentByProfile.get(profile.id);
    const lecturer = lecturerByProfile.get(profile.id);
    const linkedRecord = student
      ? { type: "student" as const, id: student.id, label: `${student.student_number} — ${student.full_name}` }
      : lecturer
        ? { type: "lecturer" as const, id: lecturer.id, label: `${lecturer.staff_number} — ${lecturer.full_name}` }
        : null;
    return {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email || "",
      departmentId: profile.department_id,
      roles: byUser.get(profile.id) ?? [],
      isActive: true,
      lastSignInAt: null,
      passwordResetRequired: Boolean(profile.password_reset_required),
      linkedRecord,
    };
  });
}

export async function setUserRoles(
  repos: Repositories,
  actor: Actor,
  targetUserId: string,
  nextRoles: AppRoleName[],
): Promise<{ ok: true }> {
  const desired = nextRoles.filter((role) => ALL_ROLES.includes(role));
  if (targetUserId === actor.userId && !desired.includes("system_admin")) {
    throw new Error("You cannot remove your own System Admin role.");
  }

  const profile = await repos.profiles.getById(targetUserId);
  requireDepartment(desired, (profile as unknown as { department_id: string | null } | null)?.department_id ?? null);

  const existing = (await repos.userRoles.list({ filters: { user_id: targetUserId } })) as unknown as {
    id: string;
    role: AppRoleName;
  }[];

  for (const row of existing) {
    if (!desired.includes(row.role)) await repos.userRoles.remove(row.id);
  }
  for (const role of desired) {
    if (!existing.some((row) => row.role === role)) {
      await repos.userRoles.create({ user_id: targetUserId, role });
    }
  }

  await writeAudit(repos, actor, {
    action: "user_roles.set",
    entity: "user_roles",
    entityId: targetUserId,
    details: { roles: desired },
  });
  return { ok: true };
}

export async function setUserDepartment(
  repos: Repositories,
  actor: Actor,
  targetUserId: string,
  departmentId: string | null,
): Promise<{ ok: true }> {
  const roles = (await repos.userRoles.list({ filters: { user_id: targetUserId } })) as unknown as {
    role: AppRoleName;
  }[];
  requireDepartment(roles.map((r) => r.role), departmentId);

  await repos.profiles.update(targetUserId, { department_id: departmentId });
  await writeAudit(repos, actor, {
    action: "profiles.set_department",
    entity: "profiles",
    entityId: targetUserId,
    details: { departmentId },
  });
  return { ok: true };
}

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  departmentId: string | null;
  roles: AppRoleName[];
}

export async function createManagedUserAccount(
  repos: Repositories,
  actor: Actor,
  input: CreateUserInput,
): Promise<{ ok: true; userId: string }> {
  const email = input.email.trim().toLowerCase();
  const roles = input.roles.filter((role) => ALL_ROLES.includes(role));
  if (!email) throw new Error("An email address is required.");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (roles.length === 0) throw new Error("Assign at least one role.");
  requireDepartment(roles, input.departmentId);

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error || !data.user) throw new Error(error?.message ?? "Could not create the account.");
  const userId = data.user.id;

  // The signup trigger creates the profile and a default student role.
  await repos.profiles.update(userId, {
    full_name: input.fullName,
    email,
    department_id: input.departmentId,
    password_reset_required: true,
  });
  await setUserRoles(repos, actor, userId, roles);

  await writeAudit(repos, actor, {
    action: "users.create",
    entity: "profiles",
    entityId: userId,
    details: { email, roles, departmentId: input.departmentId },
  });
  return { ok: true, userId };
}

export async function updateManagedUserDetails(
  repos: Repositories,
  actor: Actor,
  targetUserId: string,
  values: { fullName: string; email: string; departmentId: string | null },
): Promise<{ ok: true }> {
  const email = values.email.trim().toLowerCase();
  if (!email) throw new Error("An email address is required.");
  const roles = (await repos.userRoles.list({ filters: { user_id: targetUserId } })) as unknown as {
    role: AppRoleName;
  }[];
  requireDepartment(roles.map((r) => r.role), values.departmentId);

  const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
    email,
    email_confirm: true,
    user_metadata: { full_name: values.fullName },
  });
  if (error) throw new Error(error.message);

  await repos.profiles.update(targetUserId, {
    full_name: values.fullName,
    email,
    department_id: values.departmentId,
  });
  await writeAudit(repos, actor, {
    action: "users.update",
    entity: "profiles",
    entityId: targetUserId,
    details: { email, fullName: values.fullName, departmentId: values.departmentId },
  });
  return { ok: true };
}

export async function resetManagedUserPassword(
  repos: Repositories,
  actor: Actor,
  targetUserId: string,
  password: string,
): Promise<{ ok: true }> {
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, { password });
  if (error) throw new Error(error.message);
  await repos.profiles.update(targetUserId, { password_reset_required: true });
  await writeAudit(repos, actor, {
    action: "users.reset_password",
    entity: "profiles",
    entityId: targetUserId,
    details: {},
  });
  return { ok: true };
}

export async function setManagedUserActive(
  repos: Repositories,
  actor: Actor,
  targetUserId: string,
  isActive: boolean,
): Promise<{ ok: true }> {
  if (targetUserId === actor.userId && !isActive) {
    throw new Error("You cannot deactivate your own account.");
  }
  const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
    ban_duration: isActive ? "none" : "876000h",
  } as never);
  if (error) throw new Error(error.message);
  await writeAudit(repos, actor, {
    action: isActive ? "users.activate" : "users.deactivate",
    entity: "profiles",
    entityId: targetUserId,
    details: { isActive },
  });
  return { ok: true };
}

export function randomTemporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `Tmp-${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14)}`;
}

/** Sets a random password and flags the account so it must be changed at next sign-in. */
export async function generateTemporaryPassword(
  repos: Repositories,
  actor: Actor,
  targetUserId: string,
): Promise<{ ok: true; password: string }> {
  const password = randomTemporaryPassword();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, { password });
  if (error) throw new Error(error.message);
  await repos.profiles.update(targetUserId, { password_reset_required: true });
  await writeAudit(repos, actor, {
    action: "users.generate_temp_password",
    entity: "profiles",
    entityId: targetUserId,
    details: {},
  });
  return { ok: true, password };
}

/** Flags the account so the user must change their password at next sign-in, without changing it now. */
export async function forcePasswordChange(
  repos: Repositories,
  actor: Actor,
  targetUserId: string,
): Promise<{ ok: true }> {
  await repos.profiles.update(targetUserId, { password_reset_required: true });
  await writeAudit(repos, actor, {
    action: "users.force_password_change",
    entity: "profiles",
    entityId: targetUserId,
    details: {},
  });
  return { ok: true };
}

/** Called by a signed-in user after they change their own password. */
export async function clearOwnPasswordResetFlag(repos: Repositories, userId: string): Promise<{ ok: true }> {
  await repos.profiles.update(userId, { password_reset_required: false });
  return { ok: true };
}

/** Creates a login account for an existing lecturer record and links it — the approved workflow for staff accounts. */
export async function createLecturerLoginAccount(
  repos: Repositories,
  actor: Actor,
  lecturerId: string,
): Promise<{ ok: true; password: string }> {
  const lecturer = (await repos.lecturers.getById(lecturerId)) as unknown as {
    id: string;
    profile_id: string | null;
    department_id: string;
    full_name: string;
    email: string;
  } | null;
  if (!lecturer) throw new Error("Lecturer record not found.");
  if (lecturer.profile_id) throw new Error("This lecturer already has a login account.");
  if (!lecturer.email) throw new Error("The lecturer record needs an email address first.");

  const password = randomTemporaryPassword();
  const { userId } = await createManagedUserAccount(repos, actor, {
    email: lecturer.email,
    password,
    fullName: lecturer.full_name,
    departmentId: lecturer.department_id,
    roles: ["lecturer"],
  });
  await repos.lecturers.update(lecturerId, { profile_id: userId });
  return { ok: true, password };
}
