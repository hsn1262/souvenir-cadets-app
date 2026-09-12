// Locations are the backbone of the Events rebuild (Phase 3), but Central
// Inventory (Phase 2) needs one to exist first — every stock quantity in
// Shopify is always "quantity of X at location Y", there's no such thing
// as stock with no location. This is that one, always-on location.

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { CENTRAL_LOCATION_NAME } from "../lib/constants";

export async function findLocationByName(admin: AdminApiContext, name: string) {
  const response = await admin.graphql(
    `#graphql
      query FindLocation($query: String!) {
        locations(first: 5, query: $query) {
          edges { node { id name isActive } }
        }
      }`,
    { variables: { query: `name:'${name}'` } },
  );
  const json = await response.json();
  const edges = json.data?.locations?.edges ?? [];
  return edges[0]?.node ?? null;
}

// Best-effort default so locationAdd's required address doesn't block
// setup — merchants can correct the real address afterwards from Shopify
// Admin's own Settings > Locations screen, same as any other location.
async function shopDefaultCountry(admin: AdminApiContext): Promise<string> {
  const response = await admin.graphql(
    `#graphql
      query ShopCountry {
        shop { billingAddress { countryCodeV2 } }
      }`,
  );
  const json = await response.json();
  return json.data?.shop?.billingAddress?.countryCodeV2 ?? "BD";
}

export async function ensureCentralLocation(admin: AdminApiContext) {
  const existing = await findLocationByName(admin, CENTRAL_LOCATION_NAME);
  if (existing) return existing as { id: string; name: string; isActive: boolean };

  const countryCode = await shopDefaultCountry(admin);
  const response = await admin.graphql(
    `#graphql
      mutation CreateCentralLocation($input: LocationAddInput!) {
        locationAdd(input: $input) {
          location { id name isActive }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        input: {
          name: CENTRAL_LOCATION_NAME,
          address: { countryCode },
          fulfillsOnlineOrders: false,
        },
      },
    },
  );
  const json = await response.json();
  const errors = json.data?.locationAdd?.userErrors ?? [];
  if (errors.length) {
    throw new Error(`Could not create Central Inventory location: ${errors.map((e: any) => e.message).join("; ")}`);
  }
  return json.data.locationAdd.location as { id: string; name: string; isActive: boolean };
}
