// Repository layer: the only place that talks to the database directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type DB = SupabaseClient<Database>;
export type TableName = keyof Database["public"]["Tables"];
export type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"];

export interface ListOptions {
  select?: string;
  filters?: Record<string, string | number | boolean | null>;
  inFilter?: { column: string; values: (string | number)[] };
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
}

export function createRepository<T extends TableName>(db: DB, table: T) {
  return {
    table,
    async list(options: ListOptions = {}): Promise<Row<T>[]> {
      let query = (db.from(table) as any).select(options.select ?? "*");
      for (const [column, value] of Object.entries(options.filters ?? {})) {
        query = value === null ? query.is(column, null) : query.eq(column, value);
      }
      if (options.inFilter) query = query.in(options.inFilter.column, options.inFilter.values);
      if (options.orderBy) query = query.order(options.orderBy, { ascending: options.ascending ?? true });
      if (options.limit) query = query.limit(options.limit);
      const { data, error } = await query;
      if (error) throw new Error(`${String(table)}.list: ${error.message}`);
      return (data ?? []) as Row<T>[];
    },
    async getById(id: string, select = "*"): Promise<Row<T> | null> {
      const { data, error } = await (db.from(table) as any).select(select).eq("id", id).maybeSingle();
      if (error) throw new Error(`${String(table)}.getById: ${error.message}`);
      return (data ?? null) as Row<T> | null;
    },
    async create(values: Record<string, unknown>): Promise<Row<T>> {
      const { data, error } = await (db.from(table) as any).insert(values).select("*").single();
      if (error) throw new Error(`${String(table)}.create: ${error.message}`);
      return data as Row<T>;
    },
    async update(id: string, values: Record<string, unknown>): Promise<Row<T>> {
      const { data, error } = await (db.from(table) as any).update(values).eq("id", id).select("*").single();
      if (error) throw new Error(`${String(table)}.update: ${error.message}`);
      return data as Row<T>;
    },
    async remove(id: string): Promise<void> {
      const { error } = await (db.from(table) as any).delete().eq("id", id);
      if (error) throw new Error(`${String(table)}.remove: ${error.message}`);
    },
    async count(filters: Record<string, string | number | boolean> = {}): Promise<number> {
      let query = (db.from(table) as any).select("id", { count: "exact", head: true });
      for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
      const { count, error } = await query;
      if (error) throw new Error(`${String(table)}.count: ${error.message}`);
      return count ?? 0;
    },
  };
}

export function createRepositories(db: DB) {
  return {
    db,
    faculties: createRepository(db, "faculties"),
    departments: createRepository(db, "departments"),
    lecturers: createRepository(db, "lecturers"),
    students: createRepository(db, "students"),
    modules: createRepository(db, "modules"),
    studentModules: createRepository(db, "student_modules"),
    venues: createRepository(db, "venues"),
    examPeriods: createRepository(db, "exam_periods"),
    publicHolidays: createRepository(db, "public_holidays"),
    timeslots: createRepository(db, "timeslots"),
    exams: createRepository(db, "exams"),
    auditLogs: createRepository(db, "audit_logs"),
    profiles: createRepository(db, "profiles"),
    userRoles: createRepository(db, "user_roles"),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
