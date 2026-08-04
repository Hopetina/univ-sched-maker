// Server-only helpers for user / role administration.
import type { Repositories } from "./db/repositories.server";
import { writeAudit, type Actor } from "./scheduling/scheduling.service.server";

export type AppRoleName = "system_admin" | "department_admin" | "lecturer" | "student";

export const ALL_ROLES: AppRoleName[] = ["system_admin", "department_admin", "lecturer", "student"];

export interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  departmentId: string | null;
  roles: AppRoleName[];
}

export async function assertSystemAdmin(repos: Repositories, userId: string): Promise<void> {
  const roles = (await repos.userRoles.list({ filters: { user_id: userId } })) as unknown as {
    role: AppRoleName;
  }[];
  if (!roles.some((r) => r.role === "system_admin")) {
    throw new Error("Only a System Admin may manage users and roles.");
  }
}

export async function listUsersWithRoles(repos: Repositories): Promise<ManagedUser[]> {
  const [profiles, roles] = await Promise.all([
    repos.profiles.list({ orderBy: "created_at" }),
    repos.userRoles.list({}),
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
  }[]).map((profile) => ({
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    departmentId: profile.department_id,
    roles: byUser.get(profile.id) ?? [],
  }));
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
  await repos.profiles.update(targetUserId, { department_id: departmentId });
  await writeAudit(repos, actor, {
    action: "profiles.set_department",
    entity: "profiles",
    entityId: targetUserId,
    details: { departmentId },
  });
  return { ok: true };
}
