// GENERATED from the PHP application's own register definitions (tools/export-registers.php).
// Edit with care: this is the declarative core that drives list, form, validation, export and
// permissions for every simple register. Re-run the exporter instead of hand-editing if the PHP side changes.
import type { RegisterDef } from "./types";

export const REGISTER_DEFS: RegisterDef[] = [
  {
    "key": "baptism",
    "title": "Baptism Register",
    "label": "Baptism",
    "table": "baptism_records",
    "fields": [
      {
        "key": "record_no",
        "label": "Nus (Record No.)",
        "type": "text"
      },
      {
        "key": "given_name",
        "label": "Nomen (Given Name)",
        "type": "text",
        "required": true
      },
      {
        "key": "surname",
        "label": "Cognomen (Surname)",
        "type": "text",
        "required": true
      },
      {
        "key": "father_name",
        "label": "Pater (Father)",
        "type": "text"
      },
      {
        "key": "mother_name",
        "label": "Mater (Mother)",
        "type": "text"
      },
      {
        "key": "origin",
        "label": "Origo (Origin)",
        "type": "text"
      },
      {
        "key": "date_of_birth",
        "label": "Dies Nat (Date of Birth)",
        "type": "partial_date"
      },
      {
        "key": "date_of_baptism",
        "label": "Dies Bapt (Date of Baptism)",
        "type": "date"
      },
      {
        "key": "place_of_baptism",
        "label": "Locus Bapt (Place of Baptism)",
        "type": "text"
      },
      {
        "key": "minister",
        "label": "Minister",
        "type": "text"
      },
      {
        "key": "mode",
        "label": "Mod (Mode)",
        "type": "text"
      },
      {
        "key": "patrin",
        "label": "Patrin (Godparent/Sponsor)",
        "type": "text"
      },
      {
        "key": "father_religion",
        "label": "Cultus (Pat) — Father's Religion",
        "type": "text"
      },
      {
        "key": "mother_religion",
        "label": "Cultus (Mat) — Mother's Religion",
        "type": "text"
      },
      {
        "key": "communion_ref",
        "label": "Comm (Communion Register No.)",
        "type": "communion_ref"
      },
      {
        "key": "confirmation_ref",
        "label": "Cfrm (Confirmation Register No.)",
        "type": "confirmation_ref"
      },
      {
        "key": "marriage_notes",
        "label": "Notae Matrimon (Marriage Notes)",
        "type": "textarea"
      },
      {
        "key": "marginal_notes",
        "label": "Marginal Notes (Canon 535 §2)",
        "type": "textarea"
      },
      {
        "key": "notes",
        "label": "Additional Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "record_no",
      "given_name",
      "surname",
      "date_of_baptism",
      "minister"
    ],
    "searchField": "surname",
    "permission": "registers"
  },
  {
    "key": "communion",
    "title": "First Communion Register",
    "label": "First Communion",
    "table": "communion_records",
    "fields": [
      {
        "key": "record_no",
        "label": "Nus (Record No.)",
        "type": "text"
      },
      {
        "key": "full_name",
        "label": "Nomen et Cognomen (Full Name)",
        "type": "text",
        "required": true
      },
      {
        "key": "father_name",
        "label": "Pater (Father)",
        "type": "text"
      },
      {
        "key": "mother_name",
        "label": "Mater (Mother)",
        "type": "text"
      },
      {
        "key": "place_of_baptism",
        "label": "Locus Bapt (Place of Baptism)",
        "type": "text"
      },
      {
        "key": "baptism_register_ref",
        "label": "N.I.B (Baptism Register No.)",
        "type": "baptism_ref"
      },
      {
        "key": "notification_sent",
        "label": "Notif (Notification Sent)",
        "type": "checkbox"
      },
      {
        "key": "minister",
        "label": "Minister",
        "type": "text"
      },
      {
        "key": "place",
        "label": "Locus (Place)",
        "type": "text"
      },
      {
        "key": "date_of_communion",
        "label": "Dies Com (Date of Communion)",
        "type": "date"
      },
      {
        "key": "notes",
        "label": "Additional Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "record_no",
      "full_name",
      "date_of_communion",
      "minister"
    ],
    "searchField": "full_name",
    "permission": "registers"
  },
  {
    "key": "confirmation",
    "title": "Confirmation Register",
    "label": "Confirmation",
    "table": "confirmation_records",
    "fields": [
      {
        "key": "record_no",
        "label": "Nus (Record No.)",
        "type": "text"
      },
      {
        "key": "full_name",
        "label": "Nomen et Cognomen (Full Name)",
        "type": "text",
        "required": true
      },
      {
        "key": "confirmation_name",
        "label": "Cfrm Nomen (Confirmation Name)",
        "type": "text"
      },
      {
        "key": "father_name",
        "label": "Pater (Father)",
        "type": "text"
      },
      {
        "key": "sponsor_name",
        "label": "Patrin (Sponsor)",
        "type": "text"
      },
      {
        "key": "mother_name",
        "label": "Mater (Mother)",
        "type": "text"
      },
      {
        "key": "baptism_place",
        "label": "BAPTISM — Locus (Place)",
        "type": "text"
      },
      {
        "key": "baptism_register_ref",
        "label": "BAPTISM — N.L.B (Baptism Register No.)",
        "type": "baptism_ref"
      },
      {
        "key": "notification_sent",
        "label": "Notif (Notification Sent)",
        "type": "checkbox"
      },
      {
        "key": "minister",
        "label": "Minister",
        "type": "text"
      },
      {
        "key": "place",
        "label": "Locus (Place)",
        "type": "text"
      },
      {
        "key": "date_of_confirmation",
        "label": "Dies Cfrm (Date of Confirmation)",
        "type": "date"
      },
      {
        "key": "notes",
        "label": "Additional Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "record_no",
      "full_name",
      "date_of_confirmation",
      "minister"
    ],
    "searchField": "full_name",
    "permission": "registers"
  },
  {
    "key": "death",
    "title": "Death Register",
    "label": "Death",
    "table": "death_records",
    "fields": [
      {
        "key": "full_name",
        "label": "Full Name",
        "type": "text",
        "required": true
      },
      {
        "key": "date_of_birth",
        "label": "Date of Birth",
        "type": "partial_date"
      },
      {
        "key": "date_of_death",
        "label": "Date of Death",
        "type": "date"
      },
      {
        "key": "notes",
        "label": "Additional Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "full_name",
      "date_of_birth",
      "date_of_death"
    ],
    "searchField": "full_name",
    "permission": "registers",
    "allowDelete": true,
    "deleteRoles": [
      "admin",
      "secretary"
    ]
  },
  {
    "key": "parish_priests",
    "title": "Parish Priests",
    "label": "Parish Priest",
    "table": "parish_priests",
    "fields": [
      {
        "key": "full_name",
        "label": "Name",
        "type": "text",
        "required": true
      },
      {
        "key": "role",
        "label": "Role",
        "type": "select",
        "required": true,
        "options": {
          "parish_priest": "Parish Priest (Main)",
          "assistant_priest": "Assistant Priest"
        }
      },
      {
        "key": "date_of_birth",
        "label": "Date of Birth",
        "type": "partial_date"
      },
      {
        "key": "date_baptized",
        "label": "Date of Baptism",
        "type": "date"
      },
      {
        "key": "place_baptized",
        "label": "Place Baptized",
        "type": "text"
      },
      {
        "key": "date_ordained",
        "label": "Date Ordained",
        "type": "date"
      },
      {
        "key": "minister",
        "label": "Minister",
        "type": "text"
      },
      {
        "key": "date_of_arrival",
        "label": "Date of Arrival in the Parish",
        "type": "date"
      },
      {
        "key": "date_of_departure",
        "label": "Date of Leaving the Parish",
        "type": "date"
      },
      {
        "key": "notes",
        "label": "Additional Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "full_name",
      "role",
      "date_ordained",
      "date_of_arrival",
      "date_of_departure"
    ],
    "searchField": "full_name",
    "filters": [
      "role"
    ],
    "permission": "registers",
    "serviceStatusField": "date_of_departure"
  },
  {
    "key": "holy_orders",
    "title": "Holy Orders",
    "label": "Holy Orders",
    "table": "holy_orders",
    "fields": [
      {
        "key": "full_name",
        "label": "Name",
        "type": "text",
        "required": true
      },
      {
        "key": "father_name",
        "label": "Father's Name",
        "type": "text"
      },
      {
        "key": "mother_name",
        "label": "Mother's Name",
        "type": "text"
      },
      {
        "key": "date_of_birth",
        "label": "Date of Birth",
        "type": "partial_date"
      },
      {
        "key": "date_baptized",
        "label": "Date of Baptism",
        "type": "date"
      },
      {
        "key": "place_baptized",
        "label": "Place Baptized",
        "type": "text"
      },
      {
        "key": "baptism_register_ref",
        "label": "Nus (Baptism Register No. — for marginal note)",
        "type": "baptism_ref"
      },
      {
        "key": "seminary_name",
        "label": "Seminary Name",
        "type": "text"
      },
      {
        "key": "starting_date",
        "label": "Starting Date",
        "type": "date"
      },
      {
        "key": "ordination_date",
        "label": "Ordination Date",
        "type": "date"
      },
      {
        "key": "order_type",
        "label": "Type of Holy Orders (e.g. Diaconate, Priesthood, Episcopate)",
        "type": "text"
      },
      {
        "key": "notes",
        "label": "Additional Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "full_name",
      "order_type",
      "seminary_name",
      "ordination_date"
    ],
    "searchField": "full_name",
    "permission": "registers"
  },
  {
    "key": "catechesis_teachers",
    "title": "Catechesis Teachers",
    "label": "Catechesis Teacher",
    "table": "catechesis_teachers",
    "fields": [
      {
        "key": "full_name",
        "label": "Name",
        "type": "text",
        "required": true
      },
      {
        "key": "date_of_birth",
        "label": "Date of Birth",
        "type": "partial_date"
      },
      {
        "key": "date_baptized",
        "label": "Date of Baptism",
        "type": "date"
      },
      {
        "key": "place_baptized",
        "label": "Place Baptized",
        "type": "text"
      },
      {
        "key": "starting_year",
        "label": "Starting Year",
        "type": "year"
      },
      {
        "key": "ending_year",
        "label": "Ending Year",
        "type": "year"
      },
      {
        "key": "notes",
        "label": "Additional Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "full_name",
      "starting_year",
      "ending_year"
    ],
    "searchField": "full_name",
    "permission": "registers"
  },
  {
    "key": "counsellors",
    "title": "Counsellors",
    "label": "Counsellor",
    "table": "counsellors",
    "fields": [
      {
        "key": "full_name",
        "label": "Name",
        "type": "text",
        "required": true
      },
      {
        "key": "date_of_birth",
        "label": "Date of Birth",
        "type": "partial_date"
      },
      {
        "key": "date_baptized",
        "label": "Date of Baptism",
        "type": "date"
      },
      {
        "key": "place_baptized",
        "label": "Place of Baptism",
        "type": "text"
      },
      {
        "key": "partner_name",
        "label": "Partner's Name",
        "type": "text"
      },
      {
        "key": "starting_date",
        "label": "Starting Date",
        "type": "date"
      },
      {
        "key": "ending_date",
        "label": "Ending Date",
        "type": "date"
      },
      {
        "key": "notes",
        "label": "Additional Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "full_name",
      "partner_name",
      "starting_date",
      "ending_date"
    ],
    "searchField": "full_name",
    "permission": "registers"
  },
  {
    "key": "sick_calls",
    "title": "Sick & Anointing Register",
    "label": "Sick Call",
    "table": "sick_calls",
    "fields": [
      {
        "key": "full_name",
        "label": "Name of the Sick Person",
        "type": "text",
        "required": true
      },
      {
        "key": "approx_age",
        "label": "Approximate Age",
        "type": "number"
      },
      {
        "key": "call_type",
        "label": "Type of Visit",
        "type": "select",
        "required": true,
        "options": {
          "anointing": "Anointing of the Sick",
          "viaticum": "Viaticum",
          "home_communion": "Home Communion",
          "confession": "Confession (sick)",
          "pastoral_visit": "Pastoral Visit",
          "emergency": "Emergency / Last Rites"
        }
      },
      {
        "key": "visit_date",
        "label": "Date of Visit",
        "type": "date",
        "required": true
      },
      {
        "key": "minister",
        "label": "Minister",
        "type": "text"
      },
      {
        "key": "place",
        "label": "Place (home / hospital / ward)",
        "type": "text"
      },
      {
        "key": "outstation_id",
        "label": "Outstation",
        "type": "lookup",
        "lookup": "outstation"
      },
      {
        "key": "requested_by",
        "label": "Requested By",
        "type": "text"
      },
      {
        "key": "contact",
        "label": "Contact",
        "type": "text"
      },
      {
        "key": "follow_up_date",
        "label": "Follow-up Visit Date",
        "type": "date"
      },
      {
        "key": "condition_note",
        "label": "Condition / Pastoral Notes (confidential)",
        "type": "textarea"
      },
      {
        "key": "notes",
        "label": "Additional Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "full_name",
      "call_type",
      "visit_date",
      "minister",
      "place"
    ],
    "searchField": "full_name",
    "filters": [
      "call_type"
    ],
    "dateFilter": "visit_date",
    "orderBy": [
      [
        "visit_date",
        "desc"
      ],
      [
        "id",
        "desc"
      ]
    ],
    "permission": "sensitive.sick",
    "sensitive": true,
    "export": true,
    "certificate": false,
    "import": false,
    "duplicateCheck": false,
    "intro": "Confidential pastoral register — visible to priests and administrators only; every view is logged.",
    "hooks": {
      "index_header": "sick_call_summary"
    }
  },
  {
    "key": "mass_intentions",
    "title": "Mass Intentions & Stipends",
    "label": "Mass Intention",
    "table": "mass_intentions",
    "fields": [
      {
        "key": "mass_date",
        "label": "Mass Date",
        "type": "date",
        "required": true
      },
      {
        "key": "mass_time",
        "label": "Mass Time",
        "type": "time"
      },
      {
        "key": "outstation_id",
        "label": "Outstation (blank = main church)",
        "type": "lookup",
        "lookup": "outstation"
      },
      {
        "key": "intention_type",
        "label": "Intention Type",
        "type": "select",
        "required": true,
        "options": {
          "repose_of_soul": "Repose of the Soul",
          "thanksgiving": "Thanksgiving",
          "special_intention": "Special Intention",
          "healing": "Healing / Recovery",
          "birthday_anniversary": "Birthday / Anniversary",
          "living_and_dead": "Living & Dead",
          "parish": "Pro Populo (Parish)",
          "other": "Other"
        }
      },
      {
        "key": "intention_for",
        "label": "Intention (name / purpose)",
        "type": "text",
        "required": true
      },
      {
        "key": "requested_by",
        "label": "Requested By",
        "type": "text"
      },
      {
        "key": "contact",
        "label": "Contact",
        "type": "text"
      },
      {
        "key": "stipend_amount",
        "label": "Stipend (GHS)",
        "type": "money"
      },
      {
        "key": "stipend_received_on",
        "label": "Stipend Received On",
        "type": "date"
      },
      {
        "key": "status",
        "label": "Status",
        "type": "select",
        "required": true,
        "options": {
          "booked": "Booked",
          "celebrated": "Celebrated",
          "transferred": "Transferred",
          "cancelled": "Cancelled"
        }
      },
      {
        "key": "celebrant",
        "label": "Celebrant",
        "type": "text"
      },
      {
        "key": "celebrated_on",
        "label": "Date Actually Celebrated",
        "type": "date"
      },
      {
        "key": "notes",
        "label": "Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "mass_date",
      "mass_time",
      "intention_for",
      "intention_type",
      "stipend_amount",
      "status"
    ],
    "searchField": "intention_for",
    "filters": [
      "status",
      "intention_type"
    ],
    "dateFilter": "mass_date",
    "orderBy": [
      [
        "mass_date",
        "desc"
      ],
      [
        "mass_time",
        "asc"
      ],
      [
        "id",
        "desc"
      ]
    ],
    "permission": "registers",
    "export": true,
    "certificate": false,
    "import": false,
    "defaults": {
      "status": "booked",
      "intention_type": "repose_of_soul"
    },
    "hooks": {
      "index_header": "mass_intention_summary",
      "row_actions": "mass_intention_row_actions",
      "before_save": "mass_intention_before_save",
      "after_save": "mass_intention_after_save"
    }
  },
  {
    "key": "outstations",
    "title": "Outstations",
    "label": "Outstation",
    "table": "outstations",
    "fields": [
      {
        "key": "name",
        "label": "Outstation Name",
        "type": "text",
        "required": true
      },
      {
        "key": "patron_saint",
        "label": "Patron Saint",
        "type": "text"
      },
      {
        "key": "location",
        "label": "Location / Directions",
        "type": "text"
      },
      {
        "key": "leader_name",
        "label": "Leader / Chairperson",
        "type": "text"
      },
      {
        "key": "leader_contact",
        "label": "Leader Contact",
        "type": "text"
      },
      {
        "key": "catechist_name",
        "label": "Catechist in Charge",
        "type": "text"
      },
      {
        "key": "notes",
        "label": "Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "name",
      "patron_saint",
      "leader_name",
      "leader_contact",
      "catechist_name"
    ],
    "searchField": "name",
    "orderBy": [
      [
        "name",
        "asc"
      ]
    ],
    "permission": "registers",
    "export": true,
    "certificate": false,
    "import": false
  },
  {
    "key": "mass_times",
    "title": "Mass Times",
    "label": "Mass Time",
    "table": "mass_times",
    "fields": [
      {
        "key": "day_of_week",
        "label": "Day",
        "type": "select",
        "required": true,
        "options": {
          "0": "Sunday",
          "1": "Monday",
          "2": "Tuesday",
          "3": "Wednesday",
          "4": "Thursday",
          "5": "Friday",
          "6": "Saturday"
        }
      },
      {
        "key": "mass_time",
        "label": "Time",
        "type": "time",
        "required": true
      },
      {
        "key": "outstation_id",
        "label": "Outstation (blank = main church)",
        "type": "lookup",
        "lookup": "outstation"
      },
      {
        "key": "language",
        "label": "Language",
        "type": "text"
      },
      {
        "key": "notes",
        "label": "Notes (e.g. \"1st Sunday only\")",
        "type": "text"
      },
      {
        "key": "is_active",
        "label": "Currently Active",
        "type": "checkbox"
      }
    ],
    "listColumns": [
      "day_of_week",
      "mass_time",
      "outstation_id",
      "language",
      "is_active"
    ],
    "searchField": "language",
    "filters": [
      "day_of_week"
    ],
    "orderBy": [
      [
        "day_of_week",
        "asc"
      ],
      [
        "mass_time",
        "asc"
      ]
    ],
    "permission": "registers",
    "certificate": false,
    "import": false,
    "defaults": {
      "is_active": 1
    }
  },
  {
    "key": "liturgical_days",
    "title": "Parish Feast Days & Holy Days",
    "label": "Feast Day",
    "table": "liturgical_days",
    "fields": [
      {
        "key": "month_no",
        "label": "Month",
        "type": "select",
        "required": true,
        "options": {
          "1": "January",
          "2": "February",
          "3": "March",
          "4": "April",
          "5": "May",
          "6": "June",
          "7": "July",
          "8": "August",
          "9": "September",
          "10": "October",
          "11": "November",
          "12": "December"
        }
      },
      {
        "key": "day_no",
        "label": "Day of Month",
        "type": "number",
        "required": true
      },
      {
        "key": "name",
        "label": "Name of Feast / Observance",
        "type": "text",
        "required": true
      },
      {
        "key": "day_rank",
        "label": "Rank",
        "type": "select",
        "required": true,
        "options": {
          "solemnity": "Solemnity",
          "feast": "Feast",
          "memorial": "Memorial",
          "optional_memorial": "Optional Memorial",
          "local": "Local / Parish"
        }
      },
      {
        "key": "colour",
        "label": "Liturgical Colour",
        "type": "select",
        "required": true,
        "options": {
          "white": "White",
          "red": "Red",
          "green": "Green",
          "purple": "Purple",
          "rose": "Rose",
          "black": "Black"
        }
      },
      {
        "key": "holy_day_of_obligation",
        "label": "Holy Day of Obligation",
        "type": "checkbox"
      },
      {
        "key": "notes",
        "label": "Notes",
        "type": "text"
      }
    ],
    "listColumns": [
      "month_no",
      "day_no",
      "name",
      "day_rank",
      "colour"
    ],
    "searchField": "name",
    "filters": [
      "month_no",
      "day_rank"
    ],
    "orderBy": [
      [
        "month_no",
        "asc"
      ],
      [
        "day_no",
        "asc"
      ]
    ],
    "permission": "registers",
    "certificate": false,
    "import": false,
    "intro": "Fixed-date feasts. Moveable feasts (Easter, Pentecost…) are calculated automatically. Check holy days of obligation against your Bishops’ Conference list."
  },
  {
    "key": "church_property",
    "title": "Church Property Inventory",
    "label": "Property",
    "table": "church_property",
    "fields": [
      {
        "key": "item_name",
        "label": "Item / Property",
        "type": "text",
        "required": true
      },
      {
        "key": "category",
        "label": "Category",
        "type": "select",
        "required": true,
        "options": {
          "vestment": "Vestment / Linen",
          "sacred_vessel": "Sacred Vessel",
          "furniture": "Furniture",
          "building": "Building",
          "land": "Land",
          "vehicle": "Vehicle",
          "equipment": "Equipment (sound, electrical…)",
          "book_record": "Books & Records",
          "other": "Other"
        }
      },
      {
        "key": "quantity",
        "label": "Quantity",
        "type": "number"
      },
      {
        "key": "location",
        "label": "Location",
        "type": "text"
      },
      {
        "key": "outstation_id",
        "label": "Outstation",
        "type": "lookup",
        "lookup": "outstation"
      },
      {
        "key": "item_condition",
        "label": "Condition",
        "type": "select",
        "required": true,
        "options": {
          "good": "Good",
          "fair": "Fair",
          "poor": "Poor",
          "unusable": "Unusable",
          "lost": "Lost / Missing"
        }
      },
      {
        "key": "description",
        "label": "Description",
        "type": "textarea"
      },
      {
        "key": "acquired_on",
        "label": "Acquired On",
        "type": "date"
      },
      {
        "key": "acquired_value",
        "label": "Value when Acquired (GHS)",
        "type": "money"
      },
      {
        "key": "reference_no",
        "label": "Serial / Plate / Title Deed No.",
        "type": "text"
      },
      {
        "key": "custodian",
        "label": "Custodian",
        "type": "text"
      },
      {
        "key": "last_checked_on",
        "label": "Last Physical Check",
        "type": "date"
      },
      {
        "key": "notes",
        "label": "Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "item_name",
      "category",
      "quantity",
      "location",
      "item_condition"
    ],
    "searchField": "item_name",
    "filters": [
      "category",
      "item_condition"
    ],
    "orderBy": [
      [
        "category",
        "asc"
      ],
      [
        "item_name",
        "asc"
      ]
    ],
    "permission": "registers",
    "export": true,
    "certificate": false,
    "import": false,
    "defaults": {
      "quantity": 1,
      "item_condition": "good"
    }
  },
  {
    "key": "burial_records",
    "title": "Cemetery & Burial Register",
    "label": "Burial",
    "table": "burial_records",
    "fields": [
      {
        "key": "death_id",
        "label": "Linked Death Record",
        "type": "lookup",
        "lookup": "death"
      },
      {
        "key": "full_name",
        "label": "Name of the Deceased (filled from the death record if left blank)",
        "type": "text"
      },
      {
        "key": "date_of_burial",
        "label": "Date of Burial",
        "type": "date"
      },
      {
        "key": "funeral_mass_on",
        "label": "Funeral Mass Date",
        "type": "date"
      },
      {
        "key": "cemetery",
        "label": "Cemetery",
        "type": "text"
      },
      {
        "key": "section_plot",
        "label": "Section / Plot",
        "type": "text"
      },
      {
        "key": "grave_no",
        "label": "Grave No.",
        "type": "text"
      },
      {
        "key": "officiating_priest",
        "label": "Officiating Priest",
        "type": "text"
      },
      {
        "key": "notes",
        "label": "Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "full_name",
      "date_of_burial",
      "cemetery",
      "section_plot",
      "grave_no",
      "officiating_priest"
    ],
    "searchField": "full_name",
    "dateFilter": "date_of_burial",
    "orderBy": [
      [
        "date_of_burial",
        "desc"
      ],
      [
        "id",
        "desc"
      ]
    ],
    "permission": "registers",
    "export": true,
    "certificate": false,
    "import": false,
    "hooks": {
      "before_save": "burial_before_save"
    }
  },
  {
    "key": "parishioners",
    "title": "Parish Census (Status Animarum)",
    "label": "Parishioner",
    "table": "parishioners",
    "fields": [
      {
        "key": "section",
        "label": "Person",
        "type": "section"
      },
      {
        "key": "full_name",
        "label": "Full Name",
        "type": "text",
        "required": true
      },
      {
        "key": "sex",
        "label": "Sex",
        "type": "select",
        "options": {
          "male": "Male",
          "female": "Female"
        }
      },
      {
        "key": "date_of_birth",
        "label": "Date of Birth",
        "type": "partial_date"
      },
      {
        "key": "dob_estimated",
        "label": "Birth date estimated",
        "type": "checkbox"
      },
      {
        "key": "residence",
        "label": "Place of Residence",
        "type": "text",
        "required": true
      },
      {
        "key": "phone",
        "label": "Phone",
        "type": "text"
      },
      {
        "key": "occupation",
        "label": "Occupation",
        "type": "text"
      },
      {
        "key": "household_id",
        "label": "Household",
        "type": "lookup",
        "lookup": "household"
      },
      {
        "key": "outstation_id",
        "label": "Outstation",
        "type": "lookup",
        "lookup": "outstation"
      },
      {
        "key": "residency_status",
        "label": "Residency",
        "type": "select",
        "required": true,
        "options": {
          "resident": "Resident",
          "moved_away": "Moved away",
          "deceased": "Deceased"
        }
      },
      {
        "key": "section_parents",
        "label": "Parents",
        "type": "section"
      },
      {
        "key": "father_name",
        "label": "Father's Name",
        "type": "text"
      },
      {
        "key": "mother_name",
        "label": "Mother's Name",
        "type": "text"
      },
      {
        "key": "section2",
        "label": "Marital Status",
        "type": "section"
      },
      {
        "key": "marital_status",
        "label": "Marital Status",
        "type": "select",
        "options": {
          "single": "Single",
          "married_church": "Married in the Church",
          "married_customary": "Customary marriage only (not in Church)",
          "civil_only": "Civil marriage only",
          "widowed": "Widowed",
          "separated": "Separated",
          "divorced_remarried": "Divorced & remarried (irregular)"
        }
      },
      {
        "key": "spouse_name",
        "label": "Spouse Name",
        "type": "text"
      },
      {
        "key": "section3",
        "label": "Faith Life & Sacraments",
        "type": "section"
      },
      {
        "key": "practising_status",
        "label": "Practising Status",
        "type": "select",
        "required": true,
        "options": {
          "practising": "Practising",
          "occasional": "Occasional",
          "lapsed": "Lapsed",
          "unknown": "Unknown"
        }
      },
      {
        "key": "baptised_status",
        "label": "Baptism",
        "type": "select",
        "required": true,
        "options": {
          "baptised_here": "Baptised in this parish",
          "baptised_elsewhere": "Baptised elsewhere",
          "not_baptised": "Not baptised",
          "unknown": "Unknown"
        }
      },
      {
        "key": "baptism_date",
        "label": "Baptism Date",
        "type": "date"
      },
      {
        "key": "baptism_place",
        "label": "Baptism Place",
        "type": "text"
      },
      {
        "key": "baptism_id",
        "label": "Baptism Register Entry",
        "type": "lookup",
        "lookup": "baptism"
      },
      {
        "key": "communion_status",
        "label": "First Communion",
        "type": "select",
        "required": true,
        "options": {
          "received_here": "Received here",
          "received_elsewhere": "Received elsewhere",
          "not_received": "Not yet received",
          "unknown": "Unknown"
        }
      },
      {
        "key": "communion_date",
        "label": "First Communion Date",
        "type": "date"
      },
      {
        "key": "communion_place",
        "label": "First Communion Place",
        "type": "text"
      },
      {
        "key": "communion_id",
        "label": "Communion Register Entry",
        "type": "lookup",
        "lookup": "communion"
      },
      {
        "key": "confirmation_status",
        "label": "Confirmation",
        "type": "select",
        "required": true,
        "options": {
          "received_here": "Received here",
          "received_elsewhere": "Received elsewhere",
          "not_received": "Not yet received",
          "unknown": "Unknown"
        }
      },
      {
        "key": "confirmation_date",
        "label": "Confirmation Date",
        "type": "date"
      },
      {
        "key": "confirmation_place",
        "label": "Confirmation Place",
        "type": "text"
      },
      {
        "key": "confirmation_name",
        "label": "Confirmation Name",
        "type": "text"
      },
      {
        "key": "confirmation_id",
        "label": "Confirmation Register Entry",
        "type": "lookup",
        "lookup": "confirmation"
      },
      {
        "key": "matrimony_status",
        "label": "Holy Matrimony",
        "type": "select",
        "required": true,
        "options": {
          "received_here": "Received here",
          "received_elsewhere": "Received elsewhere",
          "not_received": "Not yet received",
          "unknown": "Unknown"
        }
      },
      {
        "key": "marriage_date",
        "label": "Marriage Date",
        "type": "date"
      },
      {
        "key": "marriage_place",
        "label": "Marriage Place",
        "type": "text"
      },
      {
        "key": "orders_status",
        "label": "Holy Orders",
        "type": "select",
        "required": true,
        "options": {
          "received_here": "Received here",
          "received_elsewhere": "Received elsewhere",
          "not_received": "Not yet received",
          "unknown": "Unknown"
        }
      },
      {
        "key": "orders_type",
        "label": "Type of Holy Orders",
        "type": "text"
      },
      {
        "key": "orders_date",
        "label": "Ordination Date",
        "type": "date"
      },
      {
        "key": "orders_place",
        "label": "Ordination Place",
        "type": "text"
      },
      {
        "key": "orders_id",
        "label": "Holy Orders Register Entry",
        "type": "lookup",
        "lookup": "holy_orders"
      },
      {
        "key": "death_id",
        "label": "Death Record (if deceased)",
        "type": "lookup",
        "lookup": "death"
      },
      {
        "key": "notes",
        "label": "Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "full_name",
      "sex",
      "outstation_id",
      "marital_status",
      "practising_status",
      "residency_status"
    ],
    "searchField": "full_name",
    "filters": [
      "marital_status",
      "practising_status",
      "residency_status",
      "baptised_status"
    ],
    "orderBy": [
      [
        "full_name",
        "asc"
      ]
    ],
    "permission": "registers",
    "sensitive": true,
    "export": true,
    "certificate": false,
    "import": false,
    "defaults": {
      "residency_status": "resident",
      "practising_status": "unknown",
      "baptised_status": "unknown",
      "communion_status": "unknown",
      "confirmation_status": "unknown"
    }
  },
  {
    "key": "societies",
    "title": "Societies, SCCs & Groups",
    "label": "Group",
    "table": "societies",
    "fields": [
      {
        "key": "name",
        "label": "Name",
        "type": "text",
        "required": true
      },
      {
        "key": "group_type",
        "label": "Type",
        "type": "select",
        "required": true,
        "options": {
          "society": "Society / Pious Association",
          "scc": "Small Christian Community",
          "choir": "Choir",
          "youth": "Youth / Catholic Youth",
          "women": "Women's Group",
          "men": "Men's Group",
          "servers": "Altar Servers",
          "council": "Council / Committee",
          "other": "Other"
        }
      },
      {
        "key": "outstation_id",
        "label": "Outstation (blank = whole parish)",
        "type": "lookup",
        "lookup": "outstation"
      },
      {
        "key": "patron",
        "label": "Patron Saint",
        "type": "text"
      },
      {
        "key": "chaplain",
        "label": "Chaplain / Spiritual Director",
        "type": "text"
      },
      {
        "key": "leader_name",
        "label": "Chairperson / Leader",
        "type": "text"
      },
      {
        "key": "leader_contact",
        "label": "Leader Contact",
        "type": "text"
      },
      {
        "key": "meeting_day",
        "label": "Meeting Day",
        "type": "text"
      },
      {
        "key": "meeting_time",
        "label": "Meeting Time",
        "type": "text"
      },
      {
        "key": "meeting_venue",
        "label": "Meeting Venue",
        "type": "text"
      },
      {
        "key": "started_on",
        "label": "Founded / Started On",
        "type": "date"
      },
      {
        "key": "dues_amount",
        "label": "Dues per Member (GHS)",
        "type": "money"
      },
      {
        "key": "dues_period",
        "label": "Dues Period",
        "type": "select",
        "required": true,
        "options": {
          "monthly": "Monthly",
          "quarterly": "Quarterly",
          "annual": "Annual"
        }
      },
      {
        "key": "notes",
        "label": "Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "name",
      "group_type",
      "outstation_id",
      "leader_name",
      "meeting_day"
    ],
    "searchField": "name",
    "filters": [
      "group_type"
    ],
    "orderBy": [
      [
        "name",
        "asc"
      ]
    ],
    "permission": "registers",
    "export": true,
    "certificate": false,
    "import": false,
    "defaults": {
      "dues_period": "monthly",
      "group_type": "society"
    },
    "hooks": {
      "row_actions": "society_row_actions"
    }
  },
  {
    "key": "marriage_prep",
    "title": "Marriage Preparation Files",
    "label": "Marriage Preparation",
    "table": "marriage_preparations",
    "fields": [
      {
        "key": "section",
        "label": "Case",
        "type": "section"
      },
      {
        "key": "status",
        "label": "Status (updates automatically)",
        "type": "display",
        "options": {
          "inquiry": "Pre-marriage Inquiry",
          "documents": "Documents",
          "banns": "Banns",
          "approved": "Approved",
          "married": "Married",
          "cancelled": "Cancelled"
        }
      },
      {
        "key": "inquiry_date",
        "label": "Date of First Interview",
        "type": "date"
      },
      {
        "key": "proposed_date",
        "label": "Proposed Wedding Date",
        "type": "date"
      },
      {
        "key": "place_of_marriage",
        "label": "Place of Marriage",
        "type": "text"
      },
      {
        "key": "officiating_minister",
        "label": "Officiating Minister",
        "type": "text"
      },
      {
        "key": "section2",
        "label": "Groom",
        "type": "section"
      },
      {
        "key": "groom_name",
        "label": "Full Name",
        "type": "text",
        "required": true
      },
      {
        "key": "groom_religion",
        "label": "Religion",
        "type": "select",
        "required": true,
        "options": {
          "catholic": "Catholic",
          "other_christian": "Other Christian (baptised)",
          "non_christian": "Non-Christian",
          "none": "No religion"
        }
      },
      {
        "key": "groom_domicile",
        "label": "Domicile / Home Parish",
        "type": "text"
      },
      {
        "key": "groom_baptism_id",
        "label": "Baptism Entry (this parish)",
        "type": "lookup",
        "lookup": "baptism"
      },
      {
        "key": "groom_baptism_place",
        "label": "Place of Baptism (if elsewhere)",
        "type": "text"
      },
      {
        "key": "section3",
        "label": "Bride",
        "type": "section"
      },
      {
        "key": "bride_name",
        "label": "Full Name",
        "type": "text",
        "required": true
      },
      {
        "key": "bride_religion",
        "label": "Religion",
        "type": "select",
        "required": true,
        "options": {
          "catholic": "Catholic",
          "other_christian": "Other Christian (baptised)",
          "non_christian": "Non-Christian",
          "none": "No religion"
        }
      },
      {
        "key": "bride_domicile",
        "label": "Domicile / Home Parish",
        "type": "text"
      },
      {
        "key": "bride_baptism_id",
        "label": "Baptism Entry (this parish)",
        "type": "lookup",
        "lookup": "baptism"
      },
      {
        "key": "bride_baptism_place",
        "label": "Place of Baptism (if elsewhere)",
        "type": "text"
      },
      {
        "key": "section4",
        "label": "Required Documents & Preparation",
        "type": "section"
      },
      {
        "key": "prenuptial_inquiry_done",
        "label": "Pre-nuptial inquiry completed",
        "type": "checkbox"
      },
      {
        "key": "marriage_course_done",
        "label": "Marriage preparation course completed",
        "type": "checkbox"
      },
      {
        "key": "groom_baptism_cert",
        "label": "Groom: recent baptismal certificate",
        "type": "checkbox"
      },
      {
        "key": "groom_confirmation_cert",
        "label": "Groom: confirmation certificate",
        "type": "checkbox"
      },
      {
        "key": "groom_freedom_proof",
        "label": "Groom: proof of freedom to marry",
        "type": "checkbox"
      },
      {
        "key": "bride_baptism_cert",
        "label": "Bride: recent baptismal certificate",
        "type": "checkbox"
      },
      {
        "key": "bride_confirmation_cert",
        "label": "Bride: confirmation certificate",
        "type": "checkbox"
      },
      {
        "key": "bride_freedom_proof",
        "label": "Bride: proof of freedom to marry",
        "type": "checkbox"
      },
      {
        "key": "witnesses",
        "label": "Witnesses",
        "type": "text"
      },
      {
        "key": "section5",
        "label": "Previous Marriages & Dispensations (confidential)",
        "type": "section"
      },
      {
        "key": "previous_marriage",
        "label": "Previous Marriage",
        "type": "select",
        "options": {
          "none": "None",
          "widowed": "Widowed",
          "annulled": "Previous marriage annulled",
          "other": "Other (explain)"
        },
        "permission": "sensitive.dispensation"
      },
      {
        "key": "previous_marriage_note",
        "label": "Details (e.g. annulment reference)",
        "type": "text",
        "permission": "sensitive.dispensation"
      },
      {
        "key": "dispensation_type",
        "label": "Dispensation / Permission Needed",
        "type": "select",
        "options": {
          "none": "None needed",
          "mixed_religion": "Mixed religion (permission)",
          "disparity_of_cult": "Disparity of cult (dispensation)",
          "canonical_form": "Canonical form",
          "impediment_other": "Other impediment"
        },
        "permission": "sensitive.dispensation"
      },
      {
        "key": "dispensation_status",
        "label": "Dispensation Status",
        "type": "select",
        "options": {
          "not_needed": "Not needed",
          "requested": "Requested",
          "granted": "Granted",
          "refused": "Refused"
        },
        "permission": "sensitive.dispensation"
      },
      {
        "key": "dispensation_ref",
        "label": "Reference / Diocesan Letter No.",
        "type": "text",
        "permission": "sensitive.dispensation"
      },
      {
        "key": "dispensation_date",
        "label": "Date Granted",
        "type": "date",
        "permission": "sensitive.dispensation"
      },
      {
        "key": "section6",
        "label": "Publication of Banns (3 successive Sundays)",
        "type": "section"
      },
      {
        "key": "banns_1_date",
        "label": "First Publication",
        "type": "date"
      },
      {
        "key": "banns_2_date",
        "label": "Second Publication",
        "type": "date"
      },
      {
        "key": "banns_3_date",
        "label": "Third Publication",
        "type": "date"
      },
      {
        "key": "banns_dispensed",
        "label": "Banns dispensed by the Ordinary",
        "type": "checkbox"
      },
      {
        "key": "notes",
        "label": "Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "groom_name",
      "bride_name",
      "proposed_date",
      "status",
      "banns_1_date"
    ],
    "searchField": "groom_name",
    "filters": [
      "status"
    ],
    "orderBy": [
      [
        "proposed_date",
        "asc"
      ],
      [
        "id",
        "desc"
      ]
    ],
    "permission": "registers",
    "sensitive": true,
    "export": true,
    "certificate": false,
    "import": false,
    "intro": "Track each couple from first interview to wedding. Banns dates feed the Sunday announcements automatically.",
    "defaults": {
      "groom_religion": "catholic",
      "bride_religion": "catholic",
      "previous_marriage": "none",
      "dispensation_type": "none",
      "dispensation_status": "not_needed"
    },
    "hooks": {
      "row_actions": "marriage_prep_row_actions",
      "before_save": "marriage_prep_before_save",
      "after_save": "marriage_prep_after_save",
      "after_form": "marriage_prep_after_form"
    }
  },
  {
    "key": "candidates",
    "title": "Sacrament Preparation & RCIA",
    "label": "Candidate",
    "table": "sacrament_candidates",
    "fields": [
      {
        "key": "program",
        "label": "Programme",
        "type": "select",
        "required": true,
        "options": {
          "baptism_child": "Baptism – Child",
          "baptism_adult": "Baptism – Adult",
          "first_communion": "First Communion",
          "confirmation": "Confirmation",
          "rcia": "RCIA / Catechumenate"
        }
      },
      {
        "key": "full_name",
        "label": "Full Name",
        "type": "text",
        "required": true
      },
      {
        "key": "date_of_birth",
        "label": "Date of Birth",
        "type": "date"
      },
      {
        "key": "father_name",
        "label": "Father",
        "type": "text"
      },
      {
        "key": "mother_name",
        "label": "Mother",
        "type": "text"
      },
      {
        "key": "contact",
        "label": "Contact (parent / candidate)",
        "type": "text"
      },
      {
        "key": "outstation_id",
        "label": "Outstation",
        "type": "lookup",
        "lookup": "outstation"
      },
      {
        "key": "class_group",
        "label": "Class / Group",
        "type": "text"
      },
      {
        "key": "enrolled_on",
        "label": "Enrolled On",
        "type": "date"
      },
      {
        "key": "stage",
        "label": "Stage",
        "type": "select",
        "required": true,
        "options": {
          "enquiry": "Enquiry",
          "catechumen": "Catechumen",
          "election": "Election / Enrolment",
          "sacraments": "Sacraments (Easter Vigil)",
          "completed": "Completed"
        }
      },
      {
        "key": "baptism_id",
        "label": "Baptism Entry (Communion / Confirmation candidates)",
        "type": "lookup",
        "lookup": "baptism"
      },
      {
        "key": "baptism_place",
        "label": "Place of Baptism (if elsewhere)",
        "type": "text"
      },
      {
        "key": "interview_date",
        "label": "Interview Date",
        "type": "date"
      },
      {
        "key": "interview_result",
        "label": "Interview Result",
        "type": "select",
        "required": true,
        "options": {
          "pending": "Pending",
          "passed": "Passed",
          "deferred": "Deferred"
        }
      },
      {
        "key": "interview_notes",
        "label": "Interview Notes",
        "type": "textarea"
      },
      {
        "key": "presented_on",
        "label": "Presented to the Community On",
        "type": "date"
      },
      {
        "key": "planned_date",
        "label": "Planned Date of Sacrament",
        "type": "date"
      },
      {
        "key": "confirmation_name",
        "label": "Confirmation Name (Confirmation candidates)",
        "type": "text"
      },
      {
        "key": "candidate_status",
        "label": "Status",
        "type": "display",
        "options": {
          "active": "Active",
          "promoted": "Promoted to register",
          "withdrawn": "Withdrawn"
        }
      },
      {
        "key": "notes",
        "label": "Notes",
        "type": "textarea"
      }
    ],
    "listColumns": [
      "full_name",
      "program",
      "stage",
      "interview_result",
      "planned_date",
      "candidate_status"
    ],
    "searchField": "full_name",
    "filters": [
      "program",
      "stage",
      "candidate_status"
    ],
    "orderBy": [
      [
        "id",
        "desc"
      ]
    ],
    "permission": "registers",
    "export": true,
    "certificate": false,
    "import": false,
    "duplicateCheck": false,
    "defaults": {
      "stage": "enquiry",
      "interview_result": "pending",
      "enrolled_on": "__today__"
    },
    "hooks": {
      "index_header": "candidate_summary",
      "row_actions": "candidate_row_actions",
      "after_form": "candidate_after_form"
    }
  }
];
