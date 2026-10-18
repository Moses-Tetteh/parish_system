/** Serializable view-model shared by server pages and the client form (no server-only imports). */
export type FieldView = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: Record<string, string>;
  lookup?: { id: number; label: string }[];
  restricted?: boolean;
};

export interface FormState {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
  duplicates?: { id: number; name: string }[];
}
