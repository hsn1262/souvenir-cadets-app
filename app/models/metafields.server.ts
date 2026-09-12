// Bootstraps the metafield definitions the Central Inventory screens
// depend on. Run once per shop (the Settings page exposes a "Sync fields"
// button that calls ensureMetafieldDefinitions — it's idempotent, so it's
// safe to click again after adding a new spec field later).
//
// Definitions (not just loose metafields) matter here because they're what
// make these fields show up as real, structured inputs in Shopify Admin's
// own product page too, not only inside our app.

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { APP_NAMESPACE, SPEC_FIELDS } from "../lib/constants";

type DefinitionSpec = {
  name: string;
  key: string;
  namespace: string;
  description: string;
  type: string;
  ownerType: "PRODUCT" | "LOCATION" | "INVENTORYITEM";
};

function buildProductSpecDefinitions(): DefinitionSpec[] {
  const defs: DefinitionSpec[] = [];
  for (const field of SPEC_FIELDS) {
    defs.push({
      name: `${field.label}`,
      key: `${field.key}_value`,
      namespace: APP_NAMESPACE,
      description: `Spec field carried over from the catalogue sheet: ${field.label}.`,
      type: "single_line_text_field",
      ownerType: "PRODUCT",
    });
    defs.push({
      name: `${field.label} enabled`,
      key: `${field.key}_enabled`,
      namespace: APP_NAMESPACE,
      description: `Whether "${field.label}" is shown on this product's spec sheet / ticket.`,
      type: "boolean",
      ownerType: "PRODUCT",
    });
  }
  return defs;
}

function buildLocationEventDefinitions(): DefinitionSpec[] {
  return [
    { name: "Event date from", key: "event_date_from", namespace: APP_NAMESPACE, description: "Start date of the event this Location represents.", type: "date", ownerType: "LOCATION" },
    { name: "Event date to", key: "event_date_to", namespace: APP_NAMESPACE, description: "End date of the event this Location represents.", type: "date", ownerType: "LOCATION" },
    { name: "Event status", key: "event_status", namespace: APP_NAMESPACE, description: "OPEN or CLOSED — mirrors Events.Status from the old sheet.", type: "single_line_text_field", ownerType: "LOCATION" },
    { name: "Event created at", key: "event_created_at", namespace: APP_NAMESPACE, description: "When the event was created.", type: "date_time", ownerType: "LOCATION" },
    { name: "Event closed at", key: "event_closed_at", namespace: APP_NAMESPACE, description: "When the event was closed (leftovers returned to Central).", type: "date_time", ownerType: "LOCATION" },
  ];
}

export function allDefinitions(): DefinitionSpec[] {
  return [...buildProductSpecDefinitions(), ...buildLocationEventDefinitions()];
}

export async function ensureMetafieldDefinitions(admin: AdminApiContext) {
  const results: { key: string; ok: boolean; error?: string }[] = [];

  for (const def of allDefinitions()) {
    const response = await admin.graphql(
      `#graphql
        mutation CreateDef($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition { id name }
            userErrors { field message code }
          }
        }`,
      {
        variables: {
          definition: {
            name: def.name,
            namespace: def.namespace,
            key: def.key,
            description: def.description,
            type: def.type,
            ownerType: def.ownerType,
          },
        },
      },
    );
    const json = await response.json();
    const errors = json.data?.metafieldDefinitionCreate?.userErrors ?? [];
    // TAKEN just means it already exists from a previous sync — not a real failure.
    const alreadyExists = errors.some((e: any) => e.code === "TAKEN");
    results.push({
      key: `${def.namespace}.${def.key}`,
      ok: errors.length === 0 || alreadyExists,
      error: !alreadyExists && errors.length ? errors.map((e: any) => e.message).join("; ") : undefined,
    });
  }

  return results;
}
