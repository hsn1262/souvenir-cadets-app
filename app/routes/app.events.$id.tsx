import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { useEffect, useState, useCallback } from "react";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Badge,
  Banner,
  IndexTable,
  EmptySearchResult,
  Pagination,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getEvent, listAllocatable, allocateToEvent, closeEvent } from "../models/events.server";
import { isManager, getActingStaffMember } from "../models/roles.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q") ?? "";
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const staff = getActingStaffMember(session);
  const manager = await isManager(session.shop, staff?.gid);

  const eventId = `gid://shopify/Location/${params.id}`;
  const event = await getEvent(admin, eventId);
  if (!event) throw new Response("Event not found", { status: 404 });

  const { variants, pageInfo } =
    event.status === "OPEN" ? await listAllocatable(admin, eventId, { search, cursor }) : { variants: [], pageInfo: { hasNextPage: false, endCursor: null } };

  return { event, variants, pageInfo, search, manager };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const staff = getActingStaffMember(session);
  const manager = await isManager(session.shop, staff?.gid);

  const eventId = `gid://shopify/Location/${params.id}`;
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "allocate") {
    const inventoryItemId = String(form.get("inventoryItemId"));
    const quantity = Number(form.get("quantity"));
    if (!quantity || quantity <= 0) return { error: "Enter a quantity greater than zero." };
    try {
      await allocateToEvent(admin, eventId, inventoryItemId, quantity);
    } catch (err: any) {
      return { error: err.message || "Could not allocate stock." };
    }
    return { ok: true, closed: false };
  }

  if (intent === "close") {
    if (!manager) return { error: "Only a Manager can close an event." };
    try {
      await closeEvent(admin, eventId);
    } catch (err: any) {
      return { error: err.message || "Could not close the event." };
    }
    return { ok: true, closed: true };
  }

  return { error: "Unknown action." };
};

export default function EventDetail() {
  const { event, variants, pageInfo, search, manager } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(search);
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    if (fetcher.data && "ok" in fetcher.data) {
      shopify.toast.show(fetcher.data.closed ? "Event closed — stock returned to Central" : "Stock allocated");
    }
    if (fetcher.data && "error" in fetcher.data) {
      shopify.toast.show(fetcher.data.error as string, { isError: true });
    }
  }, [fetcher.data, shopify]);

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

  const allocate = (variant: (typeof variants)[number]) => {
    const quantity = quantities[variant.variantId];
    fetcher.submit(
      { intent: "allocate", inventoryItemId: variant.inventoryItemId, quantity: quantity ?? "0" },
      { method: "POST" },
    );
  };

  const closeThisEvent = () => {
    if (!confirm(`Close "${event.name}"? Any remaining allocated stock will be returned to Central Inventory.`)) {
      return;
    }
    fetcher.submit({ intent: "close" }, { method: "POST" });
  };

  return (
    <Page>
      <TitleBar title={event.name}>
        <button onClick={() => navigate("/app/events")}>Back</button>
        {event.status === "OPEN" && (
          <button tone="critical" disabled={!manager} onClick={closeThisEvent}>
            Close event
          </button>
        )}
      </TitleBar>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <InlineStack gap="200" align="space-between">
              <Text as="h2" variant="headingMd">
                {event.name}
              </Text>
              <Badge tone={event.status === "OPEN" ? "success" : undefined}>
                {event.status === "OPEN" ? "Open" : "Closed"}
              </Badge>
            </InlineStack>
            <Text as="p" tone="subdued">
              {event.dateFrom ?? "—"} to {event.dateTo ?? "—"}
            </Text>
            {event.status === "OPEN" && !manager && (
              <Text as="p" variant="bodySm" tone="subdued">
                Only a Manager can close this event.
              </Text>
            )}
          </BlockStack>
        </Card>

        {event.status === "CLOSED" ? (
          <Banner tone="info" title="This event is closed">
            <p>
              All remaining allocated stock was returned to Central Inventory{event.closedAt ? ` on ${event.closedAt.slice(0, 10)}` : ""}.
              The Location has been deactivated.
            </p>
          </Banner>
        ) : (
          <Card padding="0">
            <div style={{ padding: 16 }}>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Allocate stock
                </Text>
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
              </BlockStack>
            </div>
            <IndexTable
              resourceName={{ singular: "variant", plural: "variants" }}
              itemCount={variants.length}
              selectable={false}
              headings={[
                { title: "Product" },
                { title: "SKU" },
                { title: "Available at Central" },
                { title: "Allocated here" },
                { title: "Quantity" },
                { title: "" },
              ]}
              emptyState={
                <EmptySearchResult
                  title="Nothing to allocate"
                  description="No products with stock at Central Inventory matched your search."
                  withIllustration
                />
              }
            >
              {variants.map((variant, index) => (
                <IndexTable.Row id={variant.variantId} key={variant.variantId} position={index}>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">
                      {variant.productTitle}
                      {variant.variantTitle ? ` — ${variant.variantTitle}` : ""}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{variant.sku || "—"}</IndexTable.Cell>
                  <IndexTable.Cell>{variant.availableAtCentral}</IndexTable.Cell>
                  <IndexTable.Cell>{variant.allocatedHere}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <div style={{ minWidth: 100 }}>
                      <TextField
                        label="Quantity"
                        labelHidden
                        type="number"
                        value={quantities[variant.variantId] ?? ""}
                        onChange={(v) => setQuantities((prev) => ({ ...prev, [variant.variantId]: v }))}
                        autoComplete="off"
                      />
                    </div>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Button
                      size="slim"
                      disabled={variant.availableAtCentral <= 0}
                      onClick={() => allocate(variant)}
                    >
                      Allocate
                    </Button>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
            <div style={{ padding: 16, display: "flex", justifyContent: "center" }}>
              <Pagination
                hasNext={pageInfo.hasNextPage}
                onNext={() => {
                  const next = new URLSearchParams(params);
                  next.set("cursor", pageInfo.endCursor ?? "");
                  setParams(next);
                }}
              />
            </div>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
