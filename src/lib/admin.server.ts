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

async function authUserIndex() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);
  const map = new Map<string, { banned: boolean; lastSignInAt: string | null; email: string }>();
  for (const user of data.users) {
    const bannedUntil = (user as unknown as { banned_until?: string | null }).banned_until ?? null;
    map.set(user.id, {
      banned: Boolean(bannedUntil && new Date(bannedUntil).getTime() > Date.now()),
      lastSignInAt: user.last_sign_in_at ?? null,
      email: user.email ?? "",
    });
  }
  return map;
}

export async function listUsersWithRoles(repos: Repositories): Promise<ManagedUser[]> {
  const [profiles, roles, authIndex] = await Promise.all([
    repos.profiles.list({ orderBy: "created_at" }),
    repos.userRoles.list({}),
    authUserIndex(),
  ]);
  const byUser = new Map<string, AppRoleName[]>();
  for (const row of roles as unknown as { user_id: string; role: AppRoleName }[]) {
    byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row.role]);
  }
  return (profiles as unknown as {
    id: string;
    full_name: string;
    email: string;
    department_id: string | null;
  }[]).map((profile) => {
    const auth = authIndex.get(profile.id);
    return {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email || auth?.email || "",
      departmentId: profile.department_id,
      roles: byUser.get(profile.id) ?? [],
      isActive: auth ? !auth.banned : true,
      lastSignInAt: auth?.lastSignInAt ?? null,
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
