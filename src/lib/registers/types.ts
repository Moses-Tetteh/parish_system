import type { Permission } from "@/lib/auth/permissions";

export type FieldType =
  | "text" | "textarea" | "date" | "time" | "number" | "money" | "year"
  | "checkbox" | "select" | "display" | "lookup" | "partial_date"
  | "baptism_ref" | "communion_ref" | "confirmation_ref" | "section";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Record<string, string>;
  lookup?: "outstation" | "household" | "baptism" | "communion" | "death" | "confirmation" | "holy_orders";
  /** Field-level permission: users without it see "Restricted" and can never overwrite the value. */
  permission?: Permission;
}

export interface RegisterDef {
  key: string;
  title: string;
  label: string;
  /** Database table name (resolved to the Drizzle table at runtime). */
  table: string;
  fields: FieldDef[];
  listColumns: string[];
  searchField: string;
  filters?: string[];
  dateFilter?: string;
  orderBy?: [string, "asc" | "desc"][];
  permission: Permission;
  sensitive?: boolean;
  export?: boolean;
  certificate?: boolean;
  import?: boolean;
  duplicateCheck?: boolean;
  allowDelete?: boolean;
  deleteRoles?: string[];
  serviceStatusField?: string;
  intro?: string;
  defaults?: Record<string, string | number>;
  hooks?: Partial<Record<"index_header" | "row_actions" | "before_save" | "after_save" | "after_form", string>>;
}

export type RecordRow = Record<string, unknown> & { id: number };
