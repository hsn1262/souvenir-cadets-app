// Central Inventory: Products, Variants, InventoryItems/Levels, and the
// 8-field spec metafields. This is the direct replacement for the
// Inventory sheet + saveProductCatalog()/getInventoryData()/
// resetSingleProductStock()/deleteMultipleProducts() in Code.gs.

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { APP_NAMESPACE, SPEC_FIELDS } from "../lib/constants";
import { ensureCentralLocation } from "./locations.server";
import { uploadProductImageFromDataUrl } from "./media.server";

export type VariationInput = {
  label: string; // e.g. "Small", "Blue" — becomes the option value
  sku: string;
  price: string; // decimal string, e.g. "250.00"
  costRate: string; // decimal string
  stock: number; // initial quantity at the Central location
};

export type SpecFieldInput = Record<string, { enabled: boolean; value: string }>;

export type CreateProductInput = {
  title: string;
  productType: string;
  descriptionHtml?: string;
  variations: VariationInput[]; // at least one — a single entry means "no real variation"
  specs: SpecFieldInput;
  imageDataUrl?: string | null;
  imageFilename?: string | null;
};

const PRODUCT_LIST_QUERY = `#graphql
  query InventoryList($cursor: String, $query: String) {
    products(first: 25, after: $cursor, query: $query, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          status
          productType
          featuredMedia { preview { image { url altText } } }
          totalInventory
          variantsCount { count }
        }
      }
    }
  }`;

export async function listProducts(
  admin: AdminApiContext,
  opts: { cursor?: string; search?: string } = {},
) {
  const response = await admin.graphql(PRODUCT_LIST_QUERY, {
    variables: {
      cursor: opts.cursor ?? null,
      query: opts.search ? `title:*${opts.search}*` : null,
    },
  });
  const json = await response.json();
  return json.data.products as {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: { node: any }[];
  };
}

const PRODUCT_DETAIL_QUERY = `#graphql
  query InventoryDetail($id: ID!) {
    product(id: $id) {
      id
      title
      status
      productType
      descriptionHtml
      featuredMedia { preview { image { url altText } } }
      metafields(namespace: "${APP_NAMESPACE}", first: 20) {
        edges { node { key value } }
      }
      variants(first: 50) {
        edges {
          node {
            id
            title
            sku
            price
            selectedOptions { name value }
            inventoryItem {
              id
              unitCost { amount }
              inventoryLevels(first: 5) {
                edges { node { location { id name } quantities(names: ["available"]) { name quantity } } }
              }
            }
          }
        }
      }
    }
  }`;

export async function getProduct(admin: AdminApiContext, id: string) {
  const response = await admin.graphql(PRODUCT_DETAIL_QUERY, { variables: { id } });
  const json = await response.json();
  return json.data.product;
}

function specMetafields(specs: SpecFieldInput) {
  const metafields: { namespace: string; key: string; type: string; value: string }[] = [];
  for (const field of SPEC_FIELDS) {
    const entry = specs[field.key];
    metafields.push({
      namespace: APP_NAMESPACE,
      key: `${field.key}_enabled`,
      type: "boolean",
      value: entry?.enabled ? "true" : "false",
    });
    metafields.push({
      namespace: APP_NAMESPACE,
      key: `${field.key}_value`,
      type: "single_line_text_field",
      value: entry?.value ?? "",
    });
  }
  return metafields;
}

