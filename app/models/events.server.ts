// Events (Phase 3): each event is a Shopify Location, with its window and
// lifecycle state stored as metafields (see EVENT_METAFIELDS) since Location
// has no native concept of an event. Stock is never duplicated — it's moved
// between Central and the event's Location with inventoryMoveQuantities,
// the same primitive Shopify uses for stock transfers, so it always nets to
// zero and shows up in Shopify's own inventory history.

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { APP_NAMESPACE, CENTRAL_LOCATION_NAME, EVENT_METAFIELDS } from "../lib/constants";
import { ensureCentralLocation, shopDefaultCountry } from "./locations.server";

export type EventLocation = {
  id: string;
  name: string;
  isActive: boolean;
  dateFrom: string | null;
  dateTo: string | null;
  status: "OPEN" | "CLOSED";
  createdAt: string | null;
  closedAt: string | null;
};

export type AllocatableVariant = {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  inventoryItemId: string;
  availableAtCentral: number;
  allocatedHere: number;
};

function metafieldMap(node: any): Map<string, string> {
  return new Map((node.metafields?.edges ?? []).map((e: any) => [e.node.key as string, e.node.value as string]));
}

function toEventLocation(node: any): EventLocation {
  const mf = metafieldMap(node);
  return {
    id: node.id,
    name: node.name,
    isActive: node.isActive,
    dateFrom: mf.get(EVENT_METAFIELDS.dateFrom) ?? null,
    dateTo: mf.get(EVENT_METAFIELDS.dateTo) ?? null,
    status: (mf.get(EVENT_METAFIELDS.status) as "OPEN" | "CLOSED" | undefined) ?? "OPEN",
    createdAt: mf.get(EVENT_METAFIELDS.createdAt) ?? null,
    closedAt: mf.get(EVENT_METAFIELDS.closedAt) ?? null,
  };
}

