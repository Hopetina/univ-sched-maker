import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSessionContext, type AppRole } from "@/lib/exam.functions";

export interface SessionContext {
  userId: string;
  email: string;
  fullName: string;
  departmentId: string | null;
  roles: AppRole[];
  studentId: string | null;
  lecturerId: string | null;
  passwordResetRequired: boolean;
}


export function useSession() {
  const fetchSession = useServerFn(getSessionContext);
  const query = useQuery({
    queryKey: ["session-context"],
    queryFn: () => fetchSession() as unknown as Promise<SessionContext>,
    staleTime: 60_000,
  });

  const roles = query.data?.roles ?? [];
  return {
    ...query,
    session: query.data,
    roles,
    isSystemAdmin: roles.includes("system_admin"),
    isDepartmentAdmin: roles.includes("department_admin"),
    isAdmin: roles.includes("system_admin") || roles.includes("department_admin"),
    isLecturer: roles.includes("lecturer"),
    isStudent: roles.includes("student"),
  };
}
