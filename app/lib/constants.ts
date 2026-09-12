// Shared constants for the Souvenir for Cadets rebuild.
// Mirrors the fixed structures in the original Code.gs so the mapping from
// old sheet columns to new Shopify fields stays traceable.

// --- Metafields -------------------------------------------------------

export const APP_NAMESPACE = "cadets";

// The 8 fixed spec fields from SPEC_HEADINGS_ in Code.gs. Each becomes a
// metafield definition on Product: `<key>_value` holds the text, and
// `<key>_enabled` (boolean) preserves the per-product enable/disable
// checkbox from the old catalogue form.
export const SPEC_FIELDS = [
  { key: "measurement", label: "Measurement" },
  { key: "weight", label: "Weight" },
  { key: "materials", label: "Materials" },
  { key: "binding", label: "Binding" },
  { key: "mechanism", label: "Mechanism" },
  { key: "customized_by", label: "Customized By" },
  { key: "finishing", label: "Finishing" },
  { key: "packaging", label: "Packaging" },
] as const;

export type SpecFieldKey = (typeof SPEC_FIELDS)[number]["key"];

// Metafields on Location, standing in for the Events sheet's DateFrom /
// DateTo / Status / CreatedDate / ClosedDate columns — Shopify's Location
// object has no native concept of an event window.
export const EVENT_METAFIELDS = {
  dateFrom: "event_date_from",
  dateTo: "event_date_to",
  status: "event_status", // "OPEN" | "CLOSED"
  createdAt: "event_created_at",
  closedAt: "event_closed_at",
} as const;

// Metaobject type for Event Expenses (no native Shopify object for this).
export const EXPENSE_METAOBJECT_TYPE = "cadets_event_expense";

// --- Locations ----------------------------------------------------------

// The well-known handle/name for the always-on central stock pool that
// every event allocates FROM and returns leftovers TO. Created once during
// setup (see app/routes/app.settings.locations.tsx in a later phase).
export const CENTRAL_LOCATION_NAME = "Central Inventory";

// --- Roles ----------------------------------------------------------------

export const ROLE_MANAGER = "MANAGER";
export const ROLE_STAFF = "STAFF";
