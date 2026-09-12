import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Thumbnail,
  Badge,
  Divider,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getProduct, setCentralStock, deleteProducts } from "../models/inventory.server";
import { isManager, getActingStaffMember } from "../models/roles.server";
import { SPEC_FIELDS } from "../lib/constants";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const staff = getActingStaffMember(session);
  const manager = await isManager(session.shop, staff?.gid);

  const product = await getProduct(admin, `gid://shopify/Product/${params.id}`);
  if (!product) throw new Response("Product not found", { status: 404 });

  const metafields = new Map<string, string>(
    (product.metafields?.edges ?? []).map((e: any) => [e.node.key as string, e.node.value as string]),
  );
  const specs = SPEC_FIELDS.map((field) => ({
    ...field,
    enabled: metafields.get(`${field.key}_enabled`) === "true",
    value: metafields.get(`${field.key}_value`) ?? "",
  }));

  const variants = product.variants.edges.map((e: any) => {
    const node = e.node;
    const level = node.inventoryItem.inventoryLevels.edges[0]?.node;
    const available = level?.quantities?.find((q: any) => q.name === "available")?.quantity ?? 0;
    return {
      id: node.id,
      title: node.title,
      sku: node.sku,
      price: node.price,
      unitCost: node.inventoryItem.unitCost?.amount ?? null,
      inventoryItemId: node.inventoryItem.id,
      locationName: level?.location?.name ?? "—",
      available,
    };
  });

  return { product, specs, variants, manager };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const staff = getActingStaffMember(session);
  const manager = await isManager(session.shop, staff?.gid);

  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "updateStock") {
    const inventoryItemId = String(form.get("inventoryItemId"));
    const quantity = Number(form.get("quantity"));
    await setCentralStock(admin, inventoryItemId, quantity);
    return { ok: true };
  }

  if (intent === "archive") {
    if (!manager) return { error: "Only a Manager can delete a product." };
    await deleteProducts(admin, [`gid://shopify/Product/${params.id}`]);
    return redirect("/app/inventory");
  }

  return { error: "Unknown action." };
};

export default function ProductDetail() {
  const { product, specs, variants, manager } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>(
    Object.fromEntries(variants.map((v: (typeof variants)[number]) => [v.id, String(v.available)])),
  );

  useEffect(() => {
    if (fetcher.data && "ok" in fetcher.data) shopify.toast.show("Saved");
    if (fetcher.data && "error" in fetcher.data) shopify.toast.show(fetcher.data.error as string, { isError: true });
  }, [fetcher.data, shopify]);

  const saveStock = (variant: (typeof variants)[number]) => {
    fetcher.submit(
      {
        intent: "updateStock",
        inventoryItemId: variant.inventoryItemId,
        quantity: stockDrafts[variant.id],
      },
      { method: "POST" },
    );
  };

  const archive = () => {
    if (!confirm(`Delete "${product.title}"? This can't be undone.`)) return;
    fetcher.submit({ intent: "archive" }, { method: "POST" });
  };

  return (
    <Page>
      <TitleBar title={product.title}>
        <button onClick={() => navigate("/app/inventory")}>Back</button>
        {manager && (
          <button tone="critical" onClick={archive}>
            Delete product
          </button>
        )}
      </TitleBar>
      <BlockStack gap="400">
        <Card>
          <InlineStack gap="400" blockAlign="start">
            <Thumbnail
              source={product.featuredMedia?.preview?.image?.url ?? ""}
              alt={product.title}
              size="large"
            />
            <BlockStack gap="150">
              <Text as="h2" variant="headingMd">
                {product.title}
              </Text>
              <InlineStack gap="200">
                <Badge tone={product.status === "ACTIVE" ? "success" : undefined}>{product.status}</Badge>
                {product.productType && <Badge>{product.productType}</Badge>}
              </InlineStack>
            </BlockStack>
          </InlineStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Variants &amp; stock (Central Inventory)
            </Text>
            {variants.map((variant: (typeof variants)[number], i: number) => (
              <BlockStack gap="200" key={variant.id}>
                {i > 0 && <Divider />}
                <InlineStack gap="300" wrap blockAlign="end">
                  <Text as="span" fontWeight="semibold">
                    {variant.title === "Default Title" ? "Default" : variant.title}
                  </Text>
                  <Text as="span" tone="subdued">
                    SKU {variant.sku || "—"} · ৳{variant.price}
                    {variant.unitCost ? ` · cost ৳${variant.unitCost}` : ""}
                  </Text>
                  <div style={{ minWidth: 140 }}>
                    <TextField
                      label={`Stock at ${variant.locationName}`}
                      labelHidden
                      type="number"
                      value={stockDrafts[variant.id]}
                      onChange={(v) => setStockDrafts((prev) => ({ ...prev, [variant.id]: v }))}
                      autoComplete="off"
                    />
                  </div>
                  <Button onClick={() => saveStock(variant)}>Update stock</Button>
                </InlineStack>
              </BlockStack>
            ))}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Specs
            </Text>
            {specs
              .filter((s) => s.enabled)
              .map((s) => (
                <InlineStack gap="200" key={s.key} align="space-between">
                  <Text as="span" tone="subdued">
                    {s.label}
                  </Text>
                  <Text as="span">{s.value || "—"}</Text>
                </InlineStack>
              ))}
            {specs.every((s) => !s.enabled) && (
              <Text as="p" tone="subdued">
                No spec fields enabled for this product.
              </Text>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
