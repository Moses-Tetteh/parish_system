import type { RegisterDef } from "@/lib/registers/types";

/**
 * Holy Matrimony is the one register that is NOT one-person-per-row: a marriage record owns two
 * `spouses` rows (groom + bride) written together. The marriage and spouse parts are described with the
 * same RegisterDef shape as every other register, so validation, permissions, field types and the form
 * controls are reused, not re-implemented. (Fields ported from includes/field_specs.php.)
 */
export const MARRIAGE_DEF: RegisterDef = {
  key: "matrimony",
  title: "Holy Matrimony Register",
  label: "Marriage",
  table: "matrimony_records",
  permission: "registers",
  export: true,
  listColumns: ["record_no", "date_of_marriage", "minister"],
  searchField: "record_no",
  fields: [
    { key: "record_no", label: "Nus (Record No.)", type: "text" },
    { key: "date_of_marriage", label: "MATRIM — Dies (Date of Marriage)", type: "date" },
    { key: "place_of_marriage", label: "MATRIM — Locus (Place of Marriage)", type: "text" },
    { key: "banns_published_dates", label: "B. Npt (Banns Published)", type: "text" },
    { key: "dispensation", label: "Despensatio (Dispensation)", type: "text" },
    {
      key: "marriage_type", label: "Marriage Type (for the annual report)", type: "select",
      options: { catholic: "Catholic – Catholic", mixed_religion: "Mixed religion", disparity_of_cult: "Disparity of cult", other: "Other" },
    },
    { key: "minister", label: "Minister", type: "text" },
    { key: "witnesses", label: "Testes (Witnesses)", type: "text" },
    { key: "notes", label: "Additional Notes", type: "textarea" },
  ],
};

export const SPOUSE_DEF: RegisterDef = {
  key: "spouses",
  title: "Spouse",
  label: "Spouse",
  table: "spouses",
  permission: "registers",
  listColumns: ["given_name", "surname"],
  searchField: "surname",
  fields: [
    { key: "given_name", label: "Nomen (Given Name)", type: "text", required: true },
    { key: "surname", label: "Cognomen (Surname)", type: "text", required: true },
    { key: "father_name", label: "Pater (Father)", type: "text" },
    { key: "mother_name", label: "Mater (Mother)", type: "text" },
    { key: "origin", label: "Origo (Origin)", type: "text" },
    { key: "date_of_birth", label: "Dies Nat (Date of Birth)", type: "partial_date" },
    { key: "domicile", label: "Domicilium (Domicile)", type: "text" },
    { key: "baptism_date", label: "BAPTISMI — Dies (Date)", type: "date" },
    { key: "baptism_place", label: "BAPTISMI — Locus (Place)", type: "text" },
    { key: "baptism_register_ref", label: "Nus (Baptism Register No. — for marginal note)", type: "baptism_ref" },
  ],
};

export const SPOUSE_ROLES = ["groom", "bride"] as const;
export type SpouseRole = (typeof SPOUSE_ROLES)[number];
export const ROLE_LABEL: Record<SpouseRole, string> = { groom: "Groom", bride: "Bride" };