// Creates a product with one option ("Variation") whose values are the
// given variation labels. Shopify auto-generates one variant per value
// when productOptions is supplied; we then fill in SKU/price/cost/stock
// with productVariantsBulkUpdate + inventorySetQuantities.
export async function createProduct(admin: AdminApiContext, input: CreateProductInput) {
  const central = await ensureCentralLocation(admin);
  const hasRealVariations = input.variations.length > 1;

  const productInput: Record<string, unknown> = {
    title: input.title,
    productType: input.productType,
    descriptionHtml: input.descriptionHtml ?? "",
    status: "ACTIVE",
    metafields: specMetafields(input.specs),
  };
  if (hasRealVariations) {
    productInput.productOptions = [
      {
        name: "Variation",
        values: input.variations.map((v) => ({ name: v.label })),
      },
    ];
  }

  const createResponse = await admin.graphql(
    `#graphql
      mutation CreateProduct($product: ProductInput!) {
        productCreate(product: $product) {
          product {
            id
            variants(first: 50) { edges { node { id selectedOptions { name value } } } }
          }
          userErrors { field message }
        }
      }`,
    { variables: { product: productInput } },
  );
  const createJson = await createResponse.json();
  const createErrors = createJson.data?.productCreate?.userErrors ?? [];
  if (createErrors.length) {
    throw new Error(`Could not create product: ${createErrors.map((e: any) => e.message).join("; ")}`);
  }
  const product = createJson.data.productCreate.product;
  const productId = product.id as string;

  // Map each auto-created variant back to the VariationInput it corresponds
  // to, by matching the "Variation" option value we asked Shopify to use.
  const createdVariants = product.variants.edges.map((e: any) => e.node) as {
    id: string;
    selectedOptions: { name: string; value: string }[];
  }[];

  const bulkVariantInputs = input.variations.map((variation, index) => {
    const matchedVariant = hasRealVariations
      ? createdVariants.find((v) =>
          v.selectedOptions.some((o) => o.name === "Variation" && o.value === variation.label),
        )
      : createdVariants[0];
    if (!matchedVariant) {
      throw new Error(`Could not match variant for "${variation.label}" after creation.`);
    }
    return {
      id: matchedVariant.id,
      price: variation.price,
      barcode: variation.sku,
      inventoryItem: {
        sku: variation.sku,
        tracked: true,
        cost: variation.costRate || undefined,
      },
    };
  });

  const updateResponse = await admin.graphql(
    `#graphql
      mutation UpdateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id inventoryItem { id } }
          userErrors { field message }
        }
      }`,
    { variables: { productId, variants: bulkVariantInputs } },
  );
  const updateJson = await updateResponse.json();
  const updateErrors = updateJson.data?.productVariantsBulkUpdate?.userErrors ?? [];
  if (updateErrors.length) {
    throw new Error(`Could not set variant price/SKU/cost: ${updateErrors.map((e: any) => e.message).join("; ")}`);
  }
  const updatedVariants = updateJson.data.productVariantsBulkUpdate.productVariants as {
    id: string;
    inventoryItem: { id: string };
  }[];

  // Seed initial stock at the Central location, one call for the whole batch.
  const quantities = updatedVariants.map((v, index) => ({
    inventoryItemId: v.inventoryItem.id,
    locationId: central.id,
    quantity: input.variations[index]?.stock ?? 0,
  }));
  const stockResponse = await admin.graphql(
    `#graphql
      mutation SeedStock($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        input: {
          reason: "correction",
          name: "available",
          referenceDocumentUri: `gid://cadets-app/ProductCreate/${productId.split("/").pop()}`,
          quantities,
        },
      },
    },
  );
  const stockJson = await stockResponse.json();
  const stockErrors = stockJson.data?.inventorySetQuantities?.userErrors ?? [];
  if (stockErrors.length) {
    throw new Error(`Product was created, but seeding stock failed: ${stockErrors.map((e: any) => e.message).join("; ")}`);
  }

  if (input.imageDataUrl) {
    await uploadProductImageFromDataUrl(
      admin,
      productId,
      input.imageDataUrl,
      input.imageFilename || "product.jpg",
    );
  }

  return { productId };
}

// Replaces resetSingleProductStock() / updateStockLevel(). Sets the
// available quantity at the Central location directly (an absolute value,
// same as the sheet's Inventory.Stock column) rather than a delta.
export async function setCentralStock(
  admin: AdminApiContext,
  inventoryItemId: string,
  quantity: number,
) {
  const central = await ensureCentralLocation(admin);
  const response = await admin.graphql(
    `#graphql
      mutation SetStock($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        input: {
          reason: "correction",
          name: "available",
          referenceDocumentUri: `gid://cadets-app/StockAdjust/${Date.now()}`,
          quantities: [{ inventoryItemId, locationId: central.id, quantity }],
        },
      },
    },
  );
  const json = await response.json();
  const errors = json.data?.inventorySetQuantities?.userErrors ?? [];
  if (errors.length) {
    throw new Error(`Could not update stock: ${errors.map((e: any) => e.message).join("; ")}`);
  }
}

// Replaces deleteMultipleProducts(). Archiving is offered as the safer
// default in the UI (keeps sale history queryable); this performs an
// actual delete for when the merchant explicitly asks for it.
export async function deleteProducts(admin: AdminApiContext, productIds: string[]) {
  const results = [];
  for (const id of productIds) {
    const response = await admin.graphql(
      `#graphql
        mutation DeleteProduct($input: ProductDeleteInput!) {
          productDelete(input: $input) {
            deletedProductId
            userErrors { field message }
          }
        }`,
      { variables: { input: { id } } },
    );
    const json = await response.json();
    results.push({ id, errors: json.data?.productDelete?.userErrors ?? [] });
  }
  return results;
}