// Every event Location carries an event_status metafield (set at creation);
// Central and the shop's own default location never do, so that's what
// tells events apart from every other Location on the shop.
export async function listEvents(admin: AdminApiContext): Promise<EventLocation[]> {
  const response = await admin.graphql(
    `#graphql
      query EventLocations($cursor: String) {
        locations(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              name
              isActive
              metafields(namespace: "${APP_NAMESPACE}", first: 10) {
                edges { node { key value } }
              }
            }
          }
        }
      }`,
  );
  const json = await response.json();
  const edges = json.data?.locations?.edges ?? [];
  return edges
    .map((e: any) => e.node)
    .filter((node: any) => node.name !== CENTRAL_LOCATION_NAME && metafieldMap(node).has(EVENT_METAFIELDS.status))
    .map(toEventLocation)
    .sort((a: EventLocation, b: EventLocation) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function getEvent(admin: AdminApiContext, id: string): Promise<EventLocation | null> {
  const response = await admin.graphql(
    `#graphql
      query EventDetail($id: ID!) {
        location(id: $id) {
          id
          name
          isActive
          metafields(namespace: "${APP_NAMESPACE}", first: 10) {
            edges { node { key value } }
          }
        }
      }`,
    { variables: { id } },
  );
  const json = await response.json();
  const node = json.data?.location;
  return node ? toEventLocation(node) : null;
}

export async function createEvent(
  admin: AdminApiContext,
  input: { name: string; dateFrom: string; dateTo: string },
): Promise<EventLocation> {
  const countryCode = await shopDefaultCountry(admin);
  const response = await admin.graphql(
    `#graphql
      mutation CreateEventLocation($input: LocationAddInput!) {
        locationAdd(input: $input) {
          location {
            id
            name
            isActive
            metafields(namespace: "${APP_NAMESPACE}", first: 10) {
              edges { node { key value } }
            }
          }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        input: {
          name: input.name,
          address: { countryCode },
          fulfillsOnlineOrders: false,
          metafields: [
            { namespace: APP_NAMESPACE, key: EVENT_METAFIELDS.dateFrom, type: "date", value: input.dateFrom },
            { namespace: APP_NAMESPACE, key: EVENT_METAFIELDS.dateTo, type: "date", value: input.dateTo },
            { namespace: APP_NAMESPACE, key: EVENT_METAFIELDS.status, type: "single_line_text_field", value: "OPEN" },
            {
              namespace: APP_NAMESPACE,
              key: EVENT_METAFIELDS.createdAt,
              type: "date_time",
              value: new Date().toISOString(),
            },
          ],
        },
      },
    },
  );
  const json = await response.json();
  const errors = json.data?.locationAdd?.userErrors ?? [];
  if (errors.length) {
    throw new Error(`Could not create event: ${errors.map((e: any) => e.message).join("; ")}`);
  }
  return toEventLocation(json.data.locationAdd.location);
}

// Products with how much sits at Central vs. how much is already allocated
// to this event, so the Allocate screen can show both side by side. Skips
// variants with nothing at Central and nothing allocated here — nothing a
// staff member could do with those from this screen.
export async function listAllocatable(
  admin: AdminApiContext,
  eventLocationId: string,
  opts: { cursor?: string; search?: string } = {},
): Promise<{ variants: AllocatableVariant[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }> {
  const central = await ensureCentralLocation(admin);
  const response = await admin.graphql(
    `#graphql
      query AllocatableProducts($cursor: String, $query: String) {
        products(first: 25, after: $cursor, query: $query, sortKey: TITLE) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              variants(first: 50) {
                edges {
                  node {
                    id
                    title
                    sku
                    inventoryItem {
                      id
                      inventoryLevels(first: 10) {
                        edges {
                          node {
                            location { id name }
                            quantities(names: ["available"]) { name quantity }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`,
    { variables: { cursor: opts.cursor ?? null, query: opts.search ? `title:*${opts.search}*` : null } },
  );
  const json = await response.json();
  const products = json.data.products;

  const variants: AllocatableVariant[] = [];
  for (const productEdge of products.edges) {
    const product = productEdge.node;
    for (const variantEdge of product.variants.edges) {
      const variant = variantEdge.node;
      const levels = (variant.inventoryItem.inventoryLevels?.edges ?? []).map((e: any) => e.node);
      const centralLevel = levels.find((l: any) => l.location.id === central.id);
      const eventLevel = levels.find((l: any) => l.location.id === eventLocationId);
      const availableAtCentral =
        centralLevel?.quantities?.find((q: any) => q.name === "available")?.quantity ?? 0;
      const allocatedHere = eventLevel?.quantities?.find((q: any) => q.name === "available")?.quantity ?? 0;
      if (availableAtCentral === 0 && allocatedHere === 0) continue;
      variants.push({
        variantId: variant.id,
        productTitle: product.title,
        variantTitle: variant.title === "Default Title" ? "" : variant.title,
        sku: variant.sku,
        inventoryItemId: variant.inventoryItem.id,
        availableAtCentral,
        allocatedHere,
      });
    }
  }

  return { variants, pageInfo: products.pageInfo };
}

async function moveInventory(
  admin: AdminApiContext,
  opts: {
    inventoryItemId: string;
    quantity: number;
    fromLocationId: string;
    toLocationId: string;
    referenceTag: string;
  },
) {
  const response = await admin.graphql(
    `#graphql
      mutation MoveInventory($input: InventoryMoveQuantitiesInput!) {
        inventoryMoveQuantities(input: $input) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        input: {
          reason: "correction",
          referenceDocumentUri: `gid://cadets-app/${opts.referenceTag}/${Date.now()}`,
          changes: [
            {
              inventoryItemId: opts.inventoryItemId,
              quantity: opts.quantity,
              from: { locationId: opts.fromLocationId, name: "available" },
              to: { locationId: opts.toLocationId, name: "available" },
            },
          ],
        },
      },
    },
  );
  const json = await response.json();
  const errors = json.data?.inventoryMoveQuantities?.userErrors ?? [];
  if (errors.length) {
    throw new Error(`Could not move stock: ${errors.map((e: any) => e.message).join("; ")}`);
  }
}

export async function allocateToEvent(
  admin: AdminApiContext,
  eventLocationId: string,
  inventoryItemId: string,
  quantity: number,
) {
  const central = await ensureCentralLocation(admin);
  await moveInventory(admin, {
    inventoryItemId,
    quantity,
    fromLocationId: central.id,
    toLocationId: eventLocationId,
    referenceTag: "EventAllocate",
  });
}

// Returns every remaining allocated unit to Central, flips the event's
// status/closedAt metafields, and deactivates the Location so it drops out
// of "new event" pickers and stock-transfer destination lists everywhere in
// Shopify Admin. destinationLocationId is a safety net in case Shopify finds
// stock at this Location we didn't already account for.
export async function closeEvent(admin: AdminApiContext, eventLocationId: string) {
  const central = await ensureCentralLocation(admin);
  const { variants } = await listAllocatable(admin, eventLocationId);
  for (const variant of variants) {
    if (variant.allocatedHere > 0) {
      await moveInventory(admin, {
        inventoryItemId: variant.inventoryItemId,
        quantity: variant.allocatedHere,
        fromLocationId: eventLocationId,
        toLocationId: central.id,
        referenceTag: "EventClose",
      });
    }
  }

  const metafieldsResponse = await admin.graphql(
    `#graphql
      mutation SetEventMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        metafields: [
          {
            ownerId: eventLocationId,
            namespace: APP_NAMESPACE,
            key: EVENT_METAFIELDS.status,
            type: "single_line_text_field",
            value: "CLOSED",
          },
          {
            ownerId: eventLocationId,
            namespace: APP_NAMESPACE,
            key: EVENT_METAFIELDS.closedAt,
            type: "date_time",
            value: new Date().toISOString(),
          },
        ],
      },
    },
  );
  const metafieldsJson = await metafieldsResponse.json();
  const metafieldErrors = metafieldsJson.data?.metafieldsSet?.userErrors ?? [];
  if (metafieldErrors.length) {
    throw new Error(`Stock was returned, but closing the event failed: ${metafieldErrors.map((e: any) => e.message).join("; ")}`);
  }

  const deactivateResponse = await admin.graphql(
    `#graphql
      mutation DeactivateLocation($locationId: ID!, $destinationLocationId: ID) {
        locationDeactivate(locationId: $locationId, destinationLocationId: $destinationLocationId) {
          location { id isActive }
          locationDeactivateUserErrors { field message }
        }
      }`,
    { variables: { locationId: eventLocationId, destinationLocationId: central.id } },
  );
  const deactivateJson = await deactivateResponse.json();
  const deactivateErrors = deactivateJson.data?.locationDeactivate?.locationDeactivateUserErrors ?? [];
  if (deactivateErrors.length) {
    throw new Error(`Event was closed, but the location could not be deactivated: ${deactivateErrors.map((e: any) => e.message).join("; ")}`);
  }
}
