import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams, useSubmit } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Thumbnail,
  Badge,
  Button,
  EmptySearchResult,
  TextField,
  Pagination,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { listProducts, deleteProducts } from "../models/inventory.server";
import { isManager, getActingStaffMember } from "../models/roles.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q") ?? "";
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const staff = getActingStaffMember(session);
  const manager = await isManager(session.shop, staff?.gid);
  const products = await listProducts(admin, { search, cursor });

  return { products, search, manager };
};

// Replaces deleteMultipleProducts(rowIndexes, pin) — the PIN check becomes
// a Manager-role check against the acting staff member's real identity.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const staff = getActingStaffMember(session);
  const manager = await isManager(session.shop, staff?.gid);
  if (!manager) return { error: "Only a Manager can delete products." };

  const form = await request.formData();
  const ids = form.getAll("ids").map(String);
  const results = await deleteProducts(admin, ids);
  const failed = results.filter((r) => r.errors.length);
  if (failed.length) {
    return { error: `${failed.length} product(s) could not be deleted.` };
  }
  return { ok: true };
};

export default function InventoryList() {
  const { products, search, manager } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(search);
  const [selected, setSelected] = useState<string[]>([]);
  const navigate = useNavigate();
  const submit = useSubmit();

  const runSearch = useCallback(
    (value: string) => {
      setQuery(value);
      const next = new URLSearchParams(params);
      if (value) next.set("q", value);
      else next.delete("q");
      next.delete("cursor");
      setParams(next);
    },
    [params, setParams],
  );

  const rows = products.edges.map((e: any) => e.node);

  const deleteSelected = () => {
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} product(s)? This can't be undone.`)) return;
    const form = new FormData();
    selected.forEach((id) => form.append("ids", id));
    submit(form, { method: "POST" });
    setSelected([]);
  };

  return (
    <Page>
      <TitleBar title="Central Inventory">
        <button variant="primary" onClick={() => navigate("/app/inventory/new")}>
          Add product
        </button>
      </TitleBar>
      <BlockStack gap="400">
        <Card padding="0">
          <div style={{ padding: 16 }}>
            <InlineStack gap="300" align="space-between">
              <div style={{ minWidth: 320 }}>
                <TextField
                  label="Search products"
                  labelHidden
                  placeholder="Search by title"
                  value={query}
                  onChange={runSearch}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => runSearch("")}
                />
              </div>
              {manager && selected.length > 0 && (
                <Button tone="critical" onClick={deleteSelected}>
                  {`Delete ${selected.length} selected`}
                </Button>
              )}
            </InlineStack>
          </div>
          <IndexTable
            resourceName={{ singular: "product", plural: "products" }}
            itemCount={rows.length}
            selectedItemsCount={selected.length}
            onSelectionChange={(_, isSelected, id) => {
              if (id === undefined) return;
              setSelected((prev) =>
                isSelected ? [...prev, id as string] : prev.filter((s) => s !== id),
              );
            }}
            headings={[
              { title: "" },
              { title: "Title" },
              { title: "Type" },
              { title: "Variants" },
              { title: "Total stock" },
              { title: "Status" },
            ]}
            emptyState={
              <EmptySearchResult
                title="No products yet"
                description="Add your first catalogue item to get started."
                withIllustration
              />
            }
          >
            {rows.map((product: any, index: number) => (
              <IndexTable.Row
                id={product.id}
                key={product.id}
                position={index}
                selected={selected.includes(product.id)}
                onClick={() => navigate(`/app/inventory/${product.id.split("/").pop()}`)}
              >
                <IndexTable.Cell>
                  <Thumbnail
                    source={product.featuredMedia?.preview?.image?.url ?? ""}
                    alt={product.featuredMedia?.preview?.image?.altText ?? product.title}
                    size="small"
                  />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">
                    {product.title}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{product.productType || "—"}</IndexTable.Cell>
                <IndexTable.Cell>{product.variantsCount?.count ?? 1}</IndexTable.Cell>
                <IndexTable.Cell>{product.totalInventory}</IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={product.status === "ACTIVE" ? "success" : undefined}>
                    {product.status}
                  </Badge>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
          <div style={{ padding: 16, display: "flex", justifyContent: "center" }}>
            <Pagination
              hasNext={products.pageInfo.hasNextPage}
              onNext={() => {
                const next = new URLSearchParams(params);
                next.set("cursor", products.pageInfo.endCursor ?? "");
                setParams(next);
              }}
            />
          </div>
        </Card>
      </BlockStack>
    </Page>
  );
}
